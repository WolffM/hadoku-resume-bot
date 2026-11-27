/**
 * Server-side résumé PDF rendering.
 *
 * The download button used to be `window.print()`, which reconstructed the
 * document from the on-screen DOM — fragile (host-page CSS could clip it) and
 * it opened a print dialog instead of downloading a file. This renders the
 * same canonical markdown the viewer displays straight to a paginated PDF, so
 * GET /resume.pdf serves a real file.
 *
 * The résumé markdown is a constrained subset (the builder emits it): `#`
 * headings, paragraphs with hard line breaks, `-` bullet lists, `**bold**`,
 * `*italic*`, `[text](url)` links and `---` rules. This is a purpose-built
 * typesetter for exactly that subset, not a general markdown engine.
 */

import {
  PDFArray,
  PDFDocument,
  PDFFont,
  PDFName,
  PDFPage,
  PDFString,
  StandardFonts,
  rgb
} from 'pdf-lib'
import { PAGE_BREAK_MARKER } from './skeleton.js'
import { PAPER_SIZE, type Paper } from './paper.js'

export interface ResumePdfInput {
  /** Résumé markdown (the canonical or variant-rendered content). */
  resume: string
  /** Optional cover letter markdown — rendered from a fresh page after the résumé. */
  coverLetter?: string | null
  /** Document metadata: title bar in PDF viewers, and the Author field. */
  ownerName: string
  /**
   * Overrides the Title metadata. Default: the owner's historical title
   * (the name, an em dash, "Résumé"), kept so the owner's PDF does not change.
   */
  title?: string
  /** Page geometry and type sizes. Default: the owner's layout. */
  style?: PdfStyle
  /** Paper size. Default: US Letter, the owner's. */
  paper?: Paper
}

/**
 * - `owner`: the owner's layout, unchanged (roomy, every heading level drawn
 *   as a ruled section heading, page breaks from the skeleton's markers).
 * - `compact`: everyone else's. Tighter margins and type, and `##`/`###`
 *   headings (one per job) drawn as bold entry lines without a rule, so a
 *   typical five-role résumé fits on two pages.
 */
export type PdfStyle = 'owner' | 'compact'

interface InlineRun {
  text: string
  bold: boolean
  italic: boolean
  link?: string
}

type Block =
  | { kind: 'heading'; level: number; runs: InlineRun[] }
  | { kind: 'paragraph'; lines: InlineRun[][] }
  | { kind: 'bullet'; runs: InlineRun[] }
  | { kind: 'rule' }
  | { kind: 'page-break' }

// --- Markdown parsing (constrained subset) ---------------------------------

const INLINE_TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\(\S+\)|\*[^*\s][^*]*\*)/g

function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = []
  let last = 0
  for (const match of text.matchAll(INLINE_TOKEN)) {
    if (match.index > last) {
      runs.push({ text: text.slice(last, match.index), bold: false, italic: false })
    }
    const token = match[0]
    if (token.startsWith('**')) {
      // Recurse so `**[title](url)**` and `**_x_**` keep their inner structure.
      runs.push(...parseInline(token.slice(2, -2)).map(r => ({ ...r, bold: true })))
    } else if (token.startsWith('[')) {
      const close = token.indexOf('](')
      runs.push({
        text: token.slice(1, close),
        bold: false,
        italic: false,
        link: token.slice(close + 2, -1)
      })
    } else {
      runs.push(...parseInline(token.slice(1, -1)).map(r => ({ ...r, italic: true })))
    }
    last = match.index + token.length
  }
  if (last < text.length) {
    runs.push({ text: text.slice(last), bold: false, italic: false })
  }
  return runs.filter(r => r.text.length > 0)
}

export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = []
  let paragraph: InlineRun[][] = []

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', lines: paragraph })
      paragraph = []
    }
  }

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd()
    if (line === '') {
      flush()
    } else if (line.trim() === PAGE_BREAK_MARKER) {
      flush()
      blocks.push({ kind: 'page-break' })
    } else if (/^#{1,3} /.test(line)) {
      flush()
      blocks.push({
        kind: 'heading',
        level: line.indexOf(' '),
        runs: parseInline(line.replace(/^#{1,3} /, ''))
      })
    } else if (/^[-*] /.test(line)) {
      flush()
      blocks.push({ kind: 'bullet', runs: parseInline(line.slice(2)) })
    } else if (/^(---+|\*\*\*+|___+)$/.test(line)) {
      flush()
      blocks.push({ kind: 'rule' })
    } else {
      // Every newline inside a paragraph renders as a line break — the builder
      // emits trailing-two-space hard breaks on exactly these lines.
      paragraph.push(parseInline(line))
    }
  }
  flush()
  return blocks
}

