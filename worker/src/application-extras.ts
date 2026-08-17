import type { KVNamespace } from '@cloudflare/workers-types'
import { cacheKey } from './blocks.js'
import { sendChatCompletion, type LLMChain } from './llm.js'
import { stripCodeFence } from './tailored-resume.js'
import { APPLICATION_EXTRAS_TOKENS } from './constants.js'
import { getContactProfile, renderStandardFields, type ContactProfile } from './contact.js'

const CACHE_TTL_SECONDS = 86400 // 24h

export interface ApplicationExtrasRequest {
  job_title: string
  company: string
  description: string
  /** The tailored résumé for this job — grounds the extras in what was actually sent. */
  resume_markdown: string
  /** The JOB's location (city/region as posted) — without it the kit answers
   *  location questions from the candidate's own location and reads tone-deaf
   *  on hybrid/onsite roles elsewhere. Optional for caller compatibility. */
  job_location?: string
  /** The job's workplace type as posted: remote | hybrid | onsite | unknown. */
  workplace_type?: string
}

export interface ScreeningAnswer {
  q: string
  a: string
}

export interface ApplicationExtras {
  /**
   * The cover letter, produced in the same call as the rest of the kit. Folding
   * it in here (rather than a separate /cover-letter request) removes one LLM
   * call from a cold packet, so the extras can't fail independently after the
   * cover letter has already succeeded — the two share one call and one retry.
   */
  cover_letter_markdown: string
  /** Short outreach note to a recruiter or hiring manager. */
  intro_email: string
  /** 2-3 sentences on why this company/role — reused in the email and form fields. */
  why_hook: string
  /** Pre-drafted answers to the questions applications ask over and over. */
  screening_answers: ScreeningAnswer[]
  /** Expected-comp line for the salary field. */
  salary_line: string
  /** LinkedIn connection note, ≤300 chars. */
  linkedin_note: string
  /** 3-5 bullets for the recruiter phone screen. */
  talking_points: string[]
}

export interface ApplicationExtrasResponse extends ApplicationExtras {
  /** Deterministic copy-paste block for the boring repeated form fields. */
  standard_fields: string
  /** Raw contact profile, so the UI can offer any single field on its own. */
  contact: ContactProfile
  cached: boolean
}

// The JD can be long; the extras only need the gist. Cap it so a huge posting
// can't push this single call over Groq's per-minute token budget (the same
// lesson the tailored-resume selector learned the hard way).
const JD_CHARS = 3000
// The résumé is already condensed to what matters for this role; still cap it so
// an unusually long tailored résumé stays within budget.
const RESUME_CHARS = 4000

