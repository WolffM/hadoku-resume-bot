import type { KVNamespace } from '@cloudflare/workers-types'
import type OpenAI from 'openai'
import { getAllBlocks } from './blocks.js'
import { generateTailoredResume } from './tailored-resume.js'

const VARIANT_PREFIX = 'resume:variant:'

export interface ResumeVariant {
  slug: string
  label: string
  /** Pre-rendered markdown; takes precedence over block_ids when present */
  markdown?: string
  /** Assembled from blocks at read time, in this order */
  block_ids?: string[]
  created_at: string
}

export interface MintVariantRequest {
  label: string
  slug?: string
  markdown?: string
  block_ids?: string[]
  /** Alternative to markdown/block_ids: run the tailoring pipeline at mint time */
  job_title?: string
  company?: string
  description?: string
  profile_type?: string
  tailor?: boolean
  /** Auto-expire the link after this many days */
  ttl_days?: number
}

function randomSlug(): string {
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

export async function getVariant(kv: KVNamespace, slug: string): Promise<ResumeVariant | null> {
  const json = await kv.get(`${VARIANT_PREFIX}${slug}`)
  return json ? (JSON.parse(json) as ResumeVariant) : null
}

/** Resolve a variant to resume markdown. Returns null when it holds no renderable content. */
export async function renderVariant(
  kv: KVNamespace,
  variant: ResumeVariant
): Promise<string | null> {
  if (variant.markdown) return variant.markdown

  if (variant.block_ids?.length) {
    const blocks = await getAllBlocks(kv)
    const byId = new Map(blocks.map(b => [b.id, b]))
    const parts = variant.block_ids
      .map(id => byId.get(id)?.content)
      .filter((content): content is string => content !== undefined)
    if (parts.length > 0) return parts.join('\n\n')
  }

  return null
}

export async function mintVariant(
  client: OpenAI,
  kv: KVNamespace,
  req: MintVariantRequest
): Promise<ResumeVariant> {
  const slug = req.slug ?? randomSlug()

  const variant: ResumeVariant = {
    slug,
    label: req.label,
    created_at: new Date().toISOString()
  }

  if (req.markdown) {
    variant.markdown = req.markdown
  } else if (req.block_ids?.length) {
    const blocks = await getAllBlocks(kv)
    const validIds = new Set(blocks.map(b => b.id))
    const unknown = req.block_ids.filter(id => !validIds.has(id))
    if (unknown.length > 0) {
      throw new Error(`Unknown block ids: ${unknown.join(', ')}`)
    }
    variant.block_ids = req.block_ids
  } else if (req.job_title && req.company && req.description) {
    const tailored = await generateTailoredResume(client, kv, {
      job_title: req.job_title,
      company: req.company,
      description: req.description,
      profile_type: req.profile_type,
      tailor: req.tailor
    })
    variant.markdown = tailored.resume_markdown
    variant.block_ids = tailored.blocks_used
  } else {
    throw new Error(
      'Variant needs content: provide markdown, block_ids, or job_title+company+description'
    )
  }

  const opts =
    req.ttl_days && req.ttl_days > 0
      ? { expirationTtl: Math.round(req.ttl_days * 86400) }
      : undefined
  await kv.put(`${VARIANT_PREFIX}${slug}`, JSON.stringify(variant), opts)
  return variant
}

export interface VariantSummary {
  slug: string
  label: string
  created_at: string
  source: 'markdown' | 'blocks'
}

export async function listVariants(kv: KVNamespace): Promise<VariantSummary[]> {
  const summaries: VariantSummary[] = []
  let cursor: string | undefined
  do {
    const page = await kv.list({ prefix: VARIANT_PREFIX, cursor })
    const variants = await Promise.all(page.keys.map(k => kv.get(k.name)))
    for (const json of variants) {
      if (!json) continue
      const v = JSON.parse(json) as ResumeVariant
      summaries.push({
        slug: v.slug,
        label: v.label,
        created_at: v.created_at,
        source: v.markdown ? 'markdown' : 'blocks'
      })
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  return summaries.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function deleteVariant(kv: KVNamespace, slug: string): Promise<boolean> {
  const existing = await kv.get(`${VARIANT_PREFIX}${slug}`)
  if (!existing) return false
  await kv.delete(`${VARIANT_PREFIX}${slug}`)
  return true
}
