import OpenAI from 'openai'
import { LLM_CONFIG, LLM_PROVIDERS, MIN_ATTEMPT_MS, type ProviderEnvKey } from './constants.js'

/**
 * Options for one completion. `deadline` is the important one: it is an epoch
 * ms after which no further attempt may START, and it is what keeps a request
 * that fans out across providers and retries inside the edge's 120s patience.
 */
export interface CompletionOptions {
  maxTokens?: number
  temperature?: number
  /** Epoch ms. Attempts stop once there is not a real attempt's worth left. */
  deadline?: number
}

/**
 * Thrown when the budget is spent. Distinct from a provider error on purpose:
 * falling over to the NEXT provider is the right move for a provider failure
 * and exactly the wrong one here, because the clock is shared. sendChatCompletion
 * rethrows this instead of continuing down the chain.
 */
export class DeadlineExceededError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeadlineExceededError'
  }
}

/** Milliseconds left, or Infinity when the caller set no deadline. */
function remainingMs(deadline?: number): number {
  return deadline === undefined ? Number.POSITIVE_INFINITY : deadline - Date.now()
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatResponse {
  message: string
  /**
   * Which provider actually answered.
   *
   * The chain falls over on any error, silently and by design, so a generation
   * served by a weaker fallback looks identical to one served by the primary.
   * Without this the first sign of a quality regression is a real job
   * application that reads badly, and no way to attribute it.
   */
  provider: string
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
/**
 * The bindings the chain reads. Derived from `ProviderEnvKey` so it cannot fall
 * behind the provider list; the account id is separate because it is not a
 * credential and is substituted into a base URL rather than sent as one.
 */
export type LLMEnv = Partial<Record<ProviderEnvKey, string>> & {
  /** Substituted into Cloudflare's base URL, which carries it in the path. */
  CLOUDFLARE_ACCOUNT_ID?: string
}

// ---------------------------------------------------------------------------
// Latency budget. Every number here is derived from ONE constraint: edge-router
// mounts the LLM routes with `timeout: 120000` (hadoku_site
// workers/edge-router/src/index.ts), and /tailored-resume spends that budget on
// TWO sequential completions (block selection, then the rewrite).
//
// Worst case must fit, so:
//   pass 1, slow but successful    = 2 x REQUEST_TIMEOUT_MS            = 40s
//   pass 2, every attempt failing  = 3 x REQUEST_TIMEOUT_MS + one wait = 65s
//                                                                 total 105s
//
// This replaced a ladder of 2 retries x 45s, which could sleep 90s on its own
// and produced a measured wallTimeP99 of 92.7s against a cpuTimeP99 of 364ms:
// the worker was not waiting on inference, it was waiting on its own setTimeout.
// ---------------------------------------------------------------------------

/**
 * Per-attempt ceiling for a single provider call. Groq returns our largest
 * response (4096 tokens) in under 10s, and a measured 2.2k-token completion in
 * ~1.4s, so this is roughly 2x headroom. Past that, giving up beats waiting:
 * OPERATION_BUDGET_MS is the real bound and a stalled attempt only eats into
 * the work that comes after it.
 */
const REQUEST_TIMEOUT_MS = 20_000

/**
 * The fetch every provider client uses. Two jobs:
 *
 * 1. A provider that names an `authHeader` wants its key THERE and NOWHERE
 *    ELSE, so the SDK's `Authorization: Bearer` is deleted from the outgoing
 *    Headers (a null defaultHeader is not reliably dropped on workerd).
 *
 * 2. An error body that is not shaped `{error: {...}}` is reshaped so it is.
 *    The openai SDK reads ONLY `body.error`, and when that key is missing it
 *    reports "400 status code (no body)" even though the body was there.
 *    Google's OpenAI-compatible surface answers errors as a JSON ARRAY,
 *    `[{"error": {...}}]`, so every Gemini refusal arrived as "(no body)" and
 *    its actual reason was thrown away. That blind spot is how a Gemini
 *    failure was misread as a header problem on 2026-09-15 and stayed broken.
 */
export function providerFetch(apiKey: string, authHeader?: string) {
  return async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers)
    if (authHeader) {
      headers.delete('authorization')
      headers.set(authHeader, apiKey)
    }
    const res = await fetch(url, { ...init, headers })
    if (res.ok) return res
    return normalizeErrorBody(res)
  }
}

