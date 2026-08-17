import type { KVNamespace } from '@cloudflare/workers-types'
import { getAllBlocks, cacheKey, type ResumeBlock } from './blocks.js'
import { assembleResume, countPageBreaks, ALWAYS_TAG, PAGE_BREAK_MARKER } from './skeleton.js'
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
- Select experience and project blocks most relevant to this specific role
- Prefer the most role-relevant variant when multiple variants of the same experience exist (e.g. prefer ml-tagged over generic for an ML role)
- Project blocks carry a "tier:N" tag (tier:1 = most impressive overall, tier:3 = least). Relevance to THIS role comes first — a strongly role-relevant tier:3 project beats an irrelevant tier:1 one — but when two projects are similarly relevant, prefer the lower-numbered (more impressive) tier.
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

  // Pass 2: optional tailoring
  if (tailor) {
    const tailoringPrompt = `You are tailoring a resume for a specific job application. Rewrite the bullet points in the experience and project sections to better emphasize skills and impact relevant to this role. Keep all facts strictly accurate — adjust emphasis and phrasing only, never invent achievements or change dates.

The resume contains \`${PAGE_BREAK_MARKER}\` marker lines that force page breaks. Keep every one of them, verbatim and on its own line, in the same position. Do not add, remove, or move content across them.

Job: ${job_title} at ${company}
Description:
${description}

Resume to tailor:
${resumeMarkdown}

Return only the full rewritten resume markdown, no preamble or explanation.`

    const tailoredResponse = await sendChatCompletion(
      client,
      [{ role: 'user', content: tailoringPrompt }],
      { maxTokens: TAILORED_RESUME_TOKENS.TAILORING }
    )

    const tailored = normalizeTypography(stripCodeFence(tailoredResponse.message))
    // Only trust the rewrite if it preserved the page structure. If the LLM
    // dropped markers, keep the deterministic skeleton assembly rather than
    // ship a variant whose pages fall wherever length lands.
    if (countPageBreaks(tailored) === expectedBreaks) {
      resumeMarkdown = tailored
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
