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
  SELECTION: 2048,
  TAILORING: 4096
} as const

export const COVER_LETTER_TOKENS = 2048

// The application-extras call emits a compact JSON bundle: a 3-paragraph cover
// letter + email + hook + ~6 screening answers + LinkedIn note + a few talking
// points. The cover letter pushes output up, so give it headroom; the input is
// capped in application-extras.ts.
export const APPLICATION_EXTRAS_TOKENS = 3500
