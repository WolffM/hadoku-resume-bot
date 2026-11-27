/**
 * Fit a non-owner résumé onto a page budget.
 *
 * The owner's résumé has its own fixed three-page skeleton. Everyone else's is
 * held to GENERIC_MAX_PAGES (two pages: the norm for most applications) by
 * condensing it step by step until it fits, measured with the same typesetter
 * that renders the PDF:
 *
 * 1. Skills written as a bullet list become one line-wrapped paragraph
 *    (nothing is lost, only line breaks).
 * 2. Bullets per job are capped by recency: the latest job keeps the most,
 *    older jobs fewer, the oldest come down to one or two.
 * 3. Optional sections (hackathons, awards, anything outside the standard
 *    set) and certifications are shortened, and as a last resort the optional
 *    sections are dropped.
 *
 * Every job heading, employer line, date and the education section always
 * stay: employment history is never tailored away, only its bullets. Each job
 * keeps its first bullets, so the tailoring pass orders them by relevance.
 */

export const GENERIC_MAX_PAGES = 2

/** Sections whose `#` heading marks them as work history (one entry per job). */
const EXPERIENCE_HEADINGS = new Set(['experience', 'additional experience', 'work experience'])
/** Standard sections that are never shortened or dropped. */
const STANDARD_HEADINGS = new Set([
  'summary',
  'experience',
  'additional experience',
  'work experience',
  'projects',
  'skills',
  'education',
  'languages',
  'certifications'
])

interface Section {
  /** Lowercased heading text, or '' for the preamble (name and contact). */
  name: string
  lines: string[]
}

interface Step {
  mergeSkills: boolean
  /** Bullets kept per job, by recency rank; the last value repeats. Null: no cap. */
  roleCaps: number[] | null
  /** Bullets kept in each optional section. Null: no cap. */
  extraCap: number | null
  certCap: number | null
  dropExtra: boolean
}

const NONE: Step = {
  mergeSkills: false,
  roleCaps: null,
  extraCap: null,
  certCap: null,
  dropExtra: false
}

/** Each step condenses more than the one before; the first that fits wins. */
const LADDER: Step[] = [
  NONE,
  { ...NONE, mergeSkills: true },
  { ...NONE, mergeSkills: true, roleCaps: [6, 5, 3, 2] },
  { ...NONE, mergeSkills: true, roleCaps: [6, 4, 3, 2], extraCap: 3 },
  { ...NONE, mergeSkills: true, roleCaps: [5, 4, 2, 1], extraCap: 3, certCap: 4 },
  { ...NONE, mergeSkills: true, roleCaps: [5, 3, 2, 1], extraCap: 2, certCap: 3 },
  { ...NONE, mergeSkills: true, roleCaps: [4, 3, 2, 1], extraCap: 2, certCap: 3 },
  { ...NONE, mergeSkills: true, roleCaps: [4, 3, 2, 1], certCap: 3, dropExtra: true },
  { ...NONE, mergeSkills: true, roleCaps: [3, 2, 1], certCap: 2, dropExtra: true },
  { ...NONE, mergeSkills: true, roleCaps: [2, 1], certCap: 2, dropExtra: true }
]

const BULLET = /^[-*] /
const ENTRY_HEADING = /^#{2,3} /

function splitSections(markdown: string): Section[] {
  const sections: Section[] = [{ name: '', lines: [] }]
  for (const line of markdown.split('\n')) {
    const h = /^# (.+)$/.exec(line)
    if (h) sections.push({ name: h[1].trim().toLowerCase(), lines: [line] })
    else sections[sections.length - 1].lines.push(line)
  }
  return sections
}

/** Keep the first `cap` bullet lines; never end on a lead-in like "Projects included:". */
function capBullets(lines: string[], cap: number): string[] {
  const bulletIdx = lines.flatMap((l, i) => (BULLET.test(l) ? [i] : []))
  if (bulletIdx.length <= cap) return lines
  let keep = new Set(bulletIdx.slice(0, cap))
  const last = bulletIdx[cap - 1]
  if (cap > 0 && lines[last].trimEnd().endsWith(':')) keep = new Set(bulletIdx.slice(0, cap - 1))
  return lines.filter((l, i) => !BULLET.test(l) || keep.has(i))
}

/** Cap bullets per job inside one experience section; `rank` continues across sections. */
function capRoles(lines: string[], caps: number[], rank: { n: number }): string[] {
  const out: string[] = []
  let entry: string[] = []
  let entryRank: number | null = null
  const flush = () => {
    if (entryRank === null) out.push(...entry)
    else out.push(...capBullets(entry, caps[Math.min(entryRank, caps.length - 1)]))
    entry = []
  }
  for (const line of lines) {
    if (ENTRY_HEADING.test(line)) {
      flush()
      entryRank = rank.n++
    }
    entry.push(line)
  }
  flush()
  return out
}

/** "- a\n- b\n- c" in the skills section becomes "a · b · c". Other lines stay. */
function mergeSkillBullets(lines: string[]): string[] {
  const items = lines.filter(l => BULLET.test(l)).map(l => l.replace(BULLET, '').trim())
  if (items.length < 2) return lines
  const out: string[] = []
  let placed = false
  for (const line of lines) {
    if (!BULLET.test(line)) out.push(line)
    else if (!placed) {
      out.push(items.join(' · '))
      placed = true
    }
  }
  return out
}

function applyStep(sections: Section[], step: Step): string {
  const rank = { n: 0 }
  const out: string[] = []
  for (const { name, lines } of sections) {
    const optional = name !== '' && !STANDARD_HEADINGS.has(name)
    if (optional && step.dropExtra) continue
    let next = lines
    if (EXPERIENCE_HEADINGS.has(name) && step.roleCaps) next = capRoles(next, step.roleCaps, rank)
    if (name === 'skills' && step.mergeSkills) next = mergeSkillBullets(next)
    if (name === 'certifications' && step.certCap !== null) next = capBullets(next, step.certCap)
    if (optional && step.extraCap !== null) next = capBullets(next, step.extraCap)
    out.push(...next)
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * The least-condensed version of `markdown` that `countPages` puts on at most
 * `maxPages` pages. Unchanged when it already fits; the most condensed version
 * when nothing does.
 */
export function fitResumeToPages(
  markdown: string,
  maxPages: number,
  countPages: (markdown: string) => number
): { markdown: string; pages: number; condensed: boolean } {
  const sections = splitSections(markdown)
  let candidate = markdown
  let pages = countPages(markdown)
  if (pages <= maxPages) return { markdown, pages, condensed: false }
  for (const step of LADDER.slice(1)) {
    candidate = applyStep(sections, step)
    pages = countPages(candidate)
    if (pages <= maxPages) break
  }
  return { markdown: candidate, pages, condensed: true }
}
