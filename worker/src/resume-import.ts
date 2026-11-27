/**
 * Turn a pasted résumé (markdown or plain text) into blocks.
 *
 * Deterministic, no LLM: a person's résumé is split along its own headings so
 * every fact in a block is a fact they wrote. The result is a palette for the
 * GENERIC layout (skeleton.ts): a header, a summary, one block per job, skills,
 * education, languages, certifications, and one block per any other section
 * (hackathons, awards, volunteering...), which keeps its own heading.
 *
 * Structural blocks are tagged `always` (tailoring may rephrase them, never drop
 * them); projects and extra sections are optional and left to the selector.
 */
import type { ResumeBlock } from './blocks.js'
import { validateBlock } from './builder.js'
import type { ContactProfile } from './contact.js'

export interface ImportedResume {
  blocks: ResumeBlock[]
  /** What could be read off the header. Fields not found are ''. */
  contact: ContactProfile
}

/** Longest résumé accepted, in characters: several times a long CV. */
export const MAX_RESUME_CHARS = 60_000
const MAX_BLOCKS = 60
const MAX_BLOCK_CHARS = 12_000

type SectionKind =
  | 'summary'
  | 'experience'
  | 'projects'
  | 'skills'
  | 'education'
  | 'languages'
  | 'certifications'
  | 'extra'

/** Which kind of section a heading names. Order matters: first match wins. */
export function classifyHeading(heading: string): SectionKind {
  const h = heading.toLowerCase()
  if (/\blanguages?\b/.test(h) && !/programming/.test(h)) return 'languages'
  if (/certif|licen[cs]e|courses|training/.test(h) && !/education/.test(h)) return 'certifications'
  if (/summary|profile|about me|^about$|objective|overview/.test(h)) return 'summary'
  if (/volunteer/.test(h)) return 'extra'
  if (/experience|employment|work history|career history|positions held/.test(h)) {
    return 'experience'
  }
  if (/project/.test(h)) return 'projects'
  if (/skill|competenc|expertise|tools|technolog|software|tech stack|programming/.test(h)) {
    return 'skills'
  }
  if (/education|academic|degree|qualification|studies/.test(h)) return 'education'
  return 'extra'
}

/** Words a plain-text heading line is recognised by. */
const KNOWN_HEADING =
  /^(professional |career |executive |personal )?(summary|profile|about me|objective|overview|(work |professional |relevant )?experience|employment( history)?|work history|career history|(key |selected |personal )?projects|(key |core |technical )?skills|(core )?competencies|expertise|tools|software|education|academic background|languages?|certifications?|licen[cs]es|courses|training|awards|honou?rs|publications|volunteering|volunteer experience|hackathons|interests|achievements)$/i

const MD_HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/

interface Heading {
  line: number
  level: number
  text: string
}

function cleanHeadingText(text: string): string {
  return text
    .replace(/^\*\*(.*)\*\*$/, '$1')
    .replace(/:$/, '')
    .trim()
}

/** ALL-CAPS headings read as shouting in a rendered résumé: "HACKATHONS" -> "Hackathons". */
function displayHeading(text: string): string {
  if (text !== text.toUpperCase() || !/[A-Z]/.test(text)) return text
  return text.toLowerCase().replace(/(^|[\s/&(-])([a-z])/g, (_m, p: string, c: string) => {
    return p + c.toUpperCase()
  })
}

function plainHeading(line: string): string | null {
  const t = cleanHeadingText(line.trim())
  if (!t || t.length > 50) return null
  return KNOWN_HEADING.test(t) ? t : null
}

/** "Jane Doe" in a plain-text résumé: a short first line that is not contact data. */
function looksLikeName(line: string): boolean {
  const t = line.trim()
  return (
    t.length > 0 &&
    t.length <= 60 &&
    !/[@\d]|https?:|www\.|linkedin/i.test(t) &&
    plainHeading(t) === null
  )
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const PHONE = /\+?\d[\d\s().-]{6,}\d/
const LINKEDIN = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/[^\s|,;)]+/i
const GITHUB = /(?:https?:\/\/)?github\.com\/[^\s|,;)]+/i

