import type { KVNamespace } from '@cloudflare/workers-types'
import { cacheKey } from './blocks.js'
import { sendChatCompletion, type LLMChain, type LLMProvider } from './llm.js'
import { clip, jobText, postingCharsFor, POSTING_INSTRUCTIONS_RULE } from './job-text.js'
import { normalizeTypography } from './typography.js'
import { COVER_LETTER_TOKENS, OPERATION_BUDGET_MS } from './constants.js'
import { stripCodeFence } from './tailored-resume.js'

// See tailored-resume.ts for why this is 30 days and not 24 hours.
const CACHE_TTL_SECONDS = 2592000 // 30 days

export interface CoverLetterRequest {
  job_title: string
  company: string
  description: string
  tone?: 'formal' | 'conversational'
}

export interface CoverLetterResponse {
  cover_letter_markdown: string
  cached: boolean
}

export async function generateCoverLetter(
  client: LLMChain,
  kv: KVNamespace,
  resumeContent: string,
  req: CoverLetterRequest,
  /** Epoch ms this generation must finish by. See generateTailoredResume. */
  deadline: number = Date.now() + OPERATION_BUDGET_MS
): Promise<CoverLetterResponse> {
  const { job_title, company, description, tone = 'conversational' } = req

  // 'full-posting': letters cached before the posting was sent as text, and
  // with the rule about what a posting asks of the applicant, are retired.
  const key = await cacheKey('resume:coverletter', 'full-posting', job_title, company, description)
  const hit = await kv.get(key)
  if (hit) {
    const result = JSON.parse(hit) as CoverLetterResponse
    return { ...result, cached: true }
  }

  const toneGuidance =
    tone === 'formal'
      ? 'Use formal, professional language throughout.'
      : 'Use a conversational but professional tone — confident, direct, and human. Avoid stiff corporate phrasing.'

  const posting = jobText(description)
  const buildPrompt = (
    jd: string
  ) => `Write a tailored cover letter for a job application. ${toneGuidance}

Structure: exactly 3 paragraphs:
1. Why this company specifically — reference something genuine about their work, mission, or the role itself
2. What I bring — connect my most relevant experience and skills directly to what the role needs
3. Call to action — brief, confident close

Job: ${job_title} at ${company}
Job Description:
${jd}

My Resume:
${resumeContent}

Never use em dashes anywhere; use commas, colons, or hyphens instead.

${POSTING_INSTRUCTIONS_RULE}

Return only the cover letter in markdown, no preamble or explanation.`

  const promptChars = buildPrompt('').length
  const messages = (provider: LLMProvider) => [
    {
      role: 'user' as const,
      content: buildPrompt(
        clip(posting, postingCharsFor(provider, promptChars, COVER_LETTER_TOKENS))
      )
    }
  ]
  const response = await sendChatCompletion(client, messages, {
    maxTokens: COVER_LETTER_TOKENS,
    deadline
  })

  const result: CoverLetterResponse = {
    cover_letter_markdown: normalizeTypography(stripCodeFence(response.message)),
    cached: false
  }

  await kv.put(key, JSON.stringify(result), { expirationTtl: CACHE_TTL_SECONDS })
  return result
}
