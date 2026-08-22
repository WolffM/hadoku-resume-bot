import type { KVNamespace } from '@cloudflare/workers-types'
import { getAllBlocks, cacheKey, type ResumeBlock } from './blocks.js'
import {
  assembleResume,
  countPageBreaks,
  projectsAnchorText,
  restoreProjectsAnchor,
  ALWAYS_TAG,
  PAGE_BREAK_MARKER
} from './skeleton.js'
import { sendChatCompletion, type LLMChain } from './llm.js'
import { normalizeTypography } from './typography.js'
import { TAILORED_RESUME_TOKENS, SELECTION_BUDGET } from './constants.js'

const CACHE_TTL_SECONDS = 86400 // 24h

/**
 * LLMs sometimes wrap their entire response in a ```` ```markdown … ``` ```` code
 * fence, which makes ReactMarkdown render the whole document as a `<pre><code>`
 * block instead of formatted markdown. Unwrap only when the ENTIRE output is a
 * single fenced block (leading fence + matching trailing fence) so we never
 * clobber a legitimate embedded code block.
 */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const match = /^```[^\n]*\n([\s\S]*)\n```$/.exec(trimmed)
  return match ? match[1].trim() : trimmed
}

export interface TailoredResumeRequest {
  job_title: string
  company: string
  description: string
  profile_type?: string
  tailor?: boolean
}

export interface TailoredResumeResponse {
  resume_markdown: string
  blocks_used: string[]
  cached: boolean
}

