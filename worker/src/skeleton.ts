import type { ResumeBlock } from './blocks.js'

/**
 * The résumé is a fixed skeleton of sections in a fixed order, grouped into
 * pages. Tailoring selects WHICH blocks land in each section; it never reorders
 * the skeleton itself. A block's section comes from its `section:<id>` tag
 * (consistent with the story:/layer:/tech: tag conventions); when that tag is
 * absent we fall back to a section derived from the block type, so the assembler
 * still produces correct structure for blocks authored before the tag existed.
 */
export type SectionId =
  | 'header'
  | 'summary'
  | 'experience-primary'
  | 'projects'
  | 'skills'
  | 'experience-secondary'
  | 'education'

/** Sections in render order, top of page 1 to bottom of the last page. */
export const SECTION_ORDER: readonly SectionId[] = [
  'header',
  'summary',
  'experience-primary',
  'projects',
  'skills',
  'experience-secondary',
  'education'
]

/**
 * A hard page break is emitted immediately before each of these sections (when
 * something has already been rendered above). This is what makes the three-page
 * layout deterministic: projects always open page 2, skills always open page 3.
 */
export const PAGE_BREAK_BEFORE: ReadonlySet<SectionId> = new Set(['projects', 'skills'])

/**
 * Sentinel line inserted between page groups. Both renderers recognise it: the
 * PDF typesetter turns it into a forced new page, and the on-screen viewer
 * splits on it and drops in a page-break element. Kept as an HTML comment so it
 * stays invisible if any markdown path ever renders it literally.
 */
export const PAGE_BREAK_MARKER = '<!-- page-break -->'

const SECTION_IDS = new Set<string>(SECTION_ORDER)
const SECTION_TAG_PREFIX = 'section:'

/**
 * Section headings are emitted by the assembler, not carried in block content —
 * a selection can therefore never render a headless section, and no block can
 * duplicate a section heading. Blocks whose content still opens with the
 * section's own heading (pre-migration data) have it stripped at assembly, so
 * code and content can roll out in either order. The header section has no
 * heading: its block is the name/contact line itself.
 */
const SECTION_HEADINGS: Partial<Record<SectionId, string>> = {
  summary: '# Profile',
  'experience-primary': '# Experience',
  projects: '# Projects',
  skills: '# Technical Skills',
  'experience-secondary': '# Additional Experience',
  education: '# Education'
}

/**
 * Page-2 project grouping. Blocks tagged `cat:<id>` render under that
 * category's `###` heading, in this order; blocks without a cat tag (the
 * hadoku.me anchor) render first, before any category heading. A category
 * heading is emitted only when the selection put at least one block in it.
 */
const CATEGORY_TAG_PREFIX = 'cat:'
const CATEGORY_ORDER: ReadonlyArray<{ id: string; heading: string }> = [
  { id: 'ai-agents', heading: '### AI & Agents' },
  { id: 'data-automation', heading: '### Data & Automation' },
  { id: 'apps-games-tools', heading: '### Apps, Games & Tools' }
]

function categoryOf(block: ResumeBlock): string | null {
  const tag = block.tags.find(t => t.startsWith(CATEGORY_TAG_PREFIX))
  return tag ? tag.slice(CATEGORY_TAG_PREFIX.length) : null
}

/** Strip a leading line that duplicates the section heading (plus trailing
 *  blank lines), tolerating pre-migration blocks that still carry it. */
function stripLeadingHeading(content: string, heading: string): string {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== heading) return content
  let start = 1
  while (start < lines.length && lines[start].trim() === '') start++
  return lines.slice(start).join('\n')
}

/**
 * Blocks tagged `canonical` form the default résumé — the curated subset shown
 * at /resume and in the plain PDF. The full block set stays a palette the
 * tailoring pipeline selects from per job; only canonical blocks appear by
 * default, which is what keeps the default résumé to its intended page count.
 */
export const CANONICAL_TAG = 'canonical'