// --- Layout -----------------------------------------------------------------

interface Typography {
  pageWidth: number
  pageHeight: number
  marginX: number
  marginTop: number
  marginBottom: number
  bodySize: number
  bodyLeading: number
  headingSize: number
  /** Space above a section heading (not at the top of a page). */
  headingGap: number
  /** Space between a section heading's baseline and its rule, and below the rule. */
  headingRuleGap: number
  headingAfterRule: number
  nameSize: number
  bulletIndent: number
  paragraphGap: number
  bulletGap: number
  /** How `##` and `###` headings are drawn; null draws them like `#`. */
  entryHeading: { size: number; gap: number; after: number } | null
}

const OWNER_TYPOGRAPHY: Typography = {
  pageWidth: 612, // US Letter
  pageHeight: 792,
  marginX: 58,
  marginTop: 64,
  marginBottom: 58,
  bodySize: 10.5,
  bodyLeading: 15,
  headingSize: 13.5,
  headingGap: 14,
  headingRuleGap: 7,
  headingAfterRule: 4,
  nameSize: 15,
  bulletIndent: 18,
  paragraphGap: 5,
  bulletGap: 2,
  entryHeading: null
}

const COMPACT_TYPOGRAPHY: Typography = {
  pageWidth: 612,
  pageHeight: 792,
  marginX: 46,
  marginTop: 42,
  marginBottom: 40,
  bodySize: 9.5,
  bodyLeading: 12.4,
  headingSize: 11.5,
  headingGap: 9,
  headingRuleGap: 4,
  headingAfterRule: 2,
  nameSize: 16,
  bulletIndent: 13,
  paragraphGap: 2.5,
  bulletGap: 0.6,
  entryHeading: { size: 10, gap: 6, after: 1 }
}

function typographyFor(style: PdfStyle | undefined, paper: Paper = 'letter'): Typography {
  const base = style === 'compact' ? COMPACT_TYPOGRAPHY : OWNER_TYPOGRAPHY
  if (paper === 'letter') return base
  const { width, height } = PAPER_SIZE[paper]
  return { ...base, pageWidth: width, pageHeight: height }
}

const TEXT_COLOR = rgb(0.13, 0.13, 0.13)
const RULE_COLOR = rgb(0.75, 0.75, 0.75)
const LINK_COLOR = rgb(0.1, 0.3, 0.65)

interface FontSet {
  regular: PDFFont
  bold: PDFFont
  italic: PDFFont
  boldItalic: PDFFont
  charset: Set<number>
}

function pickFont(fonts: FontSet, run: InlineRun): PDFFont {
  if (run.bold && run.italic) return fonts.boldItalic
  if (run.bold) return fonts.bold
  if (run.italic) return fonts.italic
  return fonts.regular
}

// The standard Helvetica faces encode WinAnsi (cp1252). Common typographic
// characters map cleanly; anything outside the charset degrades to '?' rather
// than throwing mid-render.
const CHAR_SUBSTITUTIONS: Record<string, string> = {
  ' ': ' ',
  '‐': '-',
  '‑': '-',
  '…': '...',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '−': '-',
  '→': '->',
  '←': '<-',
  '↔': '<->',
  '⇒': '=>',
  '✓': 'yes',
  '★': '*',
  '≈': '~',
  '≠': '!=',
  '≤': '<=',
  '≥': '>='
}

// LLM-generated content (cover letters, tailored variants) uses typographic
// Unicode freely — narrow no-break spaces, zero-widths — which WinAnsi lacks.
// Spaces must normalize BEFORE word-splitting or the neighbours fuse into one
// word with a '?' in the middle (Fortune?500).
const UNICODE_SPACES = /[\u2000-\u200A\u202F\u205F\u3000]/
const ZERO_WIDTHS = /[\u200B-\u200D\u2060\uFEFF]/

function sanitize(text: string, charset: Set<number>): string {
  let out = ''
  for (const ch of text) {
    if (UNICODE_SPACES.test(ch)) {
      out += ' '
      continue
    }
    if (ZERO_WIDTHS.test(ch)) continue
    const mapped = CHAR_SUBSTITUTIONS[ch] ?? ch
    for (const m of mapped) {
      out += charset.has(m.codePointAt(0) as number) ? m : '?'
    }
  }
  return out
}

interface Word {
  text: string
  run: InlineRun
  font: PDFFont
  width: number
}

