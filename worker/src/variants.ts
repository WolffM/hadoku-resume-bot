import type { KVNamespace } from '@cloudflare/workers-types'
import type { LLMChain } from './llm.js'
import { getAllBlocks, type ResumeBlock } from './blocks.js'
import { assembleResume, layoutFor, projectsAnchorText, restoreProjectsAnchor } from './skeleton.js'
import { generateTailoredResume } from './tailored-resume.js'
import { generateCoverLetter } from './cover-letter.js'
import { getContactProfile } from './contact.js'
import { OPERATION_BUDGET_MS } from './constants.js'
import {
  OWNER_SCOPE,
  isUserScopedRemainder,
  scopeKeys,
  variantOwnerKey,
  type ContentScope
} from './scope.js'

// Owner variants live at `resume:variant:<slug>`, as they always have. A
// user's live at `resume:variant:<userId>:<slug>`, with a slug -> userId
// pointer (scope.ts `variantOwnerKey`) so a shared `?v=<slug>` link still
// resolves from the slug alone. Slugs are unique across everyone.

export interface ResumeVariant {
  slug: string
  label: string
  /** Pre-rendered markdown; takes precedence over block_ids when present */
  markdown?: string
  /** Assembled from blocks at read time, in this order */
  block_ids?: string[]
  /** Tailored cover letter delivered alongside the résumé (the packet). */
  cover_letter_markdown?: string
  /** Posting context, so the delivered page can label the packet. */
  company?: string
  job_title?: string
  /**
   * The person the packet belongs to, for the PDF's file name and metadata.
   * Set on user variants only; the owner's use the handler's ownerName.
   */
  candidate_name?: string
  created_at: string
}

/** A variant together with whose it is. */
export interface ScopedVariant {
  variant: ResumeVariant
  scope: ContentScope
}

