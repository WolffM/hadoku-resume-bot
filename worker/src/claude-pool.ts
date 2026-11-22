import Anthropic from '@anthropic-ai/sdk'
import { createWorkerLogger } from '@wolffm/logger/worker'
import { CLAUDE_POOL } from './constants.js'
import type { ChatMessage, ChatResponse, CompletionRequest, LLMProvider } from './llm.js'

/**
 * Claude, on the operator's Claude Code subscription tokens, leased per request
 * from crossposter's pool (hadoku-crossposter `control/claude_code_pool.py`,
 * plan `docs/planning/account-authority-2026-11-19.md`).
 *
 * resume-api holds no Claude token. crossposter decides which account is active,
 * from Anthropic's own verdict on each and the operator's override, and lends
 * that account's setup-token:
 *
 *   POST /crossposter/claude-code/lease  -> {lease_id, account, token, expires_at}
 *   POST /crossposter/claude-code/lease/outcome {lease_id, outcome, headers}
 *
 * both through the edge as this worker's service identity (HADOKU_SERVICE_KEY,
 * `resume-bot-service-key`), which must be on the edge allow list
 * `crossposter-claude-code-lease`. Without it, or without the EDGE binding, the
 * provider is left out of the chain and resume-api runs on Groq as before.
 *
 * - **One lease per request.** The chain is built per request, so the lease
 *   lives as long as one generation (two calls for a tailored résumé) and is
 *   never cached across requests.
 * - **Every call's outcome goes back,** with Anthropic's
 *   `anthropic-ratelimit-unified-*` and `anthropic-organization-id` headers.
 *   A 429 or 401 benches the account and crossposter re-decides at once, so the
 *   call is tried once more on a NEW lease when that names another account.
 * - **The token is never logged,** echoed in an error, or kept past the request.
 */

const logger = createWorkerLogger({ service: 'resume-api' })

const OAUTH_BETA = 'oauth-2025-04-20'
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
// A setup-token is answered only with the Claude Code system prompt as the first
// system block; without it the API returns 429 with no limit headers
// (crossposter measured this, `control/claude_code.py`).
const CLAUDE_CODE_SYSTEM = "You are Claude Code, Anthropic's official CLI for Claude."
// Only these response headers are read by crossposter's outcome route.
const REPORTED_HEADER = /^anthropic-(ratelimit-unified-|organization-id$)/

type Outcome = 'ok' | 'rate_limited' | 'unauthorized' | 'error'

interface Lease {
  lease_id: string
  account: string
  token: string
}

export interface ClaudePoolEnv {
  /** Service binding to edge-router: the only way this worker reaches crossposter. */
  EDGE?: { fetch: typeof fetch }
  /** This worker's service-tier identity, sent as X-User-Key. */
  HADOKU_SERVICE_KEY?: string
}

/** Runs a promise after the response (ctx.waitUntil), or awaits it when there is no ctx. */
export type Defer = (work: Promise<unknown>) => void

/** A lease refusal. No `status`, so the chain never waits on it as a rate limit. */
export class LeaseUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LeaseUnavailable'
  }
}

function edgeHeaders(key: string): HeadersInit {
  return {
    'X-User-Key': key,
    'Content-Type': 'application/json',
    // Cloudflare refuses some default user agents outright (error 1010).
    'User-Agent': 'hadoku-resume-api/claude-pool'
  }
}

function reportedHeaders(headers: Headers | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  headers?.forEach((value, name) => {
    if (REPORTED_HEADER.test(name)) out[name] = value
  })
  return out
}

function outcomeOf(err: unknown): Outcome {
  if (err instanceof Anthropic.RateLimitError) return 'rate_limited'
  if (err instanceof Anthropic.AuthenticationError) return 'unauthorized'
  return 'error'
}

/** Split the chain's OpenAI-shaped messages into Anthropic's system blocks + turns. */
function toAnthropic(messages: ChatMessage[]): {
  system: Anthropic.Beta.BetaTextBlockParam[]
  turns: Anthropic.Beta.BetaMessageParam[]
} {
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: CLAUDE_CODE_SYSTEM }]
  const turns: Anthropic.Beta.BetaMessageParam[] = []
  for (const m of messages) {
    if (m.role === 'system') system.push({ type: 'text', text: m.content })
    else turns.push({ role: m.role, content: m.content })
  }
  return { system, turns }
}

