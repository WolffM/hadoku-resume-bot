import type { KVNamespace } from '@cloudflare/workers-types'
import { RATE_LIMIT_CONFIG } from './constants.js'

export interface RateLimitResult {
  allowed: boolean
  reason: string
  resetAt: number
  remaining: number
}

function kvKey(ip: string): string {
  return `rl:${ip}`
}

export async function checkRateLimit(kv: KVNamespace, ip: string): Promise<RateLimitResult> {
  const now = Date.now()
  const windowMs = RATE_LIMIT_CONFIG.WINDOW_DURATION_SECONDS * 1000
  const raw = await kv.get(kvKey(ip))
  const timestamps: number[] = raw ? (JSON.parse(raw) as number[]) : []
  const recent = timestamps.filter(t => now - t < windowMs)

  if (recent.length >= RATE_LIMIT_CONFIG.MAX_REQUESTS_PER_WINDOW) {
    const oldest = Math.min(...recent)
    const resetAt = oldest + windowMs
    return {
      allowed: false,
      reason: `Rate limit exceeded. Try again in ${Math.ceil((resetAt - now) / 1000)} seconds.`,
      resetAt,
      remaining: 0
    }
  }

  return {
    allowed: true,
    reason: '',
    resetAt: now + windowMs,
    remaining: RATE_LIMIT_CONFIG.MAX_REQUESTS_PER_WINDOW - recent.length
  }
}

export async function recordRequest(kv: KVNamespace, ip: string): Promise<void> {
  const now = Date.now()
  const windowMs = RATE_LIMIT_CONFIG.WINDOW_DURATION_SECONDS * 1000
  const raw = await kv.get(kvKey(ip))
  const timestamps: number[] = raw ? (JSON.parse(raw) as number[]) : []
  const recent = timestamps.filter(t => now - t < windowMs)
  recent.push(now)
  await kv.put(kvKey(ip), JSON.stringify(recent), {
    expirationTtl: RATE_LIMIT_CONFIG.KV_TTL_SECONDS
  })
}
