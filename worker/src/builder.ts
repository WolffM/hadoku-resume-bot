import type { KVNamespace } from '@cloudflare/workers-types'
import { getAllBlocks, type ResumeBlock } from './blocks.js'
import {
  OWNER_SCOPE,
  derivedCachePrefixes,
  isUserScopedRemainder,
  scopeKeys,
  type ContentScope
} from './scope.js'

// KV layout (shared with resume_ingest.py --blocks):
//   resume:blocks:index      → JSON string[] of block ids, in render order
//   resume:blocks:{id}        → JSON ResumeBlock
//   resume:blocks:feedback    → JSON { [id]: { text, updated } } (builder-only)
// `index` and `feedback` are reserved ids so they can't collide with a block key.
//
// That is the OWNER's layout. Every function here takes an optional scope and
// defaults to the owner; a user scope uses the same three keys with the
// userId after `resume:blocks:` (scope.ts), so users never touch the owner's.
const RESERVED_IDS = new Set(['index', 'feedback'])

const BLOCK_TYPES: ReadonlySet<ResumeBlock['type']> = new Set([
  'experience',
  'project',
  'skills',
  'education',
  'summary',
  'header'
])
const BLOCK_FIELDS: ReadonlySet<string> = new Set([
  'id',
  'type',
  'tags',
  'title',
  'content',
  'priority'
])

export interface BlockFeedbackEntry {
  text: string
  updated: string
}
export type BlockFeedback = Record<string, BlockFeedbackEntry>

/**
 * Strictly validate an untrusted block, mirroring resume_ingest.py: exact field
 * set (no missing, no extra), known type, tags is a string[], priority is an
 * integer, id is a safe non-reserved slug. Throws with a human message on any
 * violation; returns the typed block on success.
 */
export function validateBlock(raw: unknown): ResumeBlock {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('block must be an object')
  }
  const b = raw as Record<string, unknown>
  const keys = Object.keys(b)
  const missing = [...BLOCK_FIELDS].filter(f => !keys.includes(f))
  const extra = keys.filter(k => !BLOCK_FIELDS.has(k))
  if (missing.length) throw new Error(`missing field(s): ${missing.join(', ')}`)
  if (extra.length) throw new Error(`unexpected field(s): ${extra.join(', ')}`)

  if (typeof b.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(b.id)) {
    throw new Error('id must be a kebab-case slug (a-z, 0-9, hyphen)')
  }
  if (RESERVED_IDS.has(b.id)) throw new Error(`id '${b.id}' is reserved`)
  if (typeof b.type !== 'string' || !BLOCK_TYPES.has(b.type as ResumeBlock['type'])) {
    throw new Error(`type must be one of: ${[...BLOCK_TYPES].join(', ')}`)
  }
  if (!Array.isArray(b.tags) || b.tags.some(t => typeof t !== 'string')) {
    throw new Error('tags must be an array of strings')
  }
  if (typeof b.title !== 'string') throw new Error('title must be a string')
  if (typeof b.content !== 'string') throw new Error('content must be a string')
  if (typeof b.priority !== 'number' || !Number.isInteger(b.priority)) {
    throw new Error('priority must be an integer')
  }

  return {
    id: b.id,
    type: b.type as ResumeBlock['type'],
    tags: b.tags as string[],
    title: b.title,
    content: b.content,
    priority: b.priority
  }
}

async function getIndex(kv: KVNamespace, scope: ContentScope): Promise<string[]> {
  const json = await kv.get(scopeKeys(scope).blockIndex)
  return json ? (JSON.parse(json) as string[]) : []
}

/**
 * Drop every cached tailored resume / cover letter. Block edits change what the
 * tailoring pipeline would produce, but those caches are keyed by job hash, not
 * by block — so a plain edit would otherwise serve stale output for 24h.
 */
async function bustDerivedCaches(kv: KVNamespace, scope: ContentScope): Promise<void> {
  for (const prefix of derivedCachePrefixes(scope)) {
    let cursor: string | undefined
    do {
      const page = await kv.list({ prefix, cursor })
      // The owner's prefixes also cover users' caches (`resume:tailored:<userId>:…`);
      // an owner edit changes nothing a user generates, so those stay.
      const mine =
        scope.kind === 'owner'
          ? page.keys.filter(k => !isUserScopedRemainder(k.name.slice(prefix.length)))
          : page.keys
      await Promise.all(mine.map(k => kv.delete(k.name)))
      cursor = page.list_complete ? undefined : page.cursor
    } while (cursor)
  }
}

