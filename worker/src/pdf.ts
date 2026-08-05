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

export interface ResumePdfInput {
  /** Résumé markdown (the canonical or variant-rendered content). */
  resume: string
  /** Optional cover letter markdown — rendered from a fresh page after the résumé. */
  coverLetter?: string | null
  /** Document metadata: title bar in PDF viewers, and the Author field. */
  ownerName: string
}

interface InlineRun {
  text: string
  bold: boolean
  italic: boolean
  link?: string
}

type Block =
  | { kind: 'heading'; runs: InlineRun[] }
  | { kind: 'paragraph'; lines: InlineRun[][] }
  | { kind: 'bullet'; runs: InlineRun[] }
  | { kind: 'rule' }

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
    } else if (/^#{1,3} /.test(line)) {
      flush()
      blocks.push({ kind: 'heading', runs: parseInline(line.replace(/^#{1,3} /, '')) })
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

const PAGE_WIDTH = 612 // US Letter
const PAGE_HEIGHT = 792
const MARGIN_X = 58
const MARGIN_TOP = 64
const MARGIN_BOTTOM = 58
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2

const BODY_SIZE = 10.5
const BODY_LEADING = 15
const HEADING_SIZE = 13.5
const NAME_SIZE = 15
const BULLET_INDENT = 18

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
  '★': '*'
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

class Typesetter {
  private page!: PDFPage
  private y = 0

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: FontSet
  ) {
    this.newPage()
  }

  newPage(): void {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.y = PAGE_HEIGHT - MARGIN_TOP
  }

  private ensureRoom(height: number): void {
    if (this.y - height < MARGIN_BOTTOM) this.newPage()
  }

  private atTopOfPage(): boolean {
    return this.y === PAGE_HEIGHT - MARGIN_TOP
  }

  private addLinkAnnotation(x: number, width: number, size: number, url: string): void {
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

  heading(runs: InlineRun[]): void {
    // Keep the heading attached to at least two lines of what follows.
    this.ensureRoom(HEADING_SIZE + 10 + BODY_LEADING * 2)
    if (!this.atTopOfPage()) this.y -= 14
    this.y -= HEADING_SIZE
    const boldRuns = runs.map(r => ({ ...r, bold: true }))
    this.drawLine(toWords(boldRuns, this.fonts, HEADING_SIZE), HEADING_SIZE, MARGIN_X)
    this.y -= 7
    this.rule()
    this.y -= 4
  }

  rule(): void {
    this.ensureRoom(2)
    this.page.drawLine({
      start: { x: MARGIN_X, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN_X, y: this.y },
      thickness: 0.75,
      color: RULE_COLOR
    })
  }

  paragraph(lines: InlineRun[][], options: { size?: number; leading?: number } = {}): void {
    const size = options.size ?? BODY_SIZE
    const leading = options.leading ?? BODY_LEADING
    for (const lineRuns of lines) {
      this.drawWrapped(lineRuns, size, leading, MARGIN_X, CONTENT_WIDTH)
    }
    this.y -= 5
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
          this.heading(block.runs)
          break
        case 'paragraph':
          if (isFirstBlock && !seenHeading && block.lines.length > 0) {
            const [nameLine, ...rest] = block.lines
            this.paragraph([nameLine.map(r => ({ ...r, bold: true }))], {
              size: NAME_SIZE,
              leading: NAME_SIZE * 1.4
            })
            this.y += 5
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
      }
      isFirstBlock = false
    }
  }

  private drawBullet(runs: InlineRun[]): void {
    // Draw the text first (wrapping handles pagination), then place the dot
    // level with the first line actually drawn.
    const words = toWords(runs, this.fonts, BODY_SIZE)
    const lines = wrapWords(words, this.fonts, BODY_SIZE, CONTENT_WIDTH - BULLET_INDENT)
    for (const [i, line] of lines.entries()) {
      this.ensureRoom(BODY_LEADING)
      this.y -= BODY_LEADING
      if (i === 0) {
        this.page.drawText('•', {
          x: MARGIN_X + 6,
          y: this.y,
          size: BODY_SIZE,
          font: this.fonts.regular,
          color: TEXT_COLOR
        })
      }
      this.drawLine(line, BODY_SIZE, MARGIN_X + BULLET_INDENT)
    }
    this.y -= 2
  }
}

// --- Entry point --------------------------------------------------------------

export async function renderResumePdf(input: ResumePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`${input.ownerName} — Résumé`)
  doc.setAuthor(input.ownerName)

  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const fonts: FontSet = {
    regular,
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
    charset: new Set(regular.getCharacterSet())
  }

  const typesetter = new Typesetter(doc, fonts)
  typesetter.render(parseBlocks(input.resume))

  if (input.coverLetter && input.coverLetter.length > 0) {
    typesetter.newPage()
    typesetter.render([
      { kind: 'heading', runs: [{ text: 'Cover Letter', bold: true, italic: false }] },
      ...parseBlocks(input.coverLetter)
    ])
  }

  return doc.save()
}