/** Rebuild a failed response so its body carries a top-level `error` the SDK can read. */
export async function normalizeErrorBody(res: Response): Promise<Response> {
  const text = await res.text()
  let body = text
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = undefined
  }
  if (Array.isArray(parsed) && parsed.length > 0 && parsed[0] && typeof parsed[0] === 'object') {
    body = JSON.stringify(parsed[0])
  } else if (
    parsed !== undefined &&
    (typeof parsed !== 'object' || parsed === null || !('error' in parsed))
  ) {
    // Valid JSON with no `error` key: hand the SDK the raw text as the message.
    body = JSON.stringify({ error: { message: text.slice(0, 500) } })
  }
  const outHeaders = new Headers(res.headers)
  // The body has been decoded and possibly rewritten, so these no longer describe it.
  outHeaders.delete('content-encoding')
  outHeaders.delete('content-length')
  return new Response(body, { status: res.status, statusText: res.statusText, headers: outHeaders })
}

/**
 * Build the provider chain from whatever keys are configured, in LLM_PROVIDERS
 * order. Every provider speaks an OpenAI-compatible API, so a request can fall
 * over from one to the next transparently. A provider is included only when its
 * key binding is present, so a missing key degrades the chain instead of
 * breaking it. Today that list is Groq alone — see constants.ts for why.
 */
export function createLLMClient(env: LLMEnv): LLMChain {
  const chain: LLMChain = []
  for (const p of LLM_PROVIDERS) {
    const apiKey = env[p.envKey]
    if (!apiKey) continue
    // Cloudflare is the only provider whose account id lives in the PATH. An
    // unsubstituted placeholder would produce a URL that 404s on every call,
    // and the chain would swallow that as a fallthrough — so a provider whose
    // base URL cannot be completed is skipped, like one with no key.
    const baseUrl = p.baseUrl.replace('{CLOUDFLARE_ACCOUNT_ID}', env.CLOUDFLARE_ACCOUNT_ID ?? '')
    if (baseUrl.includes('{')) continue
    const authHeader: string | undefined = 'authHeader' in p ? p.authHeader : undefined
    chain.push({
      name: p.name,
      model: p.model,
      client: new OpenAI({
        apiKey,
        baseURL: baseUrl,
        // Every provider goes through providerFetch: it moves the key for a
        // provider that names an `authHeader`, and unwraps an error body the SDK
        // would otherwise report as "(no body)". See providerFetch.
        fetch: providerFetch(apiKey, authHeader),
        // Both of these MUST be set explicitly. The SDK defaults are a 10-minute
        // timeout and 2 internal retries, which is catastrophic here: a hung
        // provider would burn 30 minutes inside a request the edge gives 120s,
        // and those hidden retries stack UNDERNEATH the chain fallback and the
        // rate-limit loop below, multiplying every wait we think we control.
        timeout: REQUEST_TIMEOUT_MS,
        // Zero, not lowered. Failing over to the NEXT provider is strictly
        // better than retrying the one that just failed, and that is exactly
        // what sendChatCompletion does. SDK-level retries would only re-hit the
        // same rate-limited endpoint, invisibly.
        maxRetries: 0
      })
    })
  }
  return chain
}

// Free tiers enforce a per-minute token budget (e.g. Groq is 8k TPM). A fresh
// application packet fires several completions close together and can stack past
// that window. The chain's first defence is to fall over to the NEXT free
// provider on a 429 rather than wait; only the LAST provider (nowhere left to go)
// honours the Retry-After header at all.
//
// This wait is deliberately SHORT, and that is a reversal. It used to be 2
// retries x 45s, sized to sleep through a TPM window rollover. That was the
// wrong trade twice over. A token-per-minute 429 wants ~60s, so a capped 45s
// wait usually woke up into the SAME exhausted window and 429'd again: we paid
// the full 90s and still failed. And a request that sleeps 90s of its 120s
// budget has nothing left for the work it was going to do afterwards.
//
// So this is now a courtesy retry for a brief RPM burst, not a window-rollover
// wait. When the whole chain is genuinely rate-limited, failing fast and letting
// the caller retry beats holding a connection open for a minute and a half.
const MAX_RATE_LIMIT_RETRIES = 1
const MAX_RETRY_WAIT_MS = 5_000

function retryAfterMs(err: unknown): number | null {
  const ms = requestedWaitMs(err)
  return ms === null ? null : Math.min(ms, MAX_RETRY_WAIT_MS)
}

/**
 * The wait a 429 asked for, uncapped; null when the error is not a 429. A
 * missing or unparseable Retry-After falls back to a short fixed wait.
 */
function requestedWaitMs(err: unknown): number | null {
  const e = err as { status?: number; headers?: Headers | Record<string, string> } | null
  if (!e || e.status !== 429) return null
  const h = e.headers
  const header = h instanceof Headers ? h.get('retry-after') : h?.['retry-after']
  const seconds = header ? Number(header) : NaN
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5_000
}

/**
 * The longest Retry-After worth honouring once the whole chain has failed.
 *
 * Groq's 429 names the exact moment its per-minute window frees up, and for a
 * packet (tailored résumé, then the extras a second later) that is 7-12s away
 * (measured 2026-11-20). Falling over to the next provider is still the first
 * move; this wait is only for when every fallback has also refused, which is
 * when failing is the only alternative. It is short enough to sit inside the
 * caller's deadline, unlike the 45s window-rollover waits this file retired.
 */