/** Read contact fields off the lines between the name and the first section. */
export function parseContact(name: string, preamble: string[]): ContactProfile {
  const text = preamble.join('\n')
  const contact: ContactProfile = {
    name,
    email: EMAIL.exec(text)?.[0] ?? '',
    phone: PHONE.exec(text.replace(EMAIL, ' '))?.[0].trim() ?? '',
    linkedin: LINKEDIN.exec(text)?.[0] ?? '',
    github: GITHUB.exec(text)?.[0] ?? '',
    location: '',
    work_auth: '',
    relocation: '',
    salary_line: ''
  }
  // Location: the first separator-delimited piece that is none of the above.
  for (const line of preamble) {
    for (const raw of line.split(/\s+[-|•·–]\s+|\s{2,}|\s*\|\s*/)) {
      const part = raw.replace(/[*_]/g, '').trim()
      if (!part || EMAIL.test(part) || LINKEDIN.test(part) || GITHUB.test(part)) continue
      if (/https?:|www\./i.test(part)) continue
      if (PHONE.test(part) && part.replace(/\D/g, '').length >= 7) continue
      if (/[A-Za-z]/.test(part) && part.length <= 60) {
        contact.location = part
        return contact
      }
    }
  }
  return contact
}

const NESTED_BULLET = /^\s+[-*•]\s+/

/**
 * Nested bullets flatten to top-level ones: the PDF typesetter renders one
 * level. Items under a lead-in bullet ("- Projects included:") join onto that
 * bullet instead ("- Projects included: A; B; C"), so they read as one point
 * and a page-fitting cap on bullets cannot keep the lead-in without its items.
 */
