import type { KVNamespace } from '@cloudflare/workers-types'
import type OpenAI from 'openai'
import { cacheKey } from './blocks.js'
import { sendChatCompletion } from './llm.js'
import { COVER_LETTER_TOKENS } from './constants.js'

const CACHE_TTL_SECONDS = 86400 // 24h

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
  client: OpenAI,
  kv: KVNamespace,
  resumeContent: string,
  req: CoverLetterRequest
): Promise<CoverLetterResponse> {
  const { job_title, company, description, tone = 'conversational' } = req

  const key = await cacheKey('resume:coverletter', job_title, company, description)
  const hit = await kv.get(key)
  if (hit) {
    const result = JSON.parse(hit) as CoverLetterResponse
    return { ...result, cached: true }
  }

  const toneGuidance =
    tone === 'formal'
      ? 'Use formal, professional language throughout.'
      : 'Use a conversational but professional tone — confident, direct, and human. Avoid stiff corporate phrasing.'

  const prompt = `Write a tailored cover letter for a job application. ${toneGuidance}

Structure: exactly 3 paragraphs:
1. Why this company specifically — reference something genuine about their work, mission, or the role itself
2. What I bring — connect my most relevant experience and skills directly to what the role needs
3. Call to action — brief, confident close

Job: ${job_title} at ${company}
Job Description:
${description}

My Resume:
${resumeContent}

Return only the cover letter in markdown, no preamble or explanation.`

  const response = await sendChatCompletion(client, [{ role: 'user', content: prompt }], {
    maxTokens: COVER_LETTER_TOKENS
  })

  const result: CoverLetterResponse = {
    cover_letter_markdown: response.message,
    cached: false
  }

  await kv.put(key, JSON.stringify(result), { expirationTtl: CACHE_TTL_SECONDS })
  return result
}
