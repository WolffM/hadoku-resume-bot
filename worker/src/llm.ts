import OpenAI from 'openai'
import { LLM_CONFIG } from './constants.js'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatResponse {
  message: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export function createLLMClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: LLM_CONFIG.BASE_URL
  })
}

// Groq enforces a per-minute token budget (8k TPM on the model we use). A single
// application packet fires several completions close together — résumé selection
// + tailoring, cover letter, application extras — and a fresh (uncached) packet
// can stack them past the window, so the last call comes back 429 with a
// `retry-after`. Honour that header (capped, so we stay inside the edge's ~120s
// carve-out) instead of surfacing a 500. Once one packet is cached the calls
// spread out and this never trips.
const MAX_RATE_LIMIT_RETRIES = 2
const MAX_RETRY_WAIT_MS = 45_000

function retryAfterMs(err: unknown): number | null {
  const e = err as { status?: number; headers?: Record<string, string> } | null
  if (!e || e.status !== 429) return null
  const header = e.headers?.['retry-after']
  const seconds = header ? Number(header) : NaN
  // Fall back to a short fixed wait when the header is missing/unparseable.
  const ms = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5_000
  return Math.min(ms, MAX_RETRY_WAIT_MS)
}

export async function sendChatCompletion(
  client: OpenAI,
  messages: ChatMessage[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<ChatResponse> {
  let response: OpenAI.Chat.Completions.ChatCompletion | undefined
  for (let attempt = 0; ; attempt++) {
    try {
      response = await client.chat.completions.create({
        model: LLM_CONFIG.MODEL,
        messages,
        temperature: options?.temperature ?? LLM_CONFIG.TEMPERATURE,
        max_tokens: options?.maxTokens ?? LLM_CONFIG.MAX_TOKENS
      })
      break
    } catch (err) {
      const waitMs = retryAfterMs(err)
      if (waitMs === null || attempt >= MAX_RATE_LIMIT_RETRIES) throw err
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }
  }

  const choice = response.choices[0]
  if (!choice || !choice.message?.content) {
    throw new Error('No response from LLM')
  }

  return {
    message: choice.message.content,
    usage: response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens
        }
      : undefined
  }
}