/** Create or update a block. New ids are appended to the render index. */
export async function upsertBlock(
  kv: KVNamespace,
  block: ResumeBlock,
  scope: ContentScope = OWNER_SCOPE
): Promise<void> {
  const keys = scopeKeys(scope)
  await kv.put(keys.block(block.id), JSON.stringify(block))
  const index = await getIndex(kv, scope)
  if (!index.includes(block.id)) {
    index.push(block.id)
    await kv.put(keys.blockIndex, JSON.stringify(index))
  }
  await bustDerivedCaches(kv, scope)
}

/**
 * Replace a scope's whole block set in one go: the import path. Blocks no
 * longer present are deleted, the index is rewritten in the given order, and
 * the scope's derived caches are busted once. Refuses the owner's set, which
 * is edited block by block through the admin builder only.
 */
export async function replaceBlocks(
  kv: KVNamespace,
  blocks: ResumeBlock[],
  scope: ContentScope
): Promise<void> {
  if (scope.kind === 'owner') throw new Error("refusing to replace the owner's block set")
  const keys = scopeKeys(scope)
  const next = new Set(blocks.map(b => b.id))
  const previous = await getIndex(kv, scope)
  await Promise.all(previous.filter(id => !next.has(id)).map(id => kv.delete(keys.block(id))))
  await Promise.all(blocks.map(b => kv.put(keys.block(b.id), JSON.stringify(b))))
  await kv.put(keys.blockIndex, JSON.stringify(blocks.map(b => b.id)))
  await bustDerivedCaches(kv, scope)
}

/** Delete a block + drop it from the index. Returns false if it wasn't present. */
export async function deleteBlock(
  kv: KVNamespace,
  id: string,
  scope: ContentScope = OWNER_SCOPE
): Promise<boolean> {
  const keys = scopeKeys(scope)
  const index = await getIndex(kv, scope)
  if (!index.includes(id)) return false
  await kv.delete(keys.block(id))
  await kv.put(keys.blockIndex, JSON.stringify(index.filter(x => x !== id)))
  await bustDerivedCaches(kv, scope)
  return true
}

/**
 * Replace the render order. `ids` must be a permutation of the current index.
 *
 * Busts the derived caches like the other two writers: order decides what the
 * résumé actually reads like, so a reorder changes the generated output even
 * though no block's content moved. It did not bust before, which only went
 * unnoticed because the 24h TTL swept everything overnight anyway.
 */
export async function reorderBlocks(
  kv: KVNamespace,
  ids: string[],
  scope: ContentScope = OWNER_SCOPE
): Promise<void> {
  const current = await getIndex(kv, scope)
  const currentSet = new Set(current)
  const nextSet = new Set(ids)
  if (ids.length !== current.length || [...currentSet].some(id => !nextSet.has(id))) {
    throw new Error('reorder must be a permutation of the existing block ids')
  }
  await kv.put(scopeKeys(scope).blockIndex, JSON.stringify(ids))
  await bustDerivedCaches(kv, scope)
}

export async function getFeedback(
  kv: KVNamespace,
  scope: ContentScope = OWNER_SCOPE
): Promise<BlockFeedback> {
  const json = await kv.get(scopeKeys(scope).feedback)
  return json ? (JSON.parse(json) as BlockFeedback) : {}
}

/** Upsert (or clear, when text is empty) one block's review note. */
export async function setFeedback(
  kv: KVNamespace,
  id: string,
  text: string,
  scope: ContentScope = OWNER_SCOPE
): Promise<BlockFeedback> {
  const feedback = await getFeedback(kv, scope)
  if (text.trim()) {
    feedback[id] = { text, updated: new Date().toISOString() }
  } else {
    delete feedback[id]
  }
  await kv.put(scopeKeys(scope).feedback, JSON.stringify(feedback))
  return feedback
}

/** Blocks in render order — the exact array shape `blocks.json` holds, for git backup. */
export async function exportBlocks(
  kv: KVNamespace,
  scope: ContentScope = OWNER_SCOPE
): Promise<ResumeBlock[]> {
  return getAllBlocks(kv, scope)
}
