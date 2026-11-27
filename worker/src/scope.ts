/**
 * Whose résumé content a request reads and writes.
 *
 * The owner's content is the original global set: `resume:blocks:<id>`,
 * `resume:variant:<slug>`, `resume:profile:contact` and the unprefixed derived
 * caches. Those keys are unchanged, so nothing about the owner moves.
 *
 * Every other user gets their own key space, with their registry userId in
 * every key (`resume:blocks:<userId>:<id>`, `resume:variant:<userId>:<slug>`,
 * ...). Nothing reads across that boundary: a user's tailoring loads only the
 * user's blocks, and a user with no blocks gets an error, never the owner's.
 */
import { tierAtLeast, type HadokuAuthContext } from '@wolffm/worker-utils'

export type ContentScope = { kind: 'owner' } | { kind: 'user'; userId: string }

export const OWNER_SCOPE: ContentScope = { kind: 'owner' }

/** The env vars scope resolution reads. Both are plain `[vars]`, not secrets. */
export interface ScopeEnv {
  /**
   * The owner's registry userId. A request whose effective user is this id
   * reads the owner's (global) content. Unset: only an admin caller does.
   */
  RESUME_OWNER_USER_ID?: string
  /**
   * Comma-separated registry userIds of service callers allowed to name the
   * user they are acting for (`on_behalf_of_user_id`). Today that is
   * jobplatform-api, which reaches this worker as its own service identity.
   */
  ON_BEHALF_CALLER_USER_IDS?: string
}

/** Thrown when a user-scoped generator finds no blocks for that user. */
export class NoResumeBlocksError extends Error {
  readonly code = 'NO_RESUME_BLOCKS'
  constructor(scope: ContentScope) {
    super(
      scope.kind === 'owner'
        ? 'No resume blocks found in KV storage'
        : 'No resume blocks for this user. Import a resume first (POST /blocks/import).'
    )
    this.name = 'NoResumeBlocksError'
  }
}

export type ScopeResult = { scope: ContentScope } | { status: 400 | 403; error: string }

/** A userId goes into KV keys, so it must be a plain token: no ':' and no spaces. */
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

function listed(csv: string | undefined, id: string): boolean {
  return (csv ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .includes(id)
}

/**
 * Decide the scope from the edge-verified identity.
 *
 * - `onBehalfOf` (a service caller naming the user it acts for) is honoured
 *   only for an admin, or a service caller whose OWN edge-verified userId is
 *   listed in ON_BEHALF_CALLER_USER_IDS. Anyone else naming a user gets 403:
 *   a friend cannot read another user's content by naming them.
 * - Otherwise an admin caller is the owner.
 * - Otherwise the caller's own userId decides: the owner's id maps to the
 *   owner scope, any other id to that user's own scope.
 * - No userId at all (a request that did not come through the edge) is 403.
 *   It never falls back to the owner.
 */
export function resolveScope(
  auth: HadokuAuthContext | undefined,
  env: ScopeEnv,
  onBehalfOf?: unknown
): ScopeResult {
  const named = typeof onBehalfOf === 'string' ? onBehalfOf.trim() : ''
  let userId: string | null
  if (named) {
    const callerId = auth?.userId ?? null
    const allowed =
      tierAtLeast(auth, 'admin') ||
      (tierAtLeast(auth, 'service') &&
        !!callerId &&
        listed(env.ON_BEHALF_CALLER_USER_IDS, callerId))
    if (!allowed) {
      return {
        status: 403,
        error:
          'Only admin, or a service caller listed in ON_BEHALF_CALLER_USER_IDS, may act on behalf of a user.'
      }
    }
    userId = named
  } else if (tierAtLeast(auth, 'admin')) {
    return { scope: OWNER_SCOPE }
  } else {
    userId = auth?.userId ?? null
  }

  if (!userId) {
    return { status: 403, error: 'No caller identity: reach this API through hadoku.me.' }
  }
  if (!USER_ID_PATTERN.test(userId)) {
    return { status: 400, error: 'Malformed user id' }
  }
  const ownerId = env.RESUME_OWNER_USER_ID?.trim()
  if (ownerId && userId === ownerId) return { scope: OWNER_SCOPE }
  return { scope: { kind: 'user', userId } }
}

/**
 * The KV keys one scope owns. The owner's are exactly the keys the worker has
 * always used; a user's carry the userId right after the namespace.
 */
export interface ScopeKeys {
  blockIndex: string
  block(id: string): string
  feedback: string
  contact: string
  /** Where a variant minted in this scope is stored. */
  variant(slug: string): string
  /** The prefix `listVariants` walks for this scope. */
  variantListPrefix: string
  /** Prefix handed to `cacheKey` for one kind of derived output. */
  cache(kind: DerivedCacheKind): string
}

export type DerivedCacheKind = 'tailored' | 'coverletter' | 'extras' | 'form-answers'

export function scopeKeys(scope: ContentScope): ScopeKeys {
  if (scope.kind === 'owner') {
    return {
      blockIndex: 'resume:blocks:index',
      block: id => `resume:blocks:${id}`,
      feedback: 'resume:blocks:feedback',
      contact: 'resume:profile:contact',
      variant: slug => `resume:variant:${slug}`,
      variantListPrefix: 'resume:variant:',
      cache: kind => `resume:${kind}`
    }
  }
  const u = scope.userId
  return {
    blockIndex: `resume:blocks:${u}:index`,
    block: id => `resume:blocks:${u}:${id}`,
    feedback: `resume:blocks:${u}:feedback`,
    contact: `resume:profile:contact:${u}`,
    variant: slug => `resume:variant:${u}:${slug}`,
    variantListPrefix: `resume:variant:${u}:`,
    cache: kind => `resume:${kind}:${u}`
  }
}

/**
 * Points a user variant's slug at its owner, so the public `/resume?v=<slug>`
 * link (which carries only the slug) can find it. Deliberately NOT under
 * `resume:variant:`, so the owner's variant listing never walks it.
 */
export function variantOwnerKey(slug: string): string {
  return `resume:variant-owner:${slug}`
}

/** The cache prefixes a block edit in this scope must bust. */
export function derivedCachePrefixes(scope: ContentScope): string[] {
  const keys = scopeKeys(scope)
  return (['tailored', 'coverletter', 'extras'] as const).map(kind => `${keys.cache(kind)}:`)
}

/**
 * True when a key under one of the owner's cache prefixes actually belongs to
 * a user (`resume:tailored:<userId>:<hash>`). The owner's own cache keys are
 * `<prefix>:<64 hex>` with no further ':'.
 */
export function isUserScopedRemainder(remainder: string): boolean {
  return remainder.includes(':')
}
