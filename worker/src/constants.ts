export const LLM_CONFIG = {
  BASE_URL: 'https://api.groq.com/openai/v1',
  MODEL: 'openai/gpt-oss-120b',
  TEMPERATURE: 0.7,
  MAX_TOKENS: 512
} as const

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

// The application-extras call emits a compact JSON bundle (email + hook + ~6
// screening answers + LinkedIn note + a few talking points). ~1.5k output
// tokens is comfortable headroom; the input is capped in application-extras.ts.
export const APPLICATION_EXTRAS_TOKENS = 2048