/**
 * Blocks tagged `always` are structural — the header, and heading-carrying
 * blocks like the skills-section opener — and must appear in every tailored
 * variant no matter what the selector returns. Selection treats this as a
 * hard guarantee, not a prompt-level suggestion.
 */
export const ALWAYS_TAG = 'always'

export function filterCanonical(blocks: ResumeBlock[]): ResumeBlock[] {
  return blocks.filter(b => b.tags.includes(CANONICAL_TAG))
}

/** Remove page-break marker lines — for contexts where pages are meaningless
 *  (e.g. the résumé text embedded in the chatbot system prompt). */
export function stripPageBreaks(markdown: string): string {
  return markdown
    .split('\n')
    .filter(line => line.trim() !== PAGE_BREAK_MARKER)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function sectionOf(block: ResumeBlock): SectionId {
  const tag = block.tags.find(t => t.startsWith(SECTION_TAG_PREFIX))
  if (tag) {
    const id = tag.slice(SECTION_TAG_PREFIX.length)
    if (SECTION_IDS.has(id)) return id as SectionId
  }
  switch (block.type) {
    case 'header':
      return 'header'
    case 'summary':
      return 'summary'
    case 'project':
      return 'projects'
    case 'skills':
      return 'skills'
    case 'education':
      return 'education'
    case 'experience':
    default:
      return 'experience-primary'
  }
}

/**
 * Assemble blocks into résumé markdown following the fixed skeleton: bucket by
 * section, drop empty sections, order within a section by priority (descending,
 * stable for ties), and insert PAGE_BREAK_MARKER before each page-opening
 * section.
 *
 * `blocks` may be the full palette (the canonical résumé) or a tailored subset
 * (a per-job variant) — either way the output has the same page structure. The
 * caller's ordering is intentionally ignored; the skeleton decides order.
 */
export function assembleResume(blocks: ResumeBlock[]): string {
  const bySection = new Map<SectionId, ResumeBlock[]>()
  for (const block of blocks) {
    const section = sectionOf(block)
    const group = bySection.get(section)
    if (group) group.push(block)
    else bySection.set(section, [block])
  }

  const parts: string[] = []
  for (const section of SECTION_ORDER) {
    const group = bySection.get(section)
    if (!group || group.length === 0) continue
    // Stable sort: higher priority first, preserving input order within ties.
    const ordered = group
      .map((block, i) => ({ block, i }))
      .sort((a, b) => b.block.priority - a.block.priority || a.i - b.i)
      .map(x => x.block)
    if (parts.length > 0 && PAGE_BREAK_BEFORE.has(section)) parts.push(PAGE_BREAK_MARKER)

    const heading = SECTION_HEADINGS[section]
    if (heading) parts.push(heading)
    const emit = (block: ResumeBlock) =>
      parts.push(heading ? stripLeadingHeading(block.content, heading) : block.content)

    if (section === 'projects') {
      const uncategorized = ordered.filter(b => categoryOf(b) === null)
      for (const block of uncategorized) emit(block)
      for (const { id, heading: catHeading } of CATEGORY_ORDER) {
        const members = ordered.filter(b => categoryOf(b) === id)
        if (members.length === 0) continue
        parts.push(catHeading)
        for (const block of members) emit(block)
      }
      // Categories outside CATEGORY_ORDER still render (after the known ones)
      // rather than silently disappearing.
      const known = new Set(CATEGORY_ORDER.map(c => c.id))
      for (const block of ordered) {
        const cat = categoryOf(block)
        if (cat !== null && !known.has(cat)) emit(block)
      }
    } else {
      for (const block of ordered) emit(block)
    }
  }
  return parts.join('\n\n')
}

/** Count of page-break markers in an assembled document — used to detect that a
 *  tailoring rewrite preserved the skeleton's page structure. */
export function countPageBreaks(markdown: string): number {
  let count = 0
  for (const line of markdown.split('\n')) {
    if (line.trim() === PAGE_BREAK_MARKER) count++
  }
  return count
}