const CHAIN_RETRY_MAX_WAIT_MS = 15_000

/** Call one provider, honouring Retry-After only when there's no fallback left. */
async function callProvider(
  provider: LLMProvider,
  messages: ChatMessage[],
  options: CompletionOptions | undefined,
  retryOnRateLimit: boolean
): Promise<ChatResponse> {
  for (let attempt = 0; ; attempt++) {
    // Never START an attempt that cannot finish. Without this the per-attempt
    // timeout is the only bound, and three sequential completions each allowed
    // their own full timeout is how the variants mint reached 100s.
    const left = remainingMs(options?.deadline)
    if (left < MIN_ATTEMPT_MS) {
      throw new DeadlineExceededError(
        `budget spent before ${provider.name} attempt ${attempt + 1} (${Math.round(left)}ms left)`
      )
    }
    try {
      const response = await provider.client.chat.completions.create(
        {
          model: provider.model,
          messages,
          temperature: options?.temperature ?? LLM_CONFIG.TEMPERATURE,
          max_tokens: options?.maxTokens ?? LLM_CONFIG.MAX_TOKENS
        },
        // Whichever is tighter: the per-attempt ceiling, or all the time this
        // request has left. The client-level default already caps the former;
        // this narrows it as the shared budget drains.
        { timeout: Math.min(REQUEST_TIMEOUT_MS, left) }
      )
      const choice = response.choices[0]
      if (!choice || !choice.message?.content) {
        throw new Error('No response from LLM')
      }
      return {
        message: choice.message.content,
        // WHICH provider answered. The chain falls over silently by design, so
        // without this a packet written by a weaker fallback is indistinguishable
        // from one written by the primary — and the first sign of a quality
        // regression would be a real job application that reads badly.
        provider: provider.name,
        usage: response.usage
          ? {
              prompt_tokens: response.usage.prompt_tokens,
              completion_tokens: response.usage.completion_tokens,
              total_tokens: response.usage.total_tokens
            }
          : undefined
      }
    } catch (err) {
      if (err instanceof DeadlineExceededError) throw err
      const waitMs = retryOnRateLimit ? retryAfterMs(err) : null
      if (waitMs === null || attempt >= MAX_RATE_LIMIT_RETRIES) throw err
      // Sleeping is only worth it if the sleep AND the attempt after it both
      // fit. Otherwise we would burn the caller's remaining budget on a wait
      // whose retry we already know we will refuse to start.
      if (remainingMs(options?.deadline) < waitMs + MIN_ATTEMPT_MS) throw err
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
  options?: CompletionOptions
): Promise<ChatResponse> {
  if (chain.length === 0) {
    throw new Error('No LLM providers configured (set GROQ_API_KEY or GEMINI_API_KEY)')
  }
  // Every provider's failure, by name. The chain falls over silently, so the
  // error that surfaces is only the LAST provider's; without the others a
  // Groq rate limit that pushed the request onto a broken fallback reads as
  // the fallback's problem alone.
  const failures: string[] = []
  let rateLimited: { provider: LLMProvider; waitMs: number } | undefined
  for (let i = 0; i < chain.length; i++) {
    const isLast = i === chain.length - 1
    try {
      return await callProvider(chain[i], messages, options, isLast)
    } catch (err) {
      failures.push(`${chain[i].name}: ${err instanceof Error ? err.message : String(err)}`)
      // A spent budget is not a provider problem, so the next provider cannot
      // help: the clock is shared and it is already out. Falling over here
      // would spend the caller's last milliseconds re-failing.
      if (err instanceof DeadlineExceededError) {
        throw new DeadlineExceededError(failures.join('; '))
      }
      // Otherwise fall over to the next free provider.
      const wait = requestedWaitMs(err)
      if (wait !== null && !rateLimited) rateLimited = { provider: chain[i], waitMs: wait }
    }
  }
  // Everything refused. If one provider was only rate limited and said for how
  // long, and that is soon enough to fit the caller's budget, its window
  // reopening is the request's best remaining chance.
  if (
    rateLimited &&
    rateLimited.waitMs <= CHAIN_RETRY_MAX_WAIT_MS &&
    remainingMs(options?.deadline) >= rateLimited.waitMs + MIN_ATTEMPT_MS
  ) {
    await new Promise(resolve => setTimeout(resolve, rateLimited.waitMs))
    try {
      return await callProvider(rateLimited.provider, messages, options, false)
    } catch (err) {
      failures.push(
        `${rateLimited.provider.name} after ${Math.round(rateLimited.waitMs / 1000)}s wait: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
  }
  throw new Error(`All LLM providers failed: ${failures.join('; ')}`)
}
