/**
 * Resume Bot Worker Package
 *
 * Exports a factory function for Cloudflare Workers.
 * The host worker in hadoku_site imports this and delegates to it.
 *
 * @example
 * ```typescript
 * // In hadoku_site/workers/resume-api/src/index.ts
 * import { createResumeHandler } from '@wolffm/resume-bot/api';
 * export default createResumeHandler('/resume/api');
 * ```
 */

import { Hono } from 'hono'
import type { KVNamespace } from '@cloudflare/workers-types'
import { checkRateLimit, recordRequest } from './rate-limit.js'
import { getFullSystemPrompt, getResumeContent } from './resume.js'
import { createLLMClient, sendChatCompletion, type ChatMessage } from './llm.js'

interface ResumeEnv {
  GROQ_API_KEY: string
  RESUME_SYSTEM_PROMPT: string
  RATE_LIMIT_KV: KVNamespace
  CONTENT_KV: KVNamespace
}

export interface ResumeHandlerOptions {
  ownerName?: string
}

export function createResumeHandler(basePath: string, options: ResumeHandlerOptions = {}) {
  const { ownerName = 'the candidate' } = options
  const app = new Hono<{ Bindings: ResumeEnv }>()

  app.get(`${basePath}/`, c => c.json({ status: 'ok', service: 'resume-api' }))
  app.get(`${basePath}/health`, c => c.json({ status: 'ok', service: 'resume-api' }))

  app.post(`${basePath}/chat`, async c => {
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'

    const rateLimitResult = await checkRateLimit(c.env.RATE_LIMIT_KV, ip)
    if (!rateLimitResult.allowed) {
      return c.json(
        {
          error: 'Rate limit exceeded',
          message: rateLimitResult.reason,
          retryAfter: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)
        },
        429
      )
    }

    let body: { messages?: ChatMessage[] }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid request' }, 400)
    }

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return c.json({ error: 'Missing or invalid messages array' }, 400)
    }

    for (const msg of body.messages) {
      if (!msg.role || !msg.content || typeof msg.content !== 'string') {
        return c.json({ error: 'Invalid request' }, 400)
      }
      if (!['system', 'user', 'assistant'].includes(msg.role)) {
        return c.json({ error: 'Invalid request' }, 400)
      }
    }

    try {
      await recordRequest(c.env.RATE_LIMIT_KV, ip)

      const messages = [...body.messages]
      if (messages[0]?.role !== 'system') {
        const systemPrompt = await getFullSystemPrompt(c.env, ownerName)
        messages.unshift({ role: 'system', content: systemPrompt })
      }

      const client = createLLMClient(c.env.GROQ_API_KEY)
      const response = await sendChatCompletion(client, messages)
      return c.json(response)
    } catch (error) {
      return c.json(
        {
          error: 'Failed to get response from LLM',
          message: (error as Error).message
        },
        500
      )
    }
  })

  app.get(`${basePath}/resume`, async c => {
    try {
      const content = await getResumeContent(c.env)
      return c.json({ content })
    } catch (error) {
      return c.json({ error: 'Failed to retrieve resume', message: (error as Error).message }, 500)
    }
  })

  app.get(`${basePath}/system-prompt`, async c => {
    try {
      const systemPrompt = await getFullSystemPrompt(c.env, ownerName)
      return c.json({ systemPrompt })
    } catch (error) {
      return c.json(
        { error: 'Failed to retrieve system prompt', message: (error as Error).message },
        500
      )
    }
  })

  app.notFound(c => c.json({ error: 'Not found' }, 404))
  app.onError((_err, c) => c.json({ error: 'Internal server error' }, 500))

  return app
}

export type { ResumeEnv }
