export const LLM_CONFIG = {
  TEMPERATURE: 0.7,
  MAX_TOKENS: 512
} as const

// The free-tier provider chain, in priority order. Every entry must serve an
// OpenAI-compatible API; a call falls over from one to the next (see llm.ts).
// A provider joins the chain only when its key binding is set, so this list can
// name providers that aren't configured yet.
//
// GROQ IS THE ONLY ENTRY, deliberately, and this repo owns that account.
//
// Cerebras sat above it from the chain's introduction until 2026-09-09 and was
// removed rather than left dormant. It never served a single request: the key
// was not pushed to the worker until 2026-09-06, and once it was, every call
// returned `402 payment_required` because the free tier is a one-off $5 credit
// grant, not a recurring allowance, and it had been spent. The chain falls over
// on ANY provider error, so a primary that failed 100% of the time was
// completely invisible — the symptom was Groq's usage not dropping. Leaving the
// entry in place would have kept paying a doomed round-trip before every real
// call. Re-adding it is a paid decision, not a config line.
//
// The single entry keeps the chain machinery dormant rather than exercised:
// with one provider, sendChatCompletion's fallback loop runs once and Groq is
// always `isLast`, so it is the provider that honours Retry-After. That is
// correct, and the machinery stays because adding a second provider must remain
// a one-line change — this account has been starved by a neighbour once already
// (watchparty's subtitle recaps, migrating off Groq as of 2026-09-09).
export const LLM_PROVIDERS = [
  {
    name: 'groq',
    envKey: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b'
  }
] as const

export const RATE_LIMIT_CONFIG = {
  MAX_REQUESTS_PER_WINDOW: 30,
  WINDOW_DURATION_SECONDS: 60,
  KV_TTL_SECONDS: 120
} as const

export const TAILORED_RESUME_TOKENS = {
  // Selection's visible output is only a JSON array of block ids, but
  // gpt-oss-120b is a reasoning model: it spends output tokens thinking before
  // emitting content, and an allowance sized to the JSON alone starves it —
  // the API 200s with EMPTY content ("No response from LLM"). 2048 leaves
  // reasoning room; SELECTION_BUDGET's ladder absorbs the cost by shrinking
  // the prompt a rung further.
  SELECTION: 2048,
  TAILORING: 4096
} as const

// Pass-1 selection must fit Groq's free-tier 8k TPM, which counts prompt +
// max_tokens per request. Note this is a RATE limit, not a context limit —
// gpt-oss-120b's context is 131k and accepts a far larger prompt happily,
// then the rate limiter rejects it with a 413. Sizing against the context is
// the bug this guards. The prompt is shrunk to fit BEFORE sending —
// snippets first, then the JD slice — because a 413 here is deterministic:
// the same palette + JD fails every retry. Estimation uses chars/3.4, which
// overcounts English prose slightly (safe direction) for tag-dense text.
export const SELECTION_BUDGET = {
  MAX_REQUEST_TOKENS: 7600,
  CHARS_PER_TOKEN: 3.4,
  // (snippet chars per block, JD chars) ladder, tried in order until the
  // estimate fits. Tags + title carry most of the routing signal (the
  // block-audit found snippets secondary), so degrading snippets first is
  // the right trade.
  LADDER: [
    [200, 2500],
    [120, 2000],
    [80, 1500],
    [0, 1000]
  ]
} as const

export const COVER_LETTER_TOKENS = 2048

// The application-extras call emits a compact JSON bundle: a 3-paragraph cover
// letter + email + hook + ~6 screening answers + LinkedIn note + a few talking
// points. The cover letter pushes output up, so give it headroom; the input is
// capped in application-extras.ts.
export const APPLICATION_EXTRAS_TOKENS = 3500

// ---------------------------------------------------------------------------
// Wall-clock budget for one REQUEST, as opposed to one LLM call.
//
// edge-router mounts the LLM routes with `timeout: 120000`. Past that the proxy
// gives up and the caller gets a proxy error instead of our answer, so anything
// we are still doing at 120s is work nobody will ever receive.
//
// Measured before this existed (30d of edge request logs, 2026-09-07):
//
//   POST /resume/api/variants          100,042ms   200
//   POST /resume/api/variants           98,010ms   200
//   POST /resume/api/variants           90,277ms   200
//   POST /resume/api/variants           58,150ms   400  <- lost the résumé too
//   POST /jobs/{id}/resume              93,135ms   200
//   POST /jobs/{id}/resume              42,081ms   502
//
// The variants mint is the worst because it is the only path that runs THREE
// sequential completions (block selection, the rewrite, then the cover letter)
// where /tailored-resume runs two. 100s is 83% of the edge's patience.
//
// 100s leaves 20s of headroom for the KV read/write and JSON either side, so a
// request that blows the budget still returns OUR error rather than the edge's.
export const OPERATION_BUDGET_MS = 100_000

// The smallest remaining window in which starting another provider attempt is
// worth it. Measured: a 2.2k-token completion returns in ~1.4s, so 3s is a
// real attempt rather than a coin flip. Below this we stop instead of starting
// something we know cannot finish.
export const MIN_ATTEMPT_MS = 3_000
