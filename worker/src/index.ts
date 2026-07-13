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
import { createEdgeAuth, requireUserType } from '@wolffm/worker-utils'
import { checkRateLimit, recordRequest } from './rate-limit.js'
import { getFullSystemPrompt, getResumeContent } from './resume.js'
import { createLLMClient, sendChatCompletion, type ChatMessage } from './llm.js'
import { generateTailoredResume, type TailoredResumeRequest } from './tailored-resume.js'
import { generateCoverLetter, type CoverLetterRequest } from './cover-letter.js'
import {
  getVariant,
  renderVariant,
  mintVariant,
  listVariants,
  deleteVariant,
  type MintVariantRequest
} from './variants.js'

interface ResumeEnv {
  GROQ_API_KEY: string
  RESUME_SYSTEM_PROMPT: string
  /**
   * Shared secret proving a request arrived via edge-router. The edge strips any
   * client-supplied X-Edge-Auth/X-Hadoku-Tier and stamps its own, so a valid
   * X-Edge-Auth is proof of provenance and X-Hadoku-Tier can be trusted without
   * re-validating keys here.
   */
  EDGE_AUTH_SECRET: string
  RATE_LIMIT_KV: KVNamespace
  CONTENT_KV: KVNamespace
}

export interface ResumeHandlerOptions {
  ownerName?: string
}

export function createResumeHandler(basePath: string, options: ResumeHandlerOptions = {}) {
  const { ownerName = 'the candidate' } = options
  const app = new Hono<{ Bindings: ResumeEnv }>()

  // Adopt the tier the edge-router resolved, but only when X-Edge-Auth proves the
  // request actually came through the edge. A direct hit to the *.workers.dev
  // origin has no valid secret, so it degrades to `public` and any forged
  // X-Hadoku-Tier is ignored. Degrade-to-public rather than reject: the
  // monitoring probe hits /health directly with no headers and must stay 200.
  // The requireUserType gates below are what turn a direct hit into a 403.
  app.use('*', createEdgeAuth())

  app.get(`${basePath}/`, c => c.json({ status: 'ok', service: 'resume-api' }))
  app.get(`${basePath}/health`, c => c.json({ status: 'ok', service: 'resume-api' }))

  // Non-public surface. Mirrors the tiers the edge-router enforces, so the gate
  // survives a direct origin hit instead of relying on the perimeter alone.
  const friendOrAdmin = requireUserType(['admin', 'friend'])
  app.use(`${basePath}/system-prompt`, friendOrAdmin)
  app.use(`${basePath}/tailored-resume`, friendOrAdmin)
  app.use(`${basePath}/cover-letter`, friendOrAdmin)
  app.use(`${basePath}/variants`, friendOrAdmin)
  app.use(`${basePath}/variants/*`, friendOrAdmin)

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
      // ?v={slug} serves a link-tailored variant; unknown/expired slugs fall
      // back to the full resume so a shared link never renders a broken page.
      const slug = c.req.query('v')
      if (slug) {
        const variant = await getVariant(c.env.CONTENT_KV, slug)
        if (variant) {
          const content = await renderVariant(c.env.CONTENT_KV, variant)
          if (content) return c.json({ content, variant: variant.slug })
        }
      }

      const content = await getResumeContent(c.env)
      return c.json({ content })
    } catch (error) {
      return c.json({ error: 'Failed to retrieve resume', message: (error as Error).message }, 500)
    }
  })

  // Variant management — friend/admin, enforced by the requireUserType gates above.
  app.post(`${basePath}/variants`, async c => {
    let body: MintVariantRequest
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid request body' }, 400)
    }

    if (!body.label) {
      return c.json({ error: 'Missing required field: label' }, 400)
    }

    try {
      const client = createLLMClient(c.env.GROQ_API_KEY)
      const variant = await mintVariant(client, c.env.CONTENT_KV, body)
      return c.json(variant)
    } catch (error) {
      return c.json({ error: 'Failed to mint variant', message: (error as Error).message }, 400)
    }
  })

  app.get(`${basePath}/variants`, async c => {
    try {
      const variants = await listVariants(c.env.CONTENT_KV)
      return c.json({ variants })
    } catch (error) {
      return c.json({ error: 'Failed to list variants', message: (error as Error).message }, 500)
    }
  })

  app.delete(`${basePath}/variants/:slug`, async c => {
    try {
      const deleted = await deleteVariant(c.env.CONTENT_KV, c.req.param('slug'))
      return deleted ? c.json({ deleted: true }) : c.json({ error: 'Not found' }, 404)
    } catch (error) {
      return c.json({ error: 'Failed to delete variant', message: (error as Error).message }, 500)
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

  app.post(`${basePath}/tailored-resume`, async c => {
    let body: TailoredResumeRequest
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid request body' }, 400)
    }

    if (!body.job_title || !body.company || !body.description) {
      return c.json({ error: 'Missing required fields: job_title, company, description' }, 400)
    }

    try {
      const client = createLLMClient(c.env.GROQ_API_KEY)
      const result = await generateTailoredResume(client, c.env.CONTENT_KV, body)
      return c.json(result)
    } catch (error) {
      return c.json(
        { error: 'Failed to generate tailored resume', message: (error as Error).message },
        500
      )
    }
  })

  app.post(`${basePath}/cover-letter`, async c => {
    let body: CoverLetterRequest
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid request body' }, 400)
    }

    if (!body.job_title || !body.company || !body.description) {
      return c.json({ error: 'Missing required fields: job_title, company, description' }, 400)
    }

    try {
      const client = createLLMClient(c.env.GROQ_API_KEY)
      const resumeContent = await getResumeContent(c.env)
      const result = await generateCoverLetter(client, c.env.CONTENT_KV, resumeContent, body)
      return c.json(result)
    } catch (error) {
      return c.json(
        { error: 'Failed to generate cover letter', message: (error as Error).message },
        500
      )
    }
  })

  app.notFound(c => c.json({ error: 'Not found' }, 404))
  app.onError((_err, c) => c.json({ error: 'Internal server error' }, 500))

  return app
}

export type { ResumeEnv }
