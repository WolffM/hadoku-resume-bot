import type { KVNamespace } from '@cloudflare/workers-types'
import { getAllBlocks, cacheKey, type ResumeBlock } from './blocks.js'
import { assembleResume, countPageBreaks, PAGE_BREAK_MARKER } from './skeleton.js'
import { sendChatCompletion, type LLMChain } from './llm.js'
import { normalizeTypography } from './typography.js'
import { TAILORED_RESUME_TOKENS } from './constants.js'

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
  // assembly below. Sending every block's full content blew past Groq's
  // per-minute token limit once the palette grew past ~30 blocks (a 51-block
  // set requested ~9.2k tokens against an 8k TPM cap → 413).
  const SELECT_SNIPPET_CHARS = 200
  const snippet = (s: string) =>
    s.length > SELECT_SNIPPET_CHARS ? `${s.slice(0, SELECT_SNIPPET_CHARS)}…` : s
  const blockSummaries = blocks
    .map(
      b =>
        `ID: ${b.id}\nType: ${b.type}\nTags: ${b.tags.join(', ')}\nTitle: ${b.title}\n---\n${snippet(b.content)}`
    )
    .join('\n\n')

  // The selector needs the gist of the posting, not every word — cap it so a
  // long JD can't push pass 1 back over the token limit. Pass 2 gets the full
  // description.
  const jdForSelection = description.length > 2500 ? `${description.slice(0, 2500)}…` : description

  const profileHint = profile_type
    ? `\nProfile preference: "${profile_type}" — prefer blocks tagged with this, but include cross-tag blocks where genuinely relevant (e.g. a Staff ML role will usually want a leadership block too).`
    : ''

  const selectionPrompt = `You are assembling a tailored resume for a job application. Select the most relevant resume blocks and return their IDs in the order they should appear.${profileHint}

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
- Respond with ONLY a valid JSON array of block IDs, nothing else. Example: ["header", "exp_microsoft_se2", "skills_ml"]`

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
