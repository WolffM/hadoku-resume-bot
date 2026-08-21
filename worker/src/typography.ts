/**
 * LLM-generated markdown leans on typographic Unicode: narrow no-break
 * spaces (U+202F) around symbols, zero-widths, non-breaking hyphens. They
 * read oddly in the web viewer and cannot be represented in the PDF's
 * WinAnsi fonts. Normalize at the READ boundary (the /resume and /resume.pdf
 * routes) so already-minted variants come out clean without re-minting them
 * (their slugs are in links recruiters already hold), and at generation so
 * fresh output is stored clean. En dashes (date ranges) and bullets are left
 * alone; em dashes are banned outright (owner rule, 2026-08-21).
 */
export function normalizeTypography(text: string): string {
  return (
    text
      // "10<thin space>+" is the LLM typesetting "10+": tighten, don't widen.
      .replace(/(\d)[\u202F\u2009]\+/g, '$1+')
      // French-style number spacing is the same tell: "3 800" (any space kind)
      // means "3,800", "74 %" means "74%", "84 k" means "84k". The blanket
      // space collapse below would otherwise launder thin spaces into plain
      // ones and make the drift look hand-typed.
      .replace(/(\d)[\u202F\u2009\u00A0 ](\d{3})\b/g, '$1,$2')
      .replace(/(\d)[\u202F\u2009\u00A0 ]%/g, '$1%')
      .replace(/(\d)[\u202F\u2009\u00A0 ](?=[kKMB]\b)/g, '$1')
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/[\u2010\u2011]/g, '-')
      // Em dashes are banned across the board: the LLM's favourite punctuation
      // and an instant AI tell. Spaced becomes " - ", bare becomes "-".
      .replace(/ — /g, ' - ')
      .replace(/—/g, '-')
      // Curly quotes are the classic AI tell — nobody types U+2019 by hand.
      .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
      .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
      .replace(/\u2026/g, '...')
  )
}
