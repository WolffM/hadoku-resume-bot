import type { KVNamespace } from '@cloudflare/workers-types'

/**
 * The owner's constant application facts — the boring, repeated form fields plus
 * the context the extras generator needs to answer "why us", salary and
 * sponsorship questions truthfully. Filled once, stored in CONTENT_KV under
 * CONTACT_KEY, never regenerated. The résumé header block carries name/email/
 * phone/linkedin too; this is the single place the standard-fields block and the
 * salary/auth answers read from, so the two never drift.
 */
export interface ContactProfile {
  name: string
  email: string
  phone: string
  linkedin: string
  github: string
  location: string
  /** e.g. "US citizen — no sponsorship required" */
  work_auth: string
  /** e.g. "Remote preferred; open to relocation for the right role" */
  relocation: string
  /**
   * The expected-comp line, phrased as an affirmative signal rather than a hard
   * gate — states the target without reading as an ultimatum.
   */
  salary_line: string
}

export const CONTACT_KEY = 'resume:profile:contact'

export async function getContactProfile(kv: KVNamespace): Promise<ContactProfile | null> {
  const json = await kv.get(CONTACT_KEY)
  return json ? (JSON.parse(json) as ContactProfile) : null
}

/**
 * The copy-paste block for the boring repeated fields on an application form.
 * Deterministic — assembled from the contact profile, no LLM involved.
 */
export function renderStandardFields(p: ContactProfile): string {
  return [
    `Name: ${p.name}`,
    `Email: ${p.email}`,
    `Phone: ${p.phone}`,
    `LinkedIn: ${p.linkedin}`,
    `GitHub: ${p.github}`,
    `Location: ${p.location}`,
    `Work authorization: ${p.work_auth}`,
    `Relocation: ${p.relocation}`
  ].join('\n')
}
