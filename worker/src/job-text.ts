import { FULL_JD_MAX_CHARS, SELECTION_BUDGET } from './constants.js'
import type { LLMProvider } from './llm.js'

/**
 * A job posting as the model should read it: the WHOLE posting, as text.
 *
 * Callers send the description the ATS published, which is HTML (Greenhouse
 * sends it entity-escaped on top). Sent raw, a quarter of every prompt was
 * markup, and the generators then cut the posting to its first 1-3k
 * characters to fit the free providers' 8k-token request ceiling. What a
 * posting asks of the applicant usually sits near its end: Fleetio's "Be sure
 * to mention 'coffee' in your application so we know you actually read this"
 * was at character 4,350 of 6,215, and the screening answers never saw it
 * (2026-11-23).
 *
 * So the posting is cut only for a provider that has a per-request ceiling,
 * and only by as much as that ceiling demands. Claude, first in the chain,
 * reads all of it.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  hellip: '...',
  mdash: '-',
  ndash: '-',
  bull: '-',
  middot: '-',
  trade: '(TM)',
  reg: '(R)',
  copy: '(C)'
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X'
          ? parseInt(name.slice(2), 16)
          : parseInt(name.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole
    }
    return ENTITIES[name.toLowerCase()] ?? whole
  })
}

/** The posting's text: markup dropped, block structure kept as line breaks. */
export function jobText(description: string): string {
  // Greenhouse's API escapes the HTML itself ("&lt;p&gt;"). Unescape once first
  // so the tags below are real tags; a plain-text posting has none either way.
  const html = /&lt;\/?[a-z]/i.test(description) ? decodeEntities(description) : description
  const text = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|ul|ol|h[1-6]|tr|section|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  return (
    decodeEntities(text)
      .replace(/[ \t\f\v\u00a0]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      // A list item wrapped in <p>, as Greenhouse writes them, would otherwise
      // sit a blank line apart from the one before it.
      .replace(/\n\n(?=- )/g, '\n')
      .trim()
  )
}

/**
 * How much of the posting `provider` can take in one request.
 *
 * `promptChars` is the rest of the prompt and `maxTokens` the output allowance;
 * a provider's ceiling counts both. No ceiling means the whole posting, bounded
 * only by FULL_JD_MAX_CHARS. Returns 0 when nothing fits, so the caller decides
 * whether a posting-less prompt is still worth sending.
 */
export function postingCharsFor(
  provider: LLMProvider,
  promptChars: number,
  maxTokens: number
): number {
  if (provider.requestTokenLimit === undefined) return FULL_JD_MAX_CHARS
  const left =
    (provider.requestTokenLimit - maxTokens) * SELECTION_BUDGET.CHARS_PER_TOKEN - promptChars
  return Math.max(0, Math.min(FULL_JD_MAX_CHARS, Math.floor(left)))
}

/** The posting cut to `chars`, marked when anything was dropped. */
export function clip(posting: string, chars: number): string {
  return posting.length > chars ? `${posting.slice(0, chars)}…` : posting
}

/**
 * The instruction every generator that writes TO the employer carries. A
 * posting that asks for something specific is testing whether the applicant
 * read it, and missing it reads as a form letter.
 */
export const POSTING_INSTRUCTIONS_RULE =
  'If the posting asks applicants to do something specific in their application (mention a particular word or phrase, answer a question, follow a format), do it, naturally, in the cover letter and in the answers about why the candidate is applying.'