/** A slug safe to put in a key: what randomSlug emits, plus readable hyphens. */
const SLUG_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/** Thrown when a requested slug already belongs to someone else. */
export class SlugTakenError extends Error {
  constructor(slug: string) {
    super(`Variant slug '${slug}' is already taken`)
    this.name = 'SlugTakenError'
  }
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
  /** Pre-rendered cover letter to deliver with the résumé (skips generation). */
  cover_letter_markdown?: string
  /**
   * When minting via the tailoring path (job_title+company+description), also
   * generate a matching cover letter. Defaults to true; set false to skip the
   * extra LLM call. Ignored when cover_letter_markdown is supplied.
   */
  cover_letter?: boolean
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

/** One scope's variant by slug. Defaults to the owner's. */
export async function getVariant(
  kv: KVNamespace,
  slug: string,
  scope: ContentScope = OWNER_SCOPE
): Promise<ResumeVariant | null> {
  const json = await kv.get(scopeKeys(scope).variant(slug))
  return json ? (JSON.parse(json) as ResumeVariant) : null
}

/** A user's slug whose variant has expired or was deleted. */
export interface GoneVariant {
  gone: true
}

/**
 * Find a variant by slug alone, whoever's it is: the public `?v=<slug>` path.
 * The owner's key first (every link minted before per-user variants), then
 * the slug pointer to a user's. A slug with a ':' is refused outright, so
 * `?v=<userId>:<slug>` cannot read a user's variant as if it were the owner's.
 *
 * A user's pointer outlives the variant (it is written without a TTL and kept
 * on delete), so an expired or deleted user packet is reported as gone rather
 * than looking like an unknown slug, which the public routes answer with the
 * owner's resume.
 */
export async function findVariant(
  kv: KVNamespace,
  slug: string
): Promise<ScopedVariant | GoneVariant | null> {
  if (!slug || slug.includes(':')) return null
  const owned = await getVariant(kv, slug, OWNER_SCOPE)
  if (owned) return { variant: owned, scope: OWNER_SCOPE }
  const userId = await kv.get(variantOwnerKey(slug))
  if (!userId) return null
  const scope: ContentScope = { kind: 'user', userId }
  const variant = await getVariant(kv, slug, scope)
  return variant ? { variant, scope } : { gone: true }
}

/** Resolve a variant to resume markdown. Returns null when it holds no renderable content. */
export async function renderVariant(
  kv: KVNamespace,
  variant: ResumeVariant,
  scope: ContentScope = OWNER_SCOPE
): Promise<string | null> {
  if (scope.kind === 'user') {
    // A user's markdown is served as minted: the projects-anchor splice below
    // is the owner's verified paragraph and has no place in anyone else's.
    if (variant.markdown) return variant.markdown
    if (variant.block_ids?.length) {
      const byId = new Map((await getAllBlocks(kv, scope)).map(b => [b.id, b]))
      const chosen = variant.block_ids
        .map(id => byId.get(id))
        .filter((b): b is ResumeBlock => b !== undefined)
      if (chosen.length > 0) return assembleResume(chosen, layoutFor(scope))
    }
    return null
  }

  if (variant.markdown) {
    // The projects anchor carries verified platform figures and is exempt from
    // tailoring — splice the current canonical text over whatever the mint-time
    // rewrite stored, so links recruiters already hold stay accurate without
    // re-minting (same read-boundary rationale as normalizeTypography).
    const blocks = await getAllBlocks(kv)
    return restoreProjectsAnchor(variant.markdown, projectsAnchorText(blocks))
  }

  if (variant.block_ids?.length) {
    const blocks = await getAllBlocks(kv)
    const byId = new Map(blocks.map(b => [b.id, b]))
    const chosen = variant.block_ids
      .map(id => byId.get(id))
      .filter((b): b is ResumeBlock => b !== undefined)
    if (chosen.length > 0) return assembleResume(chosen)
  }

  return null
}

/**
 * The first `# ` heading of a résumé, which is the name line in every layout.
 * Used to name a user's PDF when no contact profile is stored.
 */
export function nameFromMarkdown(markdown: string | undefined): string | null {
  const line = markdown?.split('\n').find(l => /^# \S/.test(l))
  const name = line?.slice(2).replace(/[*_`]/g, '').trim()
  return name ? name.slice(0, 120) : null
}

/** Refuse a slug someone else already holds, in either key space. */
async function assertSlugFree(kv: KVNamespace, slug: string, scope: ContentScope): Promise<void> {
  const pointer = await kv.get(variantOwnerKey(slug))
  if (scope.kind === 'owner') {
    if (pointer) throw new SlugTakenError(slug)
    return
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error('slug must be 1-64 characters of A-Z, a-z, 0-9, hyphen or underscore')
  }
  if (pointer && pointer !== scope.userId) throw new SlugTakenError(slug)
  if (await kv.get(scopeKeys(OWNER_SCOPE).variant(slug))) throw new SlugTakenError(slug)
}

export async function mintVariant(
  client: LLMChain,
  kv: KVNamespace,
  req: MintVariantRequest,
  /** Whose variant this is. The owner's by default (see the key layout above). */
  scope: ContentScope = OWNER_SCOPE
): Promise<ResumeVariant> {
  const slug = req.slug ?? randomSlug()
  await assertSlugFree(kv, slug, scope)

  const variant: ResumeVariant = {
    slug,
    label: req.label,
    created_at: new Date().toISOString()
  }

  if (req.markdown) {
    variant.markdown = req.markdown
  } else if (req.block_ids?.length) {
    const blocks = await getAllBlocks(kv, scope)
    const validIds = new Set(blocks.map(b => b.id))
    const unknown = req.block_ids.filter(id => !validIds.has(id))
    if (unknown.length > 0) {
      throw new Error(`Unknown block ids: ${unknown.join(', ')}`)
    }
    variant.block_ids = req.block_ids
  } else if (req.job_title && req.company && req.description) {
    // ONE budget for the whole mint, not one per call. This is the only path
    // that runs three sequential completions (selection, rewrite, cover letter)
    // and it is the slowest thing this worker does: 100,042ms measured on
    // 2026-08-22, against an edge that gives up at 120s. Giving each call its
    // own fresh budget is what let three of them stack past the timeout.
    const deadline = Date.now() + OPERATION_BUDGET_MS

    const tailored = await generateTailoredResume(
      client,
      kv,
      {
        job_title: req.job_title,
        company: req.company,
        description: req.description,
        profile_type: req.profile_type,
        tailor: req.tailor
      },
      deadline,
      scope
    )
    variant.markdown = tailored.resume_markdown
    variant.block_ids = tailored.blocks_used

    // Deliver a matching cover letter as part of the packet unless opted out or
    // one was supplied pre-rendered (handled below).
    //
    // Best-effort, and that is a FIX, not a shortcut. This used to throw
    // straight out of mintVariant, so a cover letter that failed took the
    // finished résumé down with it and the whole mint 400'd — observed
    // 2026-08-21 at 58,150ms, where the caller waited nearly a minute to
    // receive nothing despite the résumé having already succeeded. A packet
    // with a résumé and no letter is strictly better than no packet, and the
    // absence of cover_letter_markdown in the response is the signal that it
    // happened.
    if (req.cover_letter !== false && !req.cover_letter_markdown) {
      try {
        const letter = await generateCoverLetter(
          client,
          kv,
          tailored.resume_markdown,
          {
            job_title: req.job_title,
            company: req.company,
            description: req.description
          },
          deadline,
          scope
        )
        variant.cover_letter_markdown = letter.cover_letter_markdown
      } catch {
        // Ship the résumé alone. Nothing to clean up: the letter is a field on
        // the variant, so leaving it unset IS the degraded state.
      }
    }
  } else {
    throw new Error(
      'Variant needs content: provide markdown, block_ids, or job_title+company+description'
    )
  }

  // Pre-rendered cover letter + posting context (any path). The packet flow in
  // jobplatform generates the résumé and cover letter separately — each within
  // its own edge timeout carve-out — then mints one variant carrying both.
  if (req.cover_letter_markdown) variant.cover_letter_markdown = req.cover_letter_markdown
  if (req.job_title) variant.job_title = req.job_title
  if (req.company) variant.company = req.company

  if (scope.kind === 'user') {
    const contact = await getContactProfile(kv, scope)
    const name = contact?.name || nameFromMarkdown(variant.markdown)
    if (name) variant.candidate_name = name
  }

  const opts =
    req.ttl_days && req.ttl_days > 0
      ? { expirationTtl: Math.round(req.ttl_days * 86400) }
      : undefined
  await kv.put(scopeKeys(scope).variant(slug), JSON.stringify(variant), opts)
  // No TTL on the pointer: once the variant expires, the slug must still read
  // as this user's (gone), never fall through to the owner's resume.
  if (scope.kind === 'user') await kv.put(variantOwnerKey(slug), scope.userId)
  return variant
}

export interface VariantSummary {
  slug: string
  label: string
  created_at: string
  source: 'markdown' | 'blocks'
}

/**
 * One scope's variants, newest first. The owner's listing walks the owner's
 * prefix and skips the users' keys nested under it; a user's walks only
 * `resume:variant:<userId>:`.
 */
export async function listVariants(
  kv: KVNamespace,
  scope: ContentScope = OWNER_SCOPE
): Promise<VariantSummary[]> {
  const prefix = scopeKeys(scope).variantListPrefix
  const summaries: VariantSummary[] = []
  let cursor: string | undefined
  do {
    const page = await kv.list({ prefix, cursor })
    const mine =
      scope.kind === 'owner'
        ? page.keys.filter(k => !isUserScopedRemainder(k.name.slice(prefix.length)))
        : page.keys
    const variants = await Promise.all(mine.map(k => kv.get(k.name)))
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

export async function deleteVariant(
  kv: KVNamespace,
  slug: string,
  scope: ContentScope = OWNER_SCOPE
): Promise<boolean> {
  if (slug.includes(':')) return false
  const key = scopeKeys(scope).variant(slug)
  const existing = await kv.get(key)
  if (!existing) return false
  // A user's slug pointer stays, so the deleted packet's public link answers
  // "gone" instead of serving the owner's resume, and nobody else can take
  // the slug over.
  await kv.delete(key)
  return true
}
