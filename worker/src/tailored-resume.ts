import type { KVNamespace } from '@cloudflare/workers-types'
import type OpenAI from 'openai'
import { getAllBlocks, cacheKey, type ResumeBlock } from './blocks.js'
import { sendChatCompletion } from './llm.js'
import { TAILORED_RESUME_TOKENS } from './constants.js'

const CACHE_TTL_SECONDS = 86400 // 24h

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
  client: OpenAI,
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

  // Pass 1: block selection
  const blockSummaries = blocks
    .map(
      b =>
        `ID: ${b.id}\nType: ${b.type}\nTags: ${b.tags.join(', ')}\nTitle: ${b.title}\n---\n${b.content}`
    )
    .join('\n\n')

  const profileHint = profile_type
    ? `\nProfile preference: "${profile_type}" — prefer blocks tagged with this, but include cross-tag blocks where genuinely relevant (e.g. a Staff ML role will usually want a leadership block too).`
    : ''

  const selectionPrompt = `You are assembling a tailored resume for a job application. Select the most relevant resume blocks and return their IDs in the order they should appear.${profileHint}

Job: ${job_title} at ${company}
Description:
${description}

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

  let resumeMarkdown = selectedBlocks.map(b => b.content).join('\n\n')

  // Pass 2: optional tailoring
  if (tailor) {
    const tailoringPrompt = `You are tailoring a resume for a specific job application. Rewrite the bullet points in the experience and project sections to better emphasize skills and impact relevant to this role. Keep all facts strictly accurate — adjust emphasis and phrasing only, never invent achievements or change dates.

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

    resumeMarkdown = tailoredResponse.message
  }

  const result: TailoredResumeResponse = {
    resume_markdown: resumeMarkdown,
    blocks_used: selectedIds,
    cached: false
  }

  await kv.put(key, JSON.stringify(result), { expirationTtl: CACHE_TTL_SECONDS })
  return result
}