export async function generateTailoredResume(
  client: LLMChain,
  kv: KVNamespace,
  req: TailoredResumeRequest
): Promise<TailoredResumeResponse> {
  const { job_title, company, description, profile_type, tailor = true } = req

  const key = await cacheKey('resume:tailored', job_title, company, description)
  const hit = await kv.get(key)
  if (hit) {
    const result = JSON.parse(hit) as TailoredResumeResponse
    return { ...result, cached: true }
  }

  const blocks = await getAllBlocks(kv)
  if (blocks.length === 0) {
    throw new Error('No resume blocks found in KV storage')
  }

  // Pass 1: block selection. Send only enough of each block to judge RELEVANCE
  // (id + type + tags + title + a snippet) — the FULL content is used at
  // assembly below. The request MUST fit the tightest provider limit (Groq 8k
  // TPM counts prompt + max_tokens; Cerebras free tier caps context at 8k), and
  // a 413 here is deterministic — the same palette + JD fails every retry — so
  // the prompt is shrunk to fit before sending: snippets degrade first (tags +
  // title carry most of the routing signal), then the JD slice. This is what
  // broke at 57 blocks with a fixed 200-char snippet (~8.3k-token prompts).
  const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s)
  const buildPrompt = (snippetChars: number, jdChars: number): string => {
    const blockSummaries = blocks
      .map(
        b =>
          `ID: ${b.id}\nType: ${b.type}\nTags: ${b.tags.join(', ')}\nTitle: ${b.title}` +
          (snippetChars > 0 ? `\n---\n${truncate(b.content, snippetChars)}` : '')
      )
      .join('\n\n')
    // The selector needs the gist of the posting, not every word — pass 2 gets
    // the full description.
    const jdForSelection = truncate(description, jdChars)

    const profileHint = profile_type
      ? `\nProfile preference: "${profile_type}" — prefer blocks tagged with this, but include cross-tag blocks where genuinely relevant (e.g. a Staff ML role will usually want a leadership block too).`
      : ''

    return `You are assembling a tailored resume for a job application. Select the most relevant resume blocks and return their IDs in the order they should appear.${profileHint}

Job: ${job_title} at ${company}
Description:
${jdForSelection}

Available blocks:
${blockSummaries}

Rules:
- Always include the header block if present
- Always include the education block if present
- Always include the additional-experience (non-Microsoft employment) block if present: employment history should be complete, not tailored away
- Select experience and project blocks most relevant to this specific role
- Prefer the most role-relevant variant when multiple variants of the same experience exist (e.g. prefer ml-tagged over generic for an ML role)
- Project blocks carry a "tier:N" tag reflecting the owner's own ranking (tier:1 = flagship, tier:3 = least). tier:1 projects are default-include: drop one only when it is clearly irrelevant to this specific role AND its slot is needed for a more role-relevant project. When space is tight, cut tier:3 before tier:2 before tier:1. A strongly role-relevant tier:2/3 project may replace the LEAST-relevant tier:1 project, never several of them.
- Aim for 6-7 project blocks (plus the platform-anchor project block). Fewer wastes the projects page; more overflows it.
- Select at most ONE block from each "variant:<group>" tag group (e.g. only one summary, and either the Microsoft rollup or its level-history blocks — never both).
- Never select a rollup block AND its constituent detail blocks together; their bullets would duplicate.
- Respond with ONLY a valid JSON array of block IDs, nothing else. Example: ["header", "exp_microsoft_se2", "skills_ml"]`
  }

  const { MAX_REQUEST_TOKENS, CHARS_PER_TOKEN, LADDER } = SELECTION_BUDGET
  const estimateTokens = (s: string) => Math.ceil(s.length / CHARS_PER_TOKEN)
  const fits = (prompt: string) =>
    estimateTokens(prompt) + TAILORED_RESUME_TOKENS.SELECTION <= MAX_REQUEST_TOKENS
  let selectionPrompt = buildPrompt(LADDER[0][0], LADDER[0][1])
  for (const [snippetChars, jdChars] of LADDER) {
    selectionPrompt = buildPrompt(snippetChars, jdChars)
    if (fits(selectionPrompt)) break
  }
  // Even the barest rung (tags/title only) can theoretically overflow if the
  // palette grows huge — fail with a diagnosable message instead of a 413.
  if (!fits(selectionPrompt)) {
    throw new Error(
      `Selection prompt cannot fit the provider token budget even without snippets ` +
        `(${estimateTokens(selectionPrompt)} est. tokens, budget ${MAX_REQUEST_TOKENS}); ` +
        `the block palette (${blocks.length} blocks) is too large for single-pass selection`
    )
  }

  const selectionResponse = await sendChatCompletion(
    client,
    [{ role: 'user', content: selectionPrompt }],
    { maxTokens: TAILORED_RESUME_TOKENS.SELECTION, temperature: 0.1 }
  )

  let selectedIds: string[]
  try {
    const parsed = JSON.parse(selectionResponse.message) as unknown
    if (!Array.isArray(parsed)) throw new Error('Response was not a JSON array')
    selectedIds = parsed.filter((id): id is string => typeof id === 'string')
  } catch {
    throw new Error(`Block selection returned unparseable response: ${selectionResponse.message}`)
  }

  // Validate IDs against actual index — LLMs hallucinate
  const validIds = new Set(blocks.map(b => b.id))
  selectedIds = selectedIds.filter(id => validIds.has(id))
  if (selectedIds.length === 0) {
    throw new Error('Block selection returned no valid block IDs after validation')
  }

  // Variant groups are mutually exclusive (one summary, rollup XOR its detail
  // blocks). The prompt asks for this, but enforce it here too: keep the first
  // selected member of each group — the selector returns most-relevant-first.
  const variantOf = new Map(
    blocks.map(b => [b.id, b.tags.find(t => t.startsWith('variant:'))] as const)
  )
  const seenVariants = new Set<string>()
  selectedIds = selectedIds.filter(id => {
    const variant = variantOf.get(id)
    if (!variant) return true
    if (seenVariants.has(variant)) return false
    seenVariants.add(variant)
    return true
  })

  // Project floor. The prompt asks for 6-7 project blocks with tier:1 as
  // default-include, but the selection model routinely under-picks when the JD
  // pulls its attention elsewhere (observed: 3 projects for an infra role).
  // Same principle as the variant-group rule above: enforce here too. The
  // model's per-job picks all stay; the strongest unselected projects (owner
  // tier first, then priority) top up the shortfall, so page 2 never runs
  // half-empty and flagship projects aren't silently dropped. Nothing is
  // pinned: a genuinely relevant selection of 6+ is left exactly as returned.
  const PROJECT_FLOOR = 6
  const isProject = (b: ResumeBlock) => b.tags.includes('section:projects') || b.type === 'project'
  const tierOf = (b: ResumeBlock): number => {
    const tag = b.tags.find(t => t.startsWith('tier:'))
    const n = tag ? Number(tag.slice('tier:'.length)) : NaN
    return Number.isFinite(n) ? n : 3
  }
  const selectedNow = new Set(selectedIds)
  // The anchor (always-tagged) is structural, not one of the 6-7 app blocks.
  const pickedProjects = blocks.filter(
    b => selectedNow.has(b.id) && isProject(b) && !b.tags.includes(ALWAYS_TAG)
  )
  if (pickedProjects.length < PROJECT_FLOOR) {
    const topUp = blocks
      .filter(b => !selectedNow.has(b.id) && isProject(b) && !b.tags.includes(ALWAYS_TAG))
      .sort((a, b) => tierOf(a) - tierOf(b) || b.priority - a.priority)
      .slice(0, PROJECT_FLOOR - pickedProjects.length)
    for (const b of topUp) selectedIds.push(b.id)
  }

  // Page-1 budget. Page 1 is header + summary + Microsoft, and the résumé must
  // stay 3 pages (docs/resume-structure.md). The condensed `ms-headline` rollup
  // carries a variant: tag, but the ~20 DETAILED Microsoft blocks carry none, so
  // the dedup above cannot stop the selector taking five of them: observed 4,133
  // chars of experience where the rollup is 1,631, pushing the résumé to 4 pages.
  // Trim lowest-priority detail blocks until page 1 fits, keeping at least one
  // (a bulletless employer header would be worse than a slightly long page).
  // Budget measured by rendering, not guessed: the canonical résumé's 2,460-char
  // page 1 renders in 3 pages, 2,750 chars spills to a 4th. 2,500 is the largest
  // verified-good size, so it admits a canonical-density page 1 and trims past it.
  const PAGE1_CHAR_BUDGET = 2500
  const onPage1 = (b: ResumeBlock) => {
    const tag = b.tags.find(t => t.startsWith('section:'))
    const section = tag ? tag.slice('section:'.length) : null
    if (section)
      return section === 'header' || section === 'summary' || section === 'experience-primary'
    return b.type === 'header' || b.type === 'summary' || b.type === 'experience'
  }
  const page1Len = (ids: Set<string>) =>
    blocks.filter(b => ids.has(b.id) && onPage1(b)).reduce((n, b) => n + b.content.length, 0)
  let page1Set = new Set(selectedIds)
  if (page1Len(page1Set) > PAGE1_CHAR_BUDGET) {
    const trimmable = blocks
      .filter(b => page1Set.has(b.id) && onPage1(b) && !b.tags.includes(ALWAYS_TAG))
      .sort((a, b) => a.priority - b.priority || b.content.length - a.content.length)
    for (const b of trimmable) {
      if (trimmable.filter(t => page1Set.has(t.id)).length <= 1) break
      if (page1Len(page1Set) <= PAGE1_CHAR_BUDGET) break
      page1Set.delete(b.id)
    }
    selectedIds = selectedIds.filter(id => page1Set.has(id))
  }

  // Blocks tagged `always` are guaranteed inclusion regardless of the
  // selector's answer — dropping one loses structural content (the header,
  // the projects anchor). Position is irrelevant: assembleResume ignores
  // caller order.
  const selectedSet = new Set(selectedIds)
  for (const b of blocks) {
    if (b.tags.includes(ALWAYS_TAG) && !selectedSet.has(b.id)) selectedIds.push(b.id)
  }

  const blockById = new Map(blocks.map(b => [b.id, b]))
  const selectedBlocks = selectedIds
    .map(id => blockById.get(id))
    .filter((b): b is ResumeBlock => b !== undefined)

  // Assemble along the fixed skeleton: the selector's ordering is ignored, the
  // skeleton buckets blocks into sections and inserts page-break markers so a
  // tailored résumé has the same three-page structure as the canonical one.
  let resumeMarkdown = assembleResume(selectedBlocks)
  const expectedBreaks = countPageBreaks(resumeMarkdown)

  // Pass 2: optional tailoring. Two hard rules learned in production:
  //
  // 1. The prompt must fit the same provider budget as pass 1 — a full JD on
  //    top of the assembled résumé blew Groq's 8k request cap on every posting
  //    over ~10k chars, deterministically. The JD slice gets whatever budget
  //    remains after the instructions + résumé (its opening carries the
  //    responsibilities/qualifications the rewrite actually needs).
  // 2. Tailoring is POLISH, never load-bearing: any pass-2 failure — over
  //    budget, provider error, dropped page markers — falls back to the
  //    deterministic skeleton assembly instead of failing the request.
  if (tailor) {
    const buildTailoringPrompt = (jd: string) =>
      `You are tailoring a resume for a specific job application. Rewrite the bullet points in the experience and project sections to better emphasize skills and impact relevant to this role. Keep all facts strictly accurate — adjust emphasis and phrasing only, never invent achievements or change dates.

The resume contains \`${PAGE_BREAK_MARKER}\` marker lines that force page breaks. Keep every one of them, verbatim and on its own line, in the same position. Do not add, remove, or move content across them.

The paragraph immediately after the "# Projects" heading is a platform overview with independently verified figures — reproduce it character-for-character, do not rewrite it. Keep all number formatting exactly as written: "3,800" never "3 800", "74%" never "74 %", "84k" never "84 k". Never use em dashes anywhere; use commas, colons, or hyphens instead.

Job: ${job_title} at ${company}
Description:
${jd}

Resume to tailor:
${resumeMarkdown}

Return only the full rewritten resume markdown, no preamble or explanation.`

    const promptOverhead = estimateTokens(buildTailoringPrompt(''))
    const jdBudgetTokens = MAX_REQUEST_TOKENS - TAILORED_RESUME_TOKENS.TAILORING - promptOverhead
    const jdChars = Math.floor(jdBudgetTokens * CHARS_PER_TOKEN)

    // A résumé so long the JD gets no meaningful budget means tailoring would
    // be flying blind — keep the deterministic assembly instead.
    if (jdChars >= 500) {
      try {
        const tailoredResponse = await sendChatCompletion(
          client,
          [{ role: 'user', content: buildTailoringPrompt(truncate(description, jdChars)) }],
          { maxTokens: TAILORED_RESUME_TOKENS.TAILORING }
        )

        const tailored = normalizeTypography(stripCodeFence(tailoredResponse.message))
        // Only trust the rewrite if it preserved the page structure. If the LLM
        // dropped markers, keep the deterministic skeleton assembly rather than
        // ship a variant whose pages fall wherever length lands. Either way the
        // projects anchor is restored verbatim — its verified figures are exempt
        // from rewriting no matter what the model did with the instruction.
        if (countPageBreaks(tailored) === expectedBreaks) {
          resumeMarkdown = restoreProjectsAnchor(tailored, projectsAnchorText(selectedBlocks))
        }
      } catch {
        // Deterministic assembly already in resumeMarkdown — ship it untailored.
      }
    }
  }

  const result: TailoredResumeResponse = {
    resume_markdown: resumeMarkdown,
    blocks_used: selectedIds,
    cached: false
  }

  await kv.put(key, JSON.stringify(result), { expirationTtl: CACHE_TTL_SECONDS })
  return result
}
