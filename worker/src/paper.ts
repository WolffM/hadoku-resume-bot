/**
 * Paper size for a résumé PDF.
 *
 * The owner's PDF is US Letter, as it always was. Everyone else gets A4, the
 * size used almost everywhere, unless their contact location is in the US or
 * Canada, where Letter is the norm.
 */

export type Paper = 'a4' | 'letter'

/** Page size in PDF points (1/72 inch). */
export const PAPER_SIZE: Record<Paper, { width: number; height: number }> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 }
}

const LETTER_COUNTRY = /\b(usa|united states|canada)\b/i
/** "US" and "U.S." only in capitals, so the word "us" does not count. */
const US_ABBREVIATION = /(^|[\s,(])(US|U\.S\.(A\.)?)(?=$|[\s,)])/

/** US state and Canadian province codes, as in "Austin, TX" or "Toronto, ON". */
const LETTER_REGIONS = new Set(
  (
    'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM ' +
    'NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC ' +
    'ON QC BC AB MB SK NS NB NL PE YT NT NU'
  ).split(' ')
)

/** Letter for a location in the US or Canada, A4 for anywhere else or unknown. */
export function paperForLocation(location: string | null | undefined): Paper {
  const text = (location ?? '').trim()
  if (!text) return 'a4'
  if (LETTER_COUNTRY.test(text) || US_ABBREVIATION.test(text)) return 'letter'
  // A region code only counts after a comma, in capitals: "Portland, OR".
  for (const m of text.matchAll(/,\s*([A-Z]{2})\b/g)) {
    if (LETTER_REGIONS.has(m[1])) return 'letter'
  }
  return 'a4'
}
