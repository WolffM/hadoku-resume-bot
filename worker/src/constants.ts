export const LLM_CONFIG = {
  TEMPERATURE: 0.7,
  MAX_TOKENS: 512
} as const

// The free-tier provider chain, in priority order. Every entry must serve an
// OpenAI-compatible API; a call falls over from one to the next (see llm.ts).
// A provider joins the chain only when its key binding is set, so this list can
// name providers that aren't configured yet.
//
// ORDER IS GROQ, THEN GEMINI, and the fallback is what makes the pair work.
// sendChatCompletion falls over to the NEXT provider on a 429 rather than
// waiting, so a Groq refusal costs one round-trip instead of a dead request.
//
// That matters because Groq cannot serve us cleanly at all. Its free tier caps
// 8,000 tokens per MINUTE and one /tailored-resume spends ~15.2k across its two
// passes, so a single generation NEVER fits inside one minute — it gets through
// only by crossing the boundary. Bursts are what hurt, and draining an apply
// queue is nothing but bursts: on 2026-09-14 that emptied the day's 200k budget
// mid-run and parked the applications at needs_manual.
//
// The 200k/day is ORG-WIDE, not per key, which is why a neighbour can starve
// this account — watchparty's subtitle recaps did exactly that on 2026-09-01.
//
// Groq stays FIRST because its output is the known quantity: every prompt here,
// every token budget below, and the block-selection JSON contract were measured
// against gpt-oss-120b. Gemini is the overflow, not the replacement. Swapping
// the order is a deliberate quality decision, not a throughput tweak.
//
// GITHUB MODELS IS NOT HERE, and it is not an oversight: it returns
// `410 github_models_retirement_brownout` as of 2026-09-15. It was tested
// before being added rather than after — the two providers that reached this
// file untested (Cerebras, and very nearly this one) both cost real time.
//
// A FURTHER PROVIDER IS ONE ENTRY PLUS A KEY, but pick the model deliberately.
// OpenRouter's `:free` ids rotate, and a wrong model name 400s on every call —
// which the chain swallows as a fallthrough, so it is invisible. That is
// exactly how Cerebras failed below.
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
// The element type is declared EXPLICITLY, and `authHeader` is declared here
// even though no provider currently sets it. Without that, TS infers the union
// from the members, `'authHeader' in p` narrows to `unknown` (TS 4.9+ in-
// narrowing), and llm.ts's `[p.authHeader]` computed key fails TS2464. That is
// exactly what broke the 3.10.4 publish on 2026-09-16: the Bearer revert removed
// the last `authHeader`, and a mechanism with no users stopped compiling.
/**
 * Every binding a provider entry may name.
 *
 * `LLMEnv` in llm.ts is DERIVED from this, so adding a provider below without
 * widening this union is a compile error rather than a silently skipped
 * provider — which is what happened when CLOUDFLARE_AI_TOKEN and
 * MISTRAL_API_KEY were added against a hardcoded three-name union.
 */
export type ProviderEnvKey =
  | 'GROQ_API_KEY'
  | 'GEMINI_API_KEY'
  | 'GEMINI_API_KEY_2'
  | 'CLOUDFLARE_AI_TOKEN'
  | 'MISTRAL_API_KEY'

