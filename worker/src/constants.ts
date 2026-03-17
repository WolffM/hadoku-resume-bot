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
