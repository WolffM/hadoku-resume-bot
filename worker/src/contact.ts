import type { KVNamespace } from '@cloudflare/workers-types'
import { OWNER_SCOPE, scopeKeys, type ContentScope } from './scope.js'
import { paperForLocation, type Paper } from './paper.js'

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

/** Thrown when a user-scoped generator needs a contact profile the user has not stored. */
export class NoContactProfileError extends Error {
  readonly code = 'NO_CONTACT_PROFILE'
  constructor() {
    super('Contact profile not configured for this user. Store one first (PUT /contact-profile).')
    this.name = 'NoContactProfileError'
  }
}

/** The owner's at CONTACT_KEY; a user's at `resume:profile:contact:<userId>`. */
export async function getContactProfile(
  kv: KVNamespace,
  scope: ContentScope = OWNER_SCOPE
): Promise<ContactProfile | null> {
  const json = await kv.get(scopeKeys(scope).contact)
  return json ? (JSON.parse(json) as ContactProfile) : null
}

/**
 * The paper a scope's PDFs are set on: Letter for the owner (unchanged),
 * otherwise from the user's contact location (A4 unless US or Canada).
 */
export async function paperFor(kv: KVNamespace, scope: ContentScope): Promise<Paper> {
  if (scope.kind === 'owner') return 'letter'
  return paperForLocation((await getContactProfile(kv, scope))?.location)
}

export async function putContactProfile(
  kv: KVNamespace,
  profile: ContactProfile,
  scope: ContentScope
): Promise<void> {
  if (scope.kind === 'owner') throw new Error("refusing to overwrite the owner's contact profile")
  await kv.put(scopeKeys(scope).contact, JSON.stringify(profile))
}

const CONTACT_FIELDS = [
  'name',
  'email',
  'phone',
  'linkedin',
  'github',
  'location',
  'work_auth',
  'relocation',
  'salary_line'
] as const satisfies readonly (keyof ContactProfile)[]

/** Longest value kept per field; anything longer is cut, not rejected. */
const MAX_CONTACT_FIELD_CHARS = 300

/**
 * An untrusted contact object, made safe to store: only the known fields, each
 * a trimmed string (missing becomes ''), each capped. Returns null when there
 * is no name, since every generated answer signs with it.
 */
export function sanitizeContact(raw: unknown): ContactProfile | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const out = {} as ContactProfile
  for (const f of CONTACT_FIELDS) {
    const v = r[f]
    out[f] = typeof v === 'string' ? v.trim().slice(0, MAX_CONTACT_FIELD_CHARS) : ''
  }
  return out.name ? out : null
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