/** The pool provider, or null when this worker cannot reach crossposter. */
export function claudePoolProvider(env: ClaudePoolEnv, defer: Defer): LLMProvider | null {
  if (!env.EDGE || !env.HADOKU_SERVICE_KEY) return null
  // Bound after the check so the closures below see them as defined.
  const edge = env.EDGE
  const key = env.HADOKU_SERVICE_KEY

  let current: Promise<Lease> | undefined

  async function takeLease(): Promise<Lease> {
    const res = await edge.fetch(CLAUDE_POOL.LEASE_URL, {
      method: 'POST',
      headers: edgeHeaders(key),
      body: '{}'
    })
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 500)
      throw new LeaseUnavailable(`crossposter lease ${res.status}: ${detail}`)
    }
    const lease = (await res.json()) as Partial<Lease>
    if (!lease.lease_id || !lease.account || !lease.token) {
      throw new LeaseUnavailable('crossposter lease answered without lease_id, account or token')
    }
    return { lease_id: lease.lease_id, account: lease.account, token: lease.token }
  }

  async function report(lease: Lease, outcome: Outcome, headers?: Headers): Promise<void> {
    const res = await edge.fetch(CLAUDE_POOL.OUTCOME_URL, {
      method: 'POST',
      headers: edgeHeaders(key),
      body: JSON.stringify({
        lease_id: lease.lease_id,
        outcome,
        headers: reportedHeaders(headers)
      })
    })
    if (!res.ok) {
      // Not fatal to the generation, but never silent: a lost outcome means a
      // spent account stays active in the pool.
      logger.error(
        `claude-pool: outcome ${outcome} for ${lease.account} not recorded: ${res.status}`
      )
    }
  }

  async function once(lease: Lease, messages: ChatMessage[], req: CompletionRequest) {
    const client = new Anthropic({
      apiKey: null,
      authToken: lease.token,
      // The chain owns retries and timeouts; see llm.ts.
      maxRetries: 0,
      timeout: req.timeoutMs
    })
    const { system, turns } = toAnthropic(messages)
    // No temperature: Opus 5.5 rejects sampling parameters, and the model is
    // one constant, so keep the request valid for either. The caller's
    // maxTokens is sized for Groq's per-minute budget, and thinking counts
    // against max_tokens here, so the pool's own ceiling applies.
    const { data, response } = await client.beta.messages
      .create({
        model: CLAUDE_POOL.MODEL,
        max_tokens: CLAUDE_POOL.MAX_TOKENS,
        betas: [OAUTH_BETA, FALLBACK_BETA],
        fallbacks: 'default',
        output_config: { effort: CLAUDE_POOL.EFFORT },
        system,
        messages: turns
      })
      .withResponse()
    return { data, headers: response.headers }
  }

  return {
    name: 'claude',
    model: CLAUDE_POOL.MODEL,
    attemptTimeoutMs: CLAUDE_POOL.ATTEMPT_TIMEOUT_MS,
    async complete(messages: ChatMessage[], req: CompletionRequest): Promise<ChatResponse> {
      const tried = new Set<string>()
      for (;;) {
        current ??= takeLease()
        const lease = await current.catch(err => {
          current = undefined
          throw err
        })
        tried.add(lease.account)
        try {
          const { data, headers } = await once(lease, messages, req)
          defer(
            report(lease, 'ok', headers).catch(e =>
              logger.error(
                `claude-pool: outcome ok for ${lease.account} not sent: ${(e as Error).message}`
              )
            )
          )
          if (data.stop_reason === 'refusal') {
            throw new Error(`claude refused (${data.stop_details?.category ?? 'no category'})`)
          }
          const text = data.content
            .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
            .map(b => b.text)
            .join('')
          if (!text)
            throw new Error(`No response from LLM (claude stop_reason ${data.stop_reason})`)
          return {
            message: text,
            provider: `claude:${lease.account}`,
            usage: {
              prompt_tokens: data.usage.input_tokens,
              completion_tokens: data.usage.output_tokens,
              total_tokens: data.usage.input_tokens + data.usage.output_tokens
            }
          }
        } catch (err) {
          if (!(err instanceof Anthropic.APIError)) throw err
          const outcome = outcomeOf(err)
          // Awaited, not deferred: the bench it causes is what makes the next
          // lease name a different account.
          await report(lease, outcome, err.headers).catch(e =>
            logger.error(
              `claude-pool: outcome ${outcome} for ${lease.account} not sent: ${(e as Error).message}`
            )
          )
          if (outcome === 'error') throw err
          current = undefined
          const next = await takeLease().catch(() => undefined)
          if (next) current = Promise.resolve(next)
          // Only another account is worth a second try; the chain falls over otherwise.
          if (!next || tried.has(next.account)) throw err
        }
      }
    }
  }
}
