import React, { Children, isValidElement } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Contract with the worker's assembler (worker/src/skeleton.ts): résumé markdown
// carries this sentinel between page groups. react-markdown drops the raw HTML
// comment, so we split on it and render each page as its own sheet with the
// print-only pagebreak element between them.
export const PAGE_BREAK_MARKER = '<!-- page-break -->'

/**
 * The assembler emits one `# Heading` per résumé section (worker/src/skeleton.ts
 * SECTION_HEADINGS). We split on those headings rather than handing the whole
 * document to one ReactMarkdown pass, because the same markdown construct means
 * different things per section — `###` is a job title under Experience and a
 * project category under Projects, and `**bold** …` is a project entry under
 * Projects and a skills row under Technical Skills. Splitting gives each section
 * its own wrapper class, so the stylesheet can say so without heuristics.
 */
interface Section {
  /** Slug of the heading text, or `masthead` for the pre-heading name block. */
  id: string
  /** Heading text; null for the masthead, which is the name/contact line itself. */
  heading: string | null
  body: string
}

const SECTION_HEADING = /^#[^#]\s*(.+?)\s*$/

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function splitSections(page: string): Section[] {
  const sections: Section[] = []
  let current: { id: string; heading: string | null; body: string[] } = {
    id: 'masthead',
    heading: null,
    body: []
  }
  const flush = () => {
    if (current.heading !== null || current.body.join('').trim() !== '') {
      sections.push({ id: current.id, heading: current.heading, body: current.body.join('\n') })
    }
  }
  for (const line of page.split('\n')) {
    const match = SECTION_HEADING.exec(line)
    if (match) {
      flush()
      current = { id: slugify(match[1]), heading: match[1], body: [] }
    } else {
      current.body.push(line)
    }
  }
  flush()
  return sections
}

/**
 * Project entries arrive as `**name** - description ·  [GitHub](…) · [Live](…)`,
 * which renders as one undifferentiated run of text. Two source-level tweaks buy
 * the whole layout: dropping the dash after the name lets the name become its
 * own line without a stray leading hyphen, and dropping the interpuncts before
 * the trailing links lets those links render as chips instead of a dotted tail.
 * Both are presentation-only — the markdown in KV is untouched, and every other
 * consumer (PDF, chat system prompt, .md download) still sees the original.
 */
function prepareProjects(body: string): string {
  return body.replace(/^(\*\*[^*]+\*\*)\s*[-–—]\s+/gm, '$1 ').replace(/\s*·\s*(?=\[)/g, ' ')
}

/**
 * Skills rows are `**Languages:** …`. The colon is a run-in separator in prose;
 * once the label is set as a label on its own line it is just a dangling
 * artefact, so it comes off here rather than in KV — the PDF and the .md
 * download still want it.
 */
function prepareSkills(body: string): string {
  return body.replace(/^(\*\*[^*]+?)\s*:\*\*/gm, '$1**')
}

/**
 * The hast nodes react-markdown hands to component overrides, structurally —
 * spelled out here rather than imported from `hast` so the published .d.ts does
 * not oblige consumers to install @types/hast for a purely internal helper.
 */
interface HastNode {
  type: string
  tagName?: string
  value?: string
  children?: HastNode[]
}

const isSignificant = (node: HastNode) => node.type !== 'text' || (node.value ?? '').trim() !== ''

/** The element's first child, ignoring insignificant whitespace. */
function firstChild(node: HastNode | undefined): HastNode | undefined {
  const child = node?.children?.find(isSignificant)
  return child?.type === 'element' ? child : undefined
}

function significantChildren(node: HastNode | undefined): number {
  return (node?.children ?? []).filter(isSignificant).length
}

/**
 * Peel the trailing run of links off a paragraph's children. Project entries end
 * in a GitHub/Live pair that reads as a footer, not as prose, so it gets its own
 * line — otherwise the chips land wherever the description happens to stop and
 * every entry ends at a different ragged offset.
 */
function splitTrailingLinks(children: React.ReactNode): [React.ReactNode[], React.ReactNode[]] {
  const nodes = Children.toArray(children)
  let cut = nodes.length
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]
    if (typeof node === 'string' && node.trim() === '') continue
    if (isValidElement(node) && node.type === 'a') {
      cut = i
      continue
    }
    break
  }
  return [nodes.slice(0, cut), nodes.slice(cut)]
}

