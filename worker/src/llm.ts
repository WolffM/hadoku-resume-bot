import OpenAI from 'openai'
import { LLM_CONFIG, LLM_PROVIDERS } from './constants.js'

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

/** One free-tier provider in the chain: an OpenAI-compatible client + its model id. */
export interface LLMProvider {
  name: string
  client: OpenAI
  model: string
}

/** A prioritized chain of providers; calls fall over from one to the next. */
export type LLMChain = LLMProvider[]

/** Just the key bindings the chain reads — a subset of the worker env. */
export interface LLMEnv {
  GROQ_API_KEY?: string
  NEBIUS_API_KEY?: string
}

/**
 * Build the provider chain from whatever keys are configured, in LLM_PROVIDERS
 * order. Every provider serves openai/gpt-oss-120b behind an OpenAI-compatible
 * API, so a request can fall over from one to the next transparently. A provider
 * is included only when its key binding is present, so the chain degrades to
 * whatever is available (e.g. Groq-only if NEBIUS_API_KEY isn't set yet).
 */
export function createLLMClient(env: LLMEnv): LLMChain {
  const chain: LLMChain = []
  for (const p of LLM_PROVIDERS) {
    const apiKey = env[p.envKey]
    if (!apiKey) continue
    chain.push({
      name: p.name,
      model: p.model,
      client: new OpenAI({ apiKey, baseURL: p.baseUrl })
    })
  }
  return chain
}

// Free tiers enforce a per-minute token budget (e.g. Groq is 8k TPM). A fresh
// application packet fires several completions close together and can stack past
// that window. The chain's first defence is to fall over to the NEXT free
// provider on a 429 rather than wait; only the LAST provider (nowhere left to go)
// honours the Retry-After header, capped so we stay inside the edge's ~120s
// carve-out.
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

/** Call one provider, honouring Retry-After only when there's no fallback left. */
async function callProvider(
  provider: LLMProvider,
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number } | undefined,
  retryOnRateLimit: boolean
): Promise<ChatResponse> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        messages,
        temperature: options?.temperature ?? LLM_CONFIG.TEMPERATURE,
        max_tokens: options?.maxTokens ?? LLM_CONFIG.MAX_TOKENS
      })
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
    } catch (err) {
      const waitMs = retryOnRateLimit ? retryAfterMs(err) : null
      if (waitMs === null || attempt >= MAX_RATE_LIMIT_RETRIES) throw err
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }
  }
}

/**
 * Send a completion through the provider chain: try each in order, falling over
 * to the next free provider on any error (a 429 on Nebius silently rolls to Groq,
 * etc.). Only the final provider retries a rate limit, since there's nothing left
 * to fall back to.
 */
export async function sendChatCompletion(
  chain: LLMChain,
  messages: ChatMessage[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<ChatResponse> {
  if (chain.length === 0) {
    throw new Error('No LLM providers configured (set NEBIUS_API_KEY and/or GROQ_API_KEY)')
  }
  let lastErr: unknown
  for (let i = 0; i < chain.length; i++) {
    const isLast = i === chain.length - 1
    try {
      return await callProvider(chain[i], messages, options, isLast)
    } catch (err) {
      lastErr = err
      if (isLast) throw err
      // Otherwise fall over to the next free provider.
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('All LLM providers failed')
}