export const LLM_PROVIDERS: {
  name: string
  envKey: ProviderEnvKey
  baseUrl: string
  model: string
  authHeader?: string
}[] = [
  {
    name: 'groq',
    envKey: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b'
  },
  {
    // Google's own OpenAI-compatible surface, so it needs no client changes —
    // only the key, the base URL and the model name (per ai.google.dev's
    // OpenAI-compatibility page). Its free tier is bounded by REQUESTS per
    // minute rather than tokens, which is the right shape for us: our problem
    // is two ~7.6k-token passes landing in the same minute, and a request-based
    // ceiling does not care how large they are.
    //
    // Inert until GEMINI_API_KEY is bound — createLLMClient skips a provider
    // whose key is absent, so merging this changes nothing on its own.
    name: 'gemini',
    envKey: 'GEMINI_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-3.8-flash'
    // The key rides in `Authorization: Bearer`, the OpenAI way. No authHeader.
    //
    // Measured 2026-11-20, once llm.ts stopped hiding Google's error bodies
    // (they come as a JSON array the openai SDK reported as "(no body)"):
    // with the key in `x-goog-api-key` and Authorization deleted, the answer
    // is `400 Missing or invalid Authorization header.` That is the 400 every
    // Gemini call returned since 2026-09-15. Its earlier diagnosis ("Multiple
    // authentication credentials received") was read off a bare status code.
  },
  {
    // A SECOND Gemini key, and the only reason it is worth a slot is that free
    // quota is metered per PROJECT. Two keys from different Google accounts are
    // two independent allowances; two keys from the SAME account share one and
    // this entry buys nothing but a wasted round-trip when the first is spent.
    //
    // Same base URL and model as above on purpose — this is not a different
    // provider, it is more of the same one. Named for what it is.
    name: 'gemini-2',
    envKey: 'GEMINI_API_KEY_2',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-3.8-flash'
  },
  {
    // Cloudflare Workers AI. 10,000 neurons/day, no card, and this ecosystem
    // already runs on Cloudflare — so it is the only entry here that needs no
    // new account.
    //
    // `{CLOUDFLARE_ACCOUNT_ID}` is substituted by createLLMClient from the env
    // of the same name; the provider is skipped when it is absent, exactly as a
    // missing key skips one. Cloudflare is the only provider whose account id
    // lives in the PATH rather than a header, which is why the mechanism exists.
    //
    // NOTE the token scope: a Cloudflare API token needs "Workers AI: Read" to
    // call this. The token this ecosystem already holds is scoped for D1 and
    // Workers and returns `401 code 10000` here — widening it, or minting a
    // second, is the whole setup cost.
    name: 'cloudflare',
    envKey: 'CLOUDFLARE_AI_TOKEN',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1',
    model: '@cf/meta/llama-3.1-8b-instruct'
  },
  {
    // Mistral. $10/month of credits on the free plan, no card. Placed LAST
    // because it is the only entry that can actually run out of money — the
    // others refuse and cost nothing, this one spends.
    //
    // `-latest` is a moving alias on purpose: Mistral keeps it pointed at a
    // current model, which is the opposite of OpenRouter's `:free` ids that
    // vanish. A model that disappears 400s on every call and the chain swallows
    // it as a fallthrough — invisible, exactly how Cerebras failed.
    name: 'mistral',
    envKey: 'MISTRAL_API_KEY',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest'
  }
] as const

/**
 * Claude on the operator's Claude Code subscription, leased from crossposter's
 * pool (claude-pool.ts). First in the chain whenever the worker can lease.
 *
 * Measured 2026-11-20 on a pool lease, an application-extras-sized request
 * (2.6k tokens in, JSON out):
 *
 *   claude-opus-5-5   effort low     20.8s   1,949 out
 *   claude-opus-5-5   effort medium  33.9s   2,963 out
 *   claude-sonnet-5-5 effort low     13.5s   1,676 out
 *
 * All three returned valid JSON. Re-measured 2026-11-22 on the real extras
 * prompt (5k in): Opus low 22-25s at ~90 tok/s, Sonnet low 15-17s at ~118
 * tok/s, and thinking off saves Sonnet nothing. The time is spent WRITING the
 * ~2.2k-token kit, not thinking, so the faster writer wins: Sonnet took a
 * full packet (résumé + kit) from ~45s on Opus down. Opus is a quality
 * choice, not a fix, and it accepts no way to turn thinking off.
 *
 * `low` keeps one attempt well inside
 * OPERATION_BUDGET_MS, two passes of a tailored résumé included, which is why
 * the attempt ceiling is 60s here and 20s for the free providers: a Claude call
 * cut at 20s would fail every extras request it was given.
 */
export const CLAUDE_POOL = {
  MODEL: 'claude-sonnet-5-5',
  EFFORT: 'low',
  // Thinking spends output tokens too, so this is not the free providers' cap.
  MAX_TOKENS: 16000,
  ATTEMPT_TIMEOUT_MS: 60_000,
  LEASE_URL: 'https://hadoku.me/crossposter/claude-code/lease',
  OUTCOME_URL: 'https://hadoku.me/crossposter/claude-code/lease/outcome'
} as const

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

/**
 * The most of a posting any prompt carries, for a provider with no per-request
 * token ceiling (job-text.ts). A sanity bound, not a budget: real postings run
 * 3-15k characters as text, and this is ~18k tokens.
 */
export const FULL_JD_MAX_CHARS = 60_000

export const COVER_LETTER_TOKENS = 2048

// The application-extras call emits a compact JSON bundle: a 3-paragraph cover
// letter + email + hook + ~6 screening answers + LinkedIn note + a few talking
// points. The cover letter pushes output up, so give it headroom; the input is
// capped in application-extras.ts.
export const APPLICATION_EXTRAS_TOKENS = 3500

// Answers to one form's own free-text questions (form-answers.ts): a handful of
// 2-5 sentence answers in a JSON array, so well under the kit's allowance.
export const FORM_ANSWERS_TOKENS = 2500

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
