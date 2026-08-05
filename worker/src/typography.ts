/**
 * LLM-generated markdown leans on typographic Unicode: narrow no-break
 * spaces (U+202F) around symbols, zero-widths, non-breaking hyphens. They
 * read oddly in the web viewer and cannot be represented in the PDF's
 * WinAnsi fonts. Normalize at the READ boundary (the /resume and /resume.pdf
 * routes) so already-minted variants come out clean without re-minting them
 * (their slugs are in links recruiters already hold), and at generation so
 * fresh output is stored clean. Typography that renders fine everywhere,
 * like curly quotes, en/em dashes and bullets, is left alone.
 */
export function normalizeTypography(text: string): string {
  return (
    text
      // "10<thin space>+" is the LLM typesetting "10+": tighten, don't widen.
      .replace(/(\d)[\u202F\u2009]\+/g, '$1+')
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/[\u2010\u2011]/g, '-')
  )
}
