import type { KVNamespace } from '@cloudflare/workers-types'
import { cacheKey } from './blocks.js'
import { type ContactProfile } from './contact.js'
import { OWNER_SCOPE, scopeKeys, type ContentScope } from './scope.js'
import { OPERATION_BUDGET_MS, FORM_ANSWERS_TOKENS } from './constants.js'
import { clip, jobText, postingCharsFor, POSTING_INSTRUCTIONS_RULE } from './job-text.js'
import { sendChatCompletion, type LLMChain, type LLMProvider } from './llm.js'
import { stripCodeFence } from './tailored-resume.js'
import { normalizeTypography } from './typography.js'
import type { ScreeningAnswer } from './application-extras.js'

/**
 * Answers to ONE form's own free-text questions.
 *
 * The kit drafts answers to six questions applications ask over and over, and
 * the apply runner can only use one whose wording matches the form's. A
 * question only this posting asks matched none: Fleetio's "How did you hear
 * about Fleetio and what compelled you to apply?" went to the owner unanswered,
 * while its posting asked applicants to mention "coffee" so it knows they read
 * it (2026-11-23). The runner now sends the labels it could not answer, and
 * they are drafted here with the whole posting in view.
 */

/** The most questions one call drafts; a form with more is not a normal form. */
export const MAX_FORM_QUESTIONS = 25
/** The longest label kept; Greenhouse's longest real ones run ~300 characters. */
export const MAX_QUESTION_CHARS = 500

export interface FormAnswersInput {
  job_title: string
  company: string
  description: string
  resume_markdown: string
  job_location?: string
  workplace_type?: string
  contact: ContactProfile
  questions: string[]
}

// See tailored-resume.ts for why this is 30 days and not 24 hours.
const CACHE_TTL_SECONDS = 2592000

/**
 * One answer per question, in the order asked and under the exact label asked,
 * since the runner matches on that label. An empty answer means "the owner
 * should answer this": the model is told to return one rather than guess.
 */
export async function generateFormAnswers(
  client: LLMChain,
  kv: KVNamespace,
  input: FormAnswersInput,
  deadline: number = Date.now() + OPERATION_BUDGET_MS,
  /** Whose cache the answers live in; `input.contact` is already that scope's. */
  scope: ContentScope = OWNER_SCOPE
): Promise<ScreeningAnswer[]> {
  const { job_title, company, description, resume_markdown, contact, questions } = input
  const key = await cacheKey(
    scopeKeys(scope).cache('form-answers'),
    job_title,
    company,
    description,
    resume_markdown,
    JSON.stringify(contact),
    input.job_location ?? '',
    input.workplace_type ?? '',
    JSON.stringify(questions)
  )
  const hit = await kv.get(key)
  if (hit) return JSON.parse(hit) as ScreeningAnswer[]

  const posting = jobText(description)
  const numbered = questions.map((q, i) => `${i + 1}. ${q}`).join('\n')
  const buildPrompt = (
    jd: string
  ) => `You are filling in the free-text questions on ${contact.name}'s application for a job. Answer as the candidate, in the first person.

Candidate facts (use verbatim where relevant; never invent or contradict these):
- Name: ${contact.name}
- Location: ${contact.location}
- Work authorization: ${contact.work_auth}
- Relocation / remote: ${contact.relocation}
- Target compensation: ${contact.salary_line}

Job: ${job_title} at ${company}
Job location: ${input.job_location || 'not stated in the posting'} (workplace type: ${input.workplace_type || 'not stated'})

The full job posting:
${jd}

The candidate's tailored résumé for this role:
${resume_markdown}

The application form's questions:
${numbered}

Rules:
- Answer each question directly. A question asking for detail gets 2-5 sentences grounded in the résumé; a short factual question gets a short answer.
- Keep everything truthful to the résumé and the candidate facts. Never invent employers, dates, metrics, people or events.
- Asked who referred the candidate, or anything about a person: there is no referral, so answer the way the question says to when there is none (for example "N/A"), or "No" if it gives no such instruction.
- Asked how the candidate heard about the job: they found the posting while searching for roles. Never name a website, event or person.
- Asked for a fact you do not have (an address, a date, a number not in the résumé, a link not given above): return an empty string for that answer. The candidate will answer it themselves.
- ${POSTING_INSTRUCTIONS_RULE} When the posting asks applicants to mention something, put it in the answer about why they are applying, or the closest fit.
- Never use em dashes; use commas, colons, or hyphens instead.

Return ONLY a JSON object, no preamble and no markdown fence, with one answer per question in the same order:
{"answers": ["answer to question 1", "answer to question 2"]}`

  const promptChars = buildPrompt('').length
  const messages = (provider: LLMProvider) => [
    {
      role: 'user' as const,
      content: buildPrompt(
        clip(posting, postingCharsFor(provider, promptChars, FORM_ANSWERS_TOKENS))
      )
    }
  ]
  const response = await sendChatCompletion(client, messages, {
    maxTokens: FORM_ANSWERS_TOKENS,
    temperature: 0.4,
    deadline
  })

  let parsed: { answers?: unknown }
  try {
    parsed = JSON.parse(stripCodeFence(response.message)) as { answers?: unknown }
  } catch {
    throw new Error(`Form answers returned unparseable response: ${response.message.slice(0, 300)}`)
  }
  const raw = Array.isArray(parsed.answers) ? parsed.answers : []
  // Paired by position, under the label as it was SENT: the model restating a
  // question in its own words would break the runner's match.
  const answers = questions.map((q, i) => ({
    q,
    a: typeof raw[i] === 'string' ? normalizeTypography(raw[i]).trim() : ''
  }))

  await kv.put(key, JSON.stringify(answers), { expirationTtl: CACHE_TTL_SECONDS })
  return answers
}

/** The `questions` a caller sent, kept only when well-formed, else undefined. */
export function readQuestions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const questions = value
    .filter((q): q is string => typeof q === 'string' && q.trim() !== '')
    .map(q => q.trim().slice(0, MAX_QUESTION_CHARS))
    .slice(0, MAX_FORM_QUESTIONS)
  return questions.length ? questions : undefined
}
