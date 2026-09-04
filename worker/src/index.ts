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
import { createEdgeAuth, requireMinTier } from '@wolffm/worker-utils'
import { createWorkerLogger } from '@wolffm/logger/worker'
import { checkRateLimit, recordRequest } from './rate-limit.js'
import { getFullSystemPrompt, getResumeContent } from './resume.js'
import { renderResumePdf } from './pdf.js'
import { normalizeTypography } from './typography.js'
import { createLLMClient, sendChatCompletion, type ChatMessage } from './llm.js'
import { generateTailoredResume, type TailoredResumeRequest } from './tailored-resume.js'
import { generateCoverLetter, type CoverLetterRequest } from './cover-letter.js'
import { generateApplicationExtras, type ApplicationExtrasRequest } from './application-extras.js'
import {
  getVariant,
  renderVariant,
  mintVariant,
  listVariants,
  deleteVariant,
  type MintVariantRequest
} from './variants.js'
import { getAllBlocks } from './blocks.js'
import {
  validateBlock,
  upsertBlock,
  deleteBlock,
  reorderBlocks,
  getFeedback,
  setFeedback,
  exportBlocks
} from './builder.js'

interface ResumeEnv {
  /** Groq API key — the fallback provider in the free-tier chain. */
  GROQ_API_KEY: string
  /** Cerebras API key — the primary free-tier provider. Optional: absent → Groq-only. */
  CEREBRAS_API_KEY?: string
  /** Legacy fallback for the system prompt; CONTENT_KV `resume:prompt` wins. */
  RESUME_SYSTEM_PROMPT?: string
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
  // Download filename stem: "Matthaeus Wolff" → "matthaeus-wolff-resume". Must
  // stay in sync with the UI's client-side download filenames (ResumeViewer).
  const ownerSlug = (options.ownerName ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const filenameBase = ownerSlug ? `${ownerSlug}-resume` : 'resume'
  const app = new Hono<{ Bindings: ResumeEnv }>()
  // Structured logging via the ecosystem worker logger (sinks to console.*, which
  // Cloudflare Workers Logs captures). We log genuine server faults (the 500
  // paths + unhandled errors); 400 client-input rejections are expected and left
  // unlogged to avoid noise.
  const logger = createWorkerLogger({ service: 'resume-api' })

  // Adopt the tier the edge-router resolved, but only when X-Edge-Auth proves the
  // request actually came through the edge. A direct hit to the *.workers.dev
  // origin has no valid secret, so it degrades to `public` and any forged
  // X-Hadoku-Tier is ignored. Degrade-to-public rather than reject: the
  // monitoring probe hits /health directly with no headers and must stay 200.
  // The requireMinTier gates below are what turn a direct hit into a 403.
  app.use('*', createEdgeAuth())

  app.get(`${basePath}/`, c => c.json({ status: 'ok', service: 'resume-api' }))
  app.get(`${basePath}/health`, c => c.json({ status: 'ok', service: 'resume-api' }))

  // Non-public surface. Mirrors the tiers the edge-router enforces, so the gate
  // survives a direct origin hit instead of relying on the perimeter alone.
  //
  // One gate, not two: tiers rank (public < friend < service < admin), so
  // 'friend' already admits service and admin. Tailoring is additionally called
  // service-to-service — jobplatform-api generates per-job application packets
  // via a Cloudflare service binding, stamping X-Hadoku-Tier: service — and
  // that caller passes here by outranking friend, with no separate list.
  const friendAndUp = requireMinTier('friend')
  app.use(`${basePath}/system-prompt`, friendAndUp)
  app.use(`${basePath}/tailored-resume`, friendAndUp)
  app.use(`${basePath}/cover-letter`, friendAndUp)
  app.use(`${basePath}/application-extras`, friendAndUp)
  app.use(`${basePath}/variants`, friendAndUp)
  app.use(`${basePath}/variants/*`, friendAndUp)

  // Resume builder — admin-only block CRUD (the hosted replacement for the local
  // review UI). Writes go straight to CONTENT_KV, which is the source of truth;
  // resume_ingest.py becomes seed/import only. GET /export dumps blocks.json for
  // git backup.
  const adminOnly = requireMinTier('admin')
  app.use(`${basePath}/builder/*`, adminOnly)

  app.get(`${basePath}/builder/blocks`, async c => {
    const [blocks, feedback] = await Promise.all([
      getAllBlocks(c.env.CONTENT_KV),
      getFeedback(c.env.CONTENT_KV)
    ])
    return c.json({ blocks, feedback })
  })

  app.get(`${basePath}/builder/export`, async c => {
    const blocks = await exportBlocks(c.env.CONTENT_KV)
    return c.json(blocks)
  })

  app.put(`${basePath}/builder/blocks/:id`, async c => {
    const id = c.req.param('id')
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
    // The path id is authoritative — ignore any id in the body.
    const candidate = { ...(body as Record<string, unknown>), id }
    let block
    try {
      block = validateBlock(candidate)
    } catch (err) {
      return c.json({ error: 'Invalid block', message: (err as Error).message }, 400)
    }
    await upsertBlock(c.env.CONTENT_KV, block)
    return c.json({ block })
  })

  app.delete(`${basePath}/builder/blocks/:id`, async c => {
    const deleted = await deleteBlock(c.env.CONTENT_KV, c.req.param('id'))
    if (!deleted) return c.json({ error: 'Block not found' }, 404)
    return c.json({ deleted: true, id: c.req.param('id') })
  })

  app.put(`${basePath}/builder/reorder`, async c => {
    let body: { ids?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
    if (!Array.isArray(body.ids) || body.ids.some(x => typeof x !== 'string')) {
      return c.json({ error: 'ids must be an array of strings' }, 400)
    }
    try {
      await reorderBlocks(c.env.CONTENT_KV, body.ids as string[])
    } catch (err) {
      return c.json({ error: 'Invalid reorder', message: (err as Error).message }, 400)
    }
    return c.json({ ids: body.ids })
  })

  app.post(`${basePath}/builder/feedback/:id`, async c => {
    let body: { text?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
    const text = typeof body.text === 'string' ? body.text : ''
    const feedback = await setFeedback(c.env.CONTENT_KV, c.req.param('id'), text)
    return c.json({ feedback })
  })

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

      const client = createLLMClient(c.env)
      const response = await sendChatCompletion(client, messages)
      return c.json(response)
    } catch (error) {
      logger.error('chat completion failed', { error: (error as Error).message })
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
          if (content)
            // Normalized on the way OUT so variants minted before the
            // typography cleanup (whose slugs recruiters already hold) come
            // out clean without re-minting.
            return c.json({
              content: normalizeTypography(content),
              variant: variant.slug,
              label: variant.label,
              cover_letter: variant.cover_letter_markdown
                ? normalizeTypography(variant.cover_letter_markdown)
                : null,
              company: variant.company ?? null,
              job_title: variant.job_title ?? null
            })
        }
      }

      const content = await getResumeContent(c.env)
      return c.json({ content: normalizeTypography(content) })
    } catch (error) {
      logger.error('resume retrieval failed', { error: (error as Error).message })
      return c.json({ error: 'Failed to retrieve resume', message: (error as Error).message }, 500)
    }
  })

  // The résumé as a real file, rendered server-side from the same canonical
  // markdown /resume serves — the UI download button points here instead of
  // reconstructing the document through the browser's print dialog.
  // Same visibility and variant semantics as /resume, including the fall-back
  // to the full résumé on an unknown/expired slug.
  app.get(`${basePath}/resume.pdf`, async c => {
    try {
      const slug = c.req.query('v')
      let content: string | null = null
      let coverLetter: string | null = null
      // Deliberately the same filename for every variant/packet: a recruiter
      // sees one clean "<owner>-resume.pdf" whichever tailored link they got.
      const filename = `${filenameBase}.pdf`

      if (slug) {
        const variant = await getVariant(c.env.CONTENT_KV, slug)
        if (variant) {
          const rendered = await renderVariant(c.env.CONTENT_KV, variant)
          if (rendered) {
            content = rendered
            coverLetter = variant.cover_letter_markdown ?? null
          }
        }
      }

      if (!content) content = await getResumeContent(c.env)

      const bytes = await renderResumePdf({
        resume: normalizeTypography(content),
        coverLetter: coverLetter ? normalizeTypography(coverLetter) : null,
        ownerName
      })
      // Copy into a fresh ArrayBuffer — hono's BodyInit typing rejects the
      // ArrayBufferLike-backed view pdf-lib returns.
      return c.body(new Uint8Array(bytes).buffer, 200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`
      })
    } catch (error) {
      logger.error('resume pdf rendering failed', { error: (error as Error).message })
      return c.json(
        { error: 'Failed to render resume PDF', message: (error as Error).message },
        500
      )
    }
  })

  // Variant management — friend and up, enforced by the requireMinTier gates above.
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
      const client = createLLMClient(c.env)
      const variant = await mintVariant(client, c.env.CONTENT_KV, body)
      return c.json(variant)
    } catch (error) {
      logger.error('variant mint failed', { error: (error as Error).message })
      return c.json({ error: 'Failed to mint variant', message: (error as Error).message }, 400)
    }
  })

  app.get(`${basePath}/variants`, async c => {
    try {
      const variants = await listVariants(c.env.CONTENT_KV)
      return c.json({ variants })
    } catch (error) {
      logger.error('variant list failed', { error: (error as Error).message })
      return c.json({ error: 'Failed to list variants', message: (error as Error).message }, 500)
    }
  })

  app.delete(`${basePath}/variants/:slug`, async c => {
    try {
      const deleted = await deleteVariant(c.env.CONTENT_KV, c.req.param('slug'))
      return deleted ? c.json({ deleted: true }) : c.json({ error: 'Not found' }, 404)
    } catch (error) {
      logger.error('variant delete failed', { error: (error as Error).message })
      return c.json({ error: 'Failed to delete variant', message: (error as Error).message }, 500)
    }
  })

  app.get(`${basePath}/system-prompt`, async c => {
    try {
      const systemPrompt = await getFullSystemPrompt(c.env, ownerName)
      return c.json({ systemPrompt })
    } catch (error) {
      logger.error('system-prompt retrieval failed', { error: (error as Error).message })
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
      const client = createLLMClient(c.env)
      const result = await generateTailoredResume(client, c.env.CONTENT_KV, body)
      return c.json(result)
    } catch (error) {
      logger.error('tailored-resume generation failed', {
        error: (error as Error).message,
        company: body.company,
        jobTitle: body.job_title
      })
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
      const client = createLLMClient(c.env)
      const resumeContent = await getResumeContent(c.env)
      const result = await generateCoverLetter(client, c.env.CONTENT_KV, resumeContent, body)
      return c.json(result)
    } catch (error) {
      logger.error('cover-letter generation failed', {
        error: (error as Error).message,
        company: body.company,
        jobTitle: body.job_title
      })
      return c.json(
        { error: 'Failed to generate cover letter', message: (error as Error).message },
        500
      )
    }
  })

  app.post(`${basePath}/application-extras`, async c => {
    let body: ApplicationExtrasRequest
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid request body' }, 400)
    }

    if (!body.job_title || !body.company || !body.description || !body.resume_markdown) {
      return c.json(
        {
          error: 'Missing required fields: job_title, company, description, resume_markdown'
        },
        400
      )
    }

    try {
      const client = createLLMClient(c.env)
      const result = await generateApplicationExtras(client, c.env.CONTENT_KV, body)
      return c.json(result)
    } catch (error) {
      logger.error('application-extras generation failed', {
        error: (error as Error).message,
        company: body.company,
        jobTitle: body.job_title
      })
      return c.json(
        { error: 'Failed to generate application extras', message: (error as Error).message },
        500
      )
    }
  })

  app.notFound(c => c.json({ error: 'Not found' }, 404))
  app.onError((err, c) => {
    // Backstop for anything the route handlers let bubble (e.g. the builder KV
    // ops, which have no local try/catch).
    logger.error('unhandled error', { error: err.message, method: c.req.method, path: c.req.path })
    return c.json({ error: 'Internal server error' }, 500)
  })

  return app
}

export type { ResumeEnv }