/** Split React children at `<br />` boundaries — the masthead's name and
 *  contact line are one paragraph joined by a markdown hard break. */
function splitAtBreaks(children: React.ReactNode): React.ReactNode[][] {
  const lines: React.ReactNode[][] = [[]]
  for (const child of Children.toArray(children)) {
    if (isValidElement(child) && child.type === 'br') lines.push([])
    else lines[lines.length - 1].push(child)
  }
  return lines
}

/**
 * The masthead is one paragraph joined by markdown hard breaks: the name, then
 * the contact line. Only that paragraph is treated as a masthead — a document
 * with no `#` headings at all (a cover letter) puts every paragraph in this
 * section, and the rest of them are ordinary prose.
 */
function mastheadComponents(): Components {
  let nameUsed = false
  return {
    // `node` is destructured off so it never reaches the DOM — react-markdown
    // hands it to every override, and React warns on an unknown `node` attr.
    p({ node: _node, children, ...props }) {
      const [name, ...rest] = splitAtBreaks(children)
      if (nameUsed || rest.length === 0) return <p {...props}>{children}</p>
      nameUsed = true
      return (
        <>
          <h1 className="resume-doc__name">{name}</h1>
          {rest.map((line, i) => (
            <p key={i} className="resume-doc__contact">
              {line}
            </p>
          ))}
        </>
      )
    }
  }
}

function sectionComponents(sectionId: string): Components {
  let ledeUsed = false
  return {
    p({ node, children, ...props }) {
      const lead = firstChild(node)
      if (lead?.tagName === 'strong') {
        const [body, links] = splitTrailingLinks(children)
        return (
          <p className="resume-doc__entry" {...props}>
            {body}
            {links.length > 0 && <span className="resume-doc__links">{links}</span>}
          </p>
        )
      }
      // A paragraph that is nothing but emphasis is a meta line — the date range
      // under a job title.
      if (lead?.tagName === 'em' && significantChildren(node) === 1) {
        return (
          <p className="resume-doc__meta" {...props}>
            {children}
          </p>
        )
      }
      // Projects opens with a standing paragraph about the platform everything
      // below runs on. It frames the section rather than listing an item, so it
      // gets called out instead of reading as the first entry.
      if (sectionId === 'projects' && !ledeUsed) {
        ledeUsed = true
        return (
          <p className="resume-doc__lede" {...props}>
            {children}
          </p>
        )
      }
      return <p {...props}>{children}</p>
    }
  }
}

/** Per-section source tweaks, keyed by section slug. */
const PREPARE: Record<string, (body: string) => string> = {
  projects: prepareProjects,
  'technical-skills': prepareSkills
}

const identity = (body: string) => body

/** One résumé section: its heading plus the markdown beneath it. */
function ResumeSection({
  id,
  heading,
  body,
  masthead
}: Section & { masthead: boolean }): React.ReactElement {
  const content = (PREPARE[id] ?? identity)(body)
  return (
    <section className={`resume-doc__section resume-doc__section--${id}`}>
      {heading !== null && <h2 className="resume-doc__section-title">{heading}</h2>}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={masthead ? mastheadComponents() : sectionComponents(id)}
      >
        {content}
      </ReactMarkdown>
    </section>
  )
}

interface ResumeDocumentProps {
  content: string
  /** `letter` skips the masthead treatment: a cover letter is three paragraphs
   *  of prose with no headings, so every one of them lands in the pre-heading
   *  section and none of them is a name/contact block. */
  variant?: 'resume' | 'letter'
}

/** Render résumé markdown as a stack of sheets, honouring page-break markers. */
export function ResumeDocument({
  content,
  variant = 'resume'
}: ResumeDocumentProps): React.ReactElement {
  const pages = content.split(PAGE_BREAK_MARKER)
  return (
    <div className={`resume-doc resume-doc--${variant}`}>
      {pages.map((page, i) => (
        <React.Fragment key={i}>
          {i > 0 && <div className="resume-viewer__pagebreak" />}
          <article className="resume-doc__sheet">
            {splitSections(page).map((section, j) => (
              <ResumeSection
                key={j}
                {...section}
                masthead={variant === 'resume' && section.heading === null}
              />
            ))}
          </article>
        </React.Fragment>
      ))}
    </div>
  )
}