function toWords(runs: InlineRun[], fonts: FontSet, size: number): Word[] {
  const words: Word[] = []
  for (const run of runs) {
    const font = pickFont(fonts, run)
    for (const piece of sanitize(run.text, fonts.charset).split(/\s+/)) {
      if (piece.length === 0) continue
      words.push({ text: piece, run, font, width: font.widthOfTextAtSize(piece, size) })
    }
  }
  return words
}

/** Greedy word wrap into lines that fit maxWidth. */
function wrapWords(words: Word[], fonts: FontSet, size: number, maxWidth: number): Word[][] {
  const spaceWidth = fonts.regular.widthOfTextAtSize(' ', size)
  const lines: Word[][] = []
  let line: Word[] = []
  let lineWidth = 0
  for (const word of words) {
    const extra = (line.length > 0 ? spaceWidth : 0) + word.width
    if (line.length > 0 && lineWidth + extra > maxWidth) {
      lines.push(line)
      line = []
      lineWidth = 0
    }
    lineWidth += (line.length > 0 ? spaceWidth : 0) + word.width
    line.push(word)
  }
  if (line.length > 0) lines.push(line)
  return lines
}

/**
 * Lays the document out page by page. With `measureOnly` it runs the same
 * layout without drawing anything or adding pages, and only counts them: the
 * page count of a real render, for the cost of the arithmetic.
 */
class Typesetter {
  private page: PDFPage | null = null
  private y = 0
  pages = 0

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: FontSet,
    private readonly t: Typography,
    private readonly measureOnly = false
  ) {
    this.newPage()
  }

  private get contentWidth(): number {
    return this.t.pageWidth - this.t.marginX * 2
  }

  newPage(): void {
    this.pages++
    if (!this.measureOnly) this.page = this.doc.addPage([this.t.pageWidth, this.t.pageHeight])
    this.y = this.t.pageHeight - this.t.marginTop
  }

  private ensureRoom(height: number): void {
    if (this.y - height < this.t.marginBottom) this.newPage()
  }

  private atTopOfPage(): boolean {
    return this.y === this.t.pageHeight - this.t.marginTop
  }

  private addLinkAnnotation(x: number, width: number, size: number, url: string): void {
    if (!this.page) return
    const action = this.doc.context.obj({
      Type: PDFName.of('Action'),
      S: PDFName.of('URI'),
      URI: PDFString.of(url)
    })
    const annot = this.doc.context.register(
      this.doc.context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Link'),
        Rect: [x, this.y - 3, x + width, this.y + size],
        Border: [0, 0, 0],
        A: action
      })
    )
    const existing = this.page.node.get(PDFName.of('Annots'))
    if (existing instanceof PDFArray) {
      existing.push(annot)
    } else {
      this.page.node.set(PDFName.of('Annots'), this.doc.context.obj([annot]))
    }
  }

  /** Draw one pre-wrapped line of words at the current cursor. */
  private drawLine(line: Word[], size: number, x: number): void {
    if (!this.page) return
    const spaceWidth = this.fonts.regular.widthOfTextAtSize(' ', size)
    let cx = x
    for (const [i, word] of line.entries()) {
      if (i > 0) cx += spaceWidth
      const color = word.run.link ? LINK_COLOR : TEXT_COLOR
      this.page.drawText(word.text, { x: cx, y: this.y, size, font: word.font, color })
      if (word.run.link) {
        this.page.drawLine({
          start: { x: cx, y: this.y - 1.5 },
          end: { x: cx + word.width, y: this.y - 1.5 },
          thickness: 0.6,
          color: LINK_COLOR
        })
        this.addLinkAnnotation(cx, word.width, size, word.run.link)
      }
      cx += word.width
    }
  }

  private drawWrapped(
    runs: InlineRun[],
    size: number,
    leading: number,
    x: number,
    maxWidth: number
  ): void {
    for (const line of wrapWords(toWords(runs, this.fonts, size), this.fonts, size, maxWidth)) {
      this.ensureRoom(leading)
      this.y -= leading
      this.drawLine(line, size, x)
    }
  }

  heading(runs: InlineRun[], level = 1): void {
    const t = this.t
    const boldRuns = runs.map(r => ({ ...r, bold: true }))
    const entry = level > 1 ? t.entryHeading : null
    if (entry) {
      // A job or project heading: a bold line, kept with two lines of its body.
      this.ensureRoom(entry.size + entry.gap + t.bodyLeading * 2)
      if (!this.atTopOfPage()) this.y -= entry.gap
      this.drawWrapped(boldRuns, entry.size, entry.size * 1.25, t.marginX, this.contentWidth)
      this.y -= entry.after
      return
    }
    // Keep the heading attached to at least two lines of what follows.
    this.ensureRoom(t.headingSize + 10 + t.bodyLeading * 2)
    if (!this.atTopOfPage()) this.y -= t.headingGap
    this.y -= t.headingSize
    this.drawLine(toWords(boldRuns, this.fonts, t.headingSize), t.headingSize, t.marginX)
    this.y -= t.headingRuleGap
    this.rule()
    this.y -= t.headingAfterRule
  }

  rule(): void {
    this.ensureRoom(2)
    if (!this.page) return
    this.page.drawLine({
      start: { x: this.t.marginX, y: this.y },
      end: { x: this.t.pageWidth - this.t.marginX, y: this.y },
      thickness: 0.75,
      color: RULE_COLOR
    })
  }

  paragraph(lines: InlineRun[][], options: { size?: number; leading?: number } = {}): void {
    const size = options.size ?? this.t.bodySize
    const leading = options.leading ?? this.t.bodyLeading
    for (const lineRuns of lines) {
      this.drawWrapped(lineRuns, size, leading, this.t.marginX, this.contentWidth)
    }
    this.y -= this.t.paragraphGap
  }

  /** Render a parsed document. The first paragraph before any heading is the
   *  name/contact block and gets display sizing on its first line. */
  render(blocks: Block[]): void {
    let seenHeading = false
    let isFirstBlock = true
    for (const block of blocks) {
      switch (block.kind) {
        case 'heading':
          seenHeading = true
          this.heading(block.runs, block.level)
          break
        case 'paragraph':
          if (isFirstBlock && !seenHeading && block.lines.length > 0) {
            const [nameLine, ...rest] = block.lines
            this.paragraph([nameLine.map(r => ({ ...r, bold: true }))], {
              size: this.t.nameSize,
              leading: this.t.nameSize * 1.4
            })
            this.y += this.t.paragraphGap
            if (rest.length > 0) this.paragraph(rest)
          } else {
            this.paragraph(block.lines)
          }
          break
        case 'bullet':
          this.drawBullet(block.runs)
          break
        case 'rule':
          this.y -= 6
          this.rule()
          this.y -= 8
          break
        case 'page-break':
          // Force the next content onto a fresh page. Skip when already at the
          // top so a leading or doubled marker can't emit a blank page.
          if (!this.atTopOfPage()) this.newPage()
          break
      }
      isFirstBlock = false
    }
  }

  private drawBullet(runs: InlineRun[]): void {
    // Draw the text first (wrapping handles pagination), then place the dot
    // level with the first line actually drawn.
    const t = this.t
    const words = toWords(runs, this.fonts, t.bodySize)
    const lines = wrapWords(words, this.fonts, t.bodySize, this.contentWidth - t.bulletIndent)
    for (const [i, line] of lines.entries()) {
      this.ensureRoom(t.bodyLeading)
      this.y -= t.bodyLeading
      if (i === 0 && this.page) {
        this.page.drawText('•', {
          x: t.marginX + t.bulletIndent / 3,
          y: this.y,
          size: t.bodySize,
          font: this.fonts.regular,
          color: TEXT_COLOR
        })
      }
      this.drawLine(line, t.bodySize, t.marginX + t.bulletIndent)
    }
    this.y -= t.bulletGap
  }
}