function normalizeBody(lines: string[]): string {
  const out: string[] = []
  let leadIn = -1
  for (const raw of lines.map(l => l.replace(/\s+$/, ''))) {
    if (NESTED_BULLET.test(raw) && leadIn >= 0) {
      const item = raw.replace(NESTED_BULLET, '')
      out[leadIn] += out[leadIn].endsWith(':') ? ` ${item}` : `; ${item}`
      continue
    }
    const line = raw.replace(NESTED_BULLET, '- ').replace(/^[•]\s+/, '- ')
    leadIn = /^[-*] .*:$/.test(line) && !NESTED_BULLET.test(raw) ? out.length : -1
    out.push(line)
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const DATE_RANGE =
  /((19|20)\d{2}|\d{1,2}\/(19|20)\d{2}).{0,20}(present|current|now|today|heute|(19|20)\d{2})/i

/**
 * Split a section into entries (one per job or project). Markdown: on the
 * level below the section heading. Plain text: on a non-bullet line carrying a
 * date range that follows a blank line. One entry means it was not splittable.
 */
function splitEntries(
  lines: string[],
  entryLevel: number | null
): { heading: string | null; body: string[] }[] {
  const entries: { heading: string | null; body: string[] }[] = []
  let current: { heading: string | null; body: string[] } = { heading: null, body: [] }
  const push = () => {
    if (current.heading !== null || current.body.some(l => l.trim())) entries.push(current)
  }
  lines.forEach((line, i) => {
    const md = MD_HEADING.exec(line)
    const isMdEntry = md && entryLevel !== null && md[1].length === entryLevel
    const prevBlank = i === 0 || lines[i - 1].trim() === ''
    const isPlainEntry =
      entryLevel === null && !md && prevBlank && !/^\s*[-*•]/.test(line) && DATE_RANGE.test(line)
    if (isMdEntry || isPlainEntry) {
      push()
      current = { heading: isMdEntry && md ? md[2].trim() : line.trim(), body: [] }
    } else {
      current.body.push(line)
    }
  })
  push()
  return entries
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'section'
  )
}

const STRUCTURAL = ['always', 'canonical']

/**
 * Parse a résumé into blocks plus whatever contact details its header shows.
 * Throws when there is nothing to parse.
 */
export function parseResumeText(input: string): ImportedResume {
  const text = input.replace(/\r\n?/g, '\n').replace(/\t/g, '  ')
  if (!text.trim()) throw new Error('resume text is empty')
  if (text.length > MAX_RESUME_CHARS) {
    throw new Error(`resume text is longer than ${MAX_RESUME_CHARS} characters`)
  }
  const lines = text.split('\n')

  // Headings, markdown first; a résumé with no markdown headings is read as
  // plain text, recognising section names on lines of their own.
  let headings: Heading[] = []
  lines.forEach((line, i) => {
    const m = MD_HEADING.exec(line)
    if (m) headings.push({ line: i, level: m[1].length, text: cleanHeadingText(m[2]) })
  })
  const markdown = headings.length > 0
  if (!markdown) {
    lines.forEach((line, i) => {
      const t = plainHeading(line)
      if (t) headings.push({ line: i, level: 2, text: t })
    })
  }

  // The name: a top-level heading before any section, else the first line.
  const firstContent = lines.findIndex(l => l.trim() !== '')
  let name = ''
  let nameLine = -1
  const top = headings[0]
  if (markdown && top && top.line === firstContent && classifyHeading(top.text) === 'extra') {
    name = top.text
    nameLine = top.line
    headings = headings.slice(1)
  } else if (!markdown && firstContent >= 0 && looksLikeName(lines[firstContent])) {
    name = lines[firstContent].trim()
    nameLine = firstContent
  }
  name = displayHeading(name.replace(/[*_]/g, ''))

  // Section level: the shallowest heading level left. Entries sit one below.
  const sectionLevel = headings.length ? Math.min(...headings.map(h => h.level)) : 2
  const sections = headings.filter(h => h.level === sectionLevel)
  // The header is everything between the name and the first section. With no
  // sections at all, only the lines right under the name (up to a blank line).
  let headerEnd = sections.length ? sections[0].line : lines.length
  if (!sections.length) {
    let i = nameLine + 1
    while (i < lines.length && lines[i].trim() === '') i++
    while (i < lines.length && lines[i].trim() !== '' && i - nameLine <= 3) i++
    headerEnd = i
  }
  const preamble = lines.slice(nameLine + 1, headerEnd).filter(l => l.trim() !== '')
  const contact = parseContact(name, preamble)

  const blocks: ResumeBlock[] = []
  const used = new Set<string>()
  const uniqueId = (base: string) => {
    let id = base
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`
    used.add(id)
    return id
  }
  const add = (
    base: string,
    type: ResumeBlock['type'],
    section: string,
    title: string,
    content: string,
    always: boolean
  ) => {
    if (!content.trim()) return
    const tags = always
      ? [...STRUCTURAL, `section:${section}`]
      : ['canonical', `section:${section}`]
    blocks.push(
      validateBlock({
        id: uniqueId(base),
        type,
        tags,
        title: title.slice(0, 200),
        content: content.slice(0, MAX_BLOCK_CHARS),
        // Higher renders first within a section, so input order is kept.
        priority: 1000 - blocks.length
      })
    )
  }

  if (name || preamble.length) {
    const header = [name ? `# ${name}` : '', preamble.join('  \n')].filter(Boolean).join('\n\n')
    add('header', 'header', 'header', 'Header', header, true)
  }

  let languagesSeen = sections.some(s => classifyHeading(s.text) === 'languages')
  sections.forEach((section, idx) => {
    const end = idx + 1 < sections.length ? sections[idx + 1].line : lines.length
    const bodyLines = lines.slice(section.line + 1, end)
    const kind = classifyHeading(section.text)
    const heading = displayHeading(section.text)

    if (kind === 'experience' || kind === 'projects') {
      const entries = splitEntries(bodyLines, markdown ? sectionLevel + 1 : null)
      const isExp = kind === 'experience'
      for (const entry of entries) {
        const body = normalizeBody(entry.body)
        const content = entry.heading ? `### ${entry.heading}\n${body}`.trim() : body
        add(
          isExp ? 'experience' : 'project',
          isExp ? 'experience' : 'project',
          isExp ? 'experience-primary' : 'projects',
          entry.heading ?? heading,
          content,
          isExp
        )
      }
      return
    }

    let body = normalizeBody(bodyLines)
    if (kind === 'skills' && !languagesSeen) {
      // "Languages: English (C2), German (B1)" inside a skills section gets
      // its own Languages section, which recruiters scan for.
      const m = /^(?:\*\*)?languages?(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.+)$/im.exec(body)
      if (m) {
        body = body
          .replace(m[0], '')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
        add('languages', 'skills', 'languages', 'Languages', m[1].trim(), true)
        languagesSeen = true
      }
    }
    switch (kind) {
      case 'summary':
        add('summary', 'summary', 'summary', heading, body, true)
        break
      case 'skills':
        add('skills', 'skills', 'skills', heading, body, true)
        break
      case 'education':
        add('education', 'education', 'education', heading, body, true)
        break
      case 'languages':
        add('languages', 'skills', 'languages', heading, body, true)
        break
      case 'certifications':
        add('certifications', 'education', 'certifications', heading, body, true)
        break
      default:
        add(`extra-${slug(heading)}`, 'project', 'extra', heading, `# ${heading}\n\n${body}`, false)
    }
  })

  // A résumé with no recognisable sections still becomes something usable:
  // everything after the header as one experience block.
  if (sections.length === 0) {
    const rest = normalizeBody(lines.slice(headerEnd))
    add('experience', 'experience', 'experience-primary', 'Experience', rest, true)
  }

  if (blocks.length === 0) throw new Error('no résumé content found')
  if (blocks.length > MAX_BLOCKS)
    throw new Error(`résumé splits into more than ${MAX_BLOCKS} blocks`)
  return { blocks, contact }
}