function cap(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

/**
 * One LLM call → the full non-résumé half of an application kit. Grounded in the
 * owner's contact profile (for truthful salary/auth/relocation answers) and the
 * tailored résumé (so talking points and screening answers match what was sent).
 * The standard-fields block is assembled deterministically, not generated.
 */
export async function generateApplicationExtras(
  client: LLMChain,
  kv: KVNamespace,
  req: ApplicationExtrasRequest
): Promise<ApplicationExtrasResponse> {
  const { job_title, company, description, resume_markdown, job_location, workplace_type } = req

  const contact = await getContactProfile(kv)
  if (!contact) {
    throw new Error('Contact profile not configured (resume:profile:contact missing from KV)')
  }
  const standard_fields = renderStandardFields(contact)

  // Cache keyed by job + the contact profile, so editing the profile busts it.
  // Location fields are part of the key: a caller that starts sending them must
  // not be served a location-blind kit generated before they existed.
  const key = await cacheKey(
    'resume:extras',
    job_title,
    company,
    description,
    JSON.stringify(contact),
    job_location ?? '',
    workplace_type ?? ''
  )
  const hit = await kv.get(key)
  if (hit) {
    const cachedExtras = JSON.parse(hit) as ApplicationExtras
    return { ...cachedExtras, standard_fields, contact, cached: true }
  }

  const prompt = `You are preparing everything a candidate needs to apply for a job, besides the résumé itself — including the cover letter. Produce it as one JSON object.

Candidate facts (use verbatim where relevant — never invent or contradict these):
- Name: ${contact.name}
- Location: ${contact.location}
- Work authorization: ${contact.work_auth}
- Relocation / remote: ${contact.relocation}
- Target compensation: ${contact.salary_line}

Job: ${job_title} at ${company}
Job location: ${job_location || 'not stated in the posting'} (workplace type: ${workplace_type || 'not stated'})

Location rule: every location-related statement in the kit — cover letter, screening answers, availability — must be consistent with THIS job's location/workplace type above and the candidate's relocation/remote stance. If the job is hybrid or onsite outside the candidate's area, address it honestly using the relocation fact (e.g. openness to relocation or the stated remote preference); never imply the candidate is local to the job's city unless their location fact says so, and never answer as if the job were remote when it isn't.

Job description:
${cap(description, JD_CHARS)}

The candidate's tailored résumé for this role:
${cap(resume_markdown, RESUME_CHARS)}

Return ONLY a JSON object with exactly these keys, no preamble, no markdown fence:
{
  "cover_letter_markdown": "A tailored cover letter in markdown, exactly 3 paragraphs — (1) why this company/role specifically, referencing something genuine about their work; (2) what the candidate brings, connecting the most relevant résumé experience to what the role needs; (3) a brief, confident close. Conversational but professional; no placeholders.",
  "intro_email": "A short (100-140 word) outreach email to a recruiter or hiring manager. Confident, human, specific to this role. No subject line, no placeholders like [Name] — sign it as ${contact.name}.",
  "why_hook": "2-3 sentences on why this company/role specifically, grounded in something real about their work or the role. Reusable in a form field.",
  "screening_answers": [
    {"q": "Why are you interested in this role?", "a": "..."},
    {"q": "Why do you want to work here?", "a": "..."},
    {"q": "Tell us about a relevant project.", "a": "..."},
    {"q": "What are your greatest strengths for this role?", "a": "..."},
    {"q": "Do you require visa sponsorship?", "a": "Answer directly from the work-authorization fact above."},
    {"q": "What is your availability / notice period?", "a": "Two weeks' notice; available to start promptly."}
  ],
  "salary_line": "The expected-comp answer for a salary field. Base it on the target-compensation fact above, phrased as an affirmative target, not an ultimatum.",
  "linkedin_note": "A LinkedIn connection note to the recruiter, MAXIMUM 300 characters.",
  "talking_points": ["3 to 5 short bullets for a recruiter phone screen — concrete, résumé-grounded strengths for THIS role."]
}

Keep every answer truthful to the résumé and the candidate facts. Do not fabricate employers, dates, or metrics.`

  const response = await sendChatCompletion(client, [{ role: 'user', content: prompt }], {
    maxTokens: APPLICATION_EXTRAS_TOKENS,
    temperature: 0.5
  })

  let parsed: Partial<ApplicationExtras>
  try {
    parsed = JSON.parse(stripCodeFence(response.message)) as Partial<ApplicationExtras>
  } catch {
    throw new Error(
      `Application-extras returned unparseable response: ${response.message.slice(0, 300)}`
    )
  }

  // Normalise: the model occasionally omits a key or returns a string where an
  // array belongs. Fall back to sane values (and the deterministic salary line)
  // rather than 500ing on a shape wobble.
  const extras: ApplicationExtras = {
    cover_letter_markdown:
      typeof parsed.cover_letter_markdown === 'string'
        ? stripCodeFence(parsed.cover_letter_markdown)
        : '',
    intro_email: typeof parsed.intro_email === 'string' ? parsed.intro_email : '',
    why_hook: typeof parsed.why_hook === 'string' ? parsed.why_hook : '',
    screening_answers: Array.isArray(parsed.screening_answers)
      ? parsed.screening_answers.filter(
          (x): x is ScreeningAnswer => !!x && typeof x.q === 'string' && typeof x.a === 'string'
        )
      : [],
    salary_line:
      typeof parsed.salary_line === 'string' && parsed.salary_line.trim()
        ? parsed.salary_line
        : contact.salary_line,
    linkedin_note:
      typeof parsed.linkedin_note === 'string' ? parsed.linkedin_note.slice(0, 300) : '',
    talking_points: Array.isArray(parsed.talking_points)
      ? parsed.talking_points.filter((x): x is string => typeof x === 'string')
      : []
  }

  await kv.put(key, JSON.stringify(extras), { expirationTtl: CACHE_TTL_SECONDS })
  return { ...extras, standard_fields, contact, cached: false }
}
