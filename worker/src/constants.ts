export const LLM_CONFIG = {
  TEMPERATURE: 0.7,
  MAX_TOKENS: 512
} as const

// The free-tier provider chain, in priority order. Every entry serves
// openai/gpt-oss-120b behind an OpenAI-compatible API; a call falls over from
// one to the next (see llm.ts). A provider joins the chain only when its key
// binding is set, so this list can name providers that aren't configured yet.
//
// Cerebras is primary (free tier: 30k TPM, no card, ~2000 tok/s); Groq is the
// fallback (8k TPM free) using the key that was already wired. A request that
// Cerebras rejects — e.g. its free-tier 8k-context cap on a large tailoring
// prompt — falls over to Groq's full 131k context automatically (see llm.ts).
// Keeping the whole chain on free tiers means the public /chat endpoint can
// never run up a bill. Note the model ids differ per provider: Cerebras serves
// it as `gpt-oss-120b`, Groq as `openai/gpt-oss-120b`.
export const LLM_PROVIDERS = [
  {
    name: 'cerebras',
    envKey: 'CEREBRAS_API_KEY',
    baseUrl: 'https://api.cerebras.ai/v1',
    model: 'gpt-oss-120b'
  },
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

// Pass-1 selection must fit the tightest provider limit in the chain: Groq's
// free-tier 8k TPM counts prompt + max_tokens per request, and Cerebras's
// free tier caps context at 8k. The prompt is shrunk to fit BEFORE sending —
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