// --- Entry point --------------------------------------------------------------

async function embedFonts(doc: PDFDocument): Promise<FontSet> {
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  return {
    regular,
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
    charset: new Set(regular.getCharacterSet())
  }
}

/**
 * A page counter for résumé markdown in one style: how many pages
 * `renderResumePdf` would produce for it (without a cover letter). Fonts are
 * embedded once, so measuring many candidate versions stays cheap.
 */
export async function createPageCounter(
  style: PdfStyle,
  paper: Paper = 'letter'
): Promise<(markdown: string) => number> {
  const doc = await PDFDocument.create()
  const fonts = await embedFonts(doc)
  const t = typographyFor(style, paper)
  return markdown => {
    const typesetter = new Typesetter(doc, fonts, t, true)
    typesetter.render(parseBlocks(markdown))
    return typesetter.pages
  }
}

export async function renderResumePdf(input: ResumePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(input.title ?? `${input.ownerName} — Résumé`)
  doc.setAuthor(input.ownerName)

  const fonts = await embedFonts(doc)
  const typesetter = new Typesetter(doc, fonts, typographyFor(input.style, input.paper))
  typesetter.render(parseBlocks(input.resume))

  if (input.coverLetter && input.coverLetter.length > 0) {
    typesetter.newPage()
    typesetter.render([
      { kind: 'heading', level: 1, runs: [{ text: 'Cover Letter', bold: true, italic: false }] },
      ...parseBlocks(input.coverLetter)
    ])
  }

  return doc.save()
}
