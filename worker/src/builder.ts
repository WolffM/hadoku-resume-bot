import type { KVNamespace } from '@cloudflare/workers-types'
import { getAllBlocks, type ResumeBlock } from './blocks.js'

// KV layout (shared with resume_ingest.py --blocks):
//   resume:blocks:index      → JSON string[] of block ids, in render order
//   resume:blocks:{id}        → JSON ResumeBlock
//   resume:blocks:feedback    → JSON { [id]: { text, updated } } (builder-only)
// `index` and `feedback` are reserved ids so they can't collide with a block key.
const BLOCK_PREFIX = 'resume:blocks:'
const INDEX_KEY = 'resume:blocks:index'
const FEEDBACK_KEY = 'resume:blocks:feedback'
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

async function getIndex(kv: KVNamespace): Promise<string[]> {
  const json = await kv.get(INDEX_KEY)
  return json ? (JSON.parse(json) as string[]) : []
}

/**
 * Drop every cached tailored resume / cover letter. Block edits change what the
 * tailoring pipeline would produce, but those caches are keyed by job hash, not
 * by block — so a plain edit would otherwise serve stale output for 24h.
 */
async function bustDerivedCaches(kv: KVNamespace): Promise<void> {
  for (const prefix of ['resume:tailored:', 'resume:coverletter:']) {
    let cursor: string | undefined
    do {
      const page = await kv.list({ prefix, cursor })
      await Promise.all(page.keys.map(k => kv.delete(k.name)))
      cursor = page.list_complete ? undefined : page.cursor
    } while (cursor)
  }
}

/** Create or update a block. New ids are appended to the render index. */
export async function upsertBlock(kv: KVNamespace, block: ResumeBlock): Promise<void> {
  await kv.put(`${BLOCK_PREFIX}${block.id}`, JSON.stringify(block))
  const index = await getIndex(kv)
  if (!index.includes(block.id)) {
    index.push(block.id)
    await kv.put(INDEX_KEY, JSON.stringify(index))
  }
  await bustDerivedCaches(kv)
}

/** Delete a block + drop it from the index. Returns false if it wasn't present. */
export async function deleteBlock(kv: KVNamespace, id: string): Promise<boolean> {
  const index = await getIndex(kv)
  if (!index.includes(id)) return false
  await kv.delete(`${BLOCK_PREFIX}${id}`)
  await kv.put(INDEX_KEY, JSON.stringify(index.filter(x => x !== id)))
  await bustDerivedCaches(kv)
  return true
}

/** Replace the render order. `ids` must be a permutation of the current index. */
export async function reorderBlocks(kv: KVNamespace, ids: string[]): Promise<void> {
  const current = await getIndex(kv)
  const currentSet = new Set(current)
  const nextSet = new Set(ids)
  if (ids.length !== current.length || [...currentSet].some(id => !nextSet.has(id))) {
    throw new Error('reorder must be a permutation of the existing block ids')
  }
  await kv.put(INDEX_KEY, JSON.stringify(ids))
}

export async function getFeedback(kv: KVNamespace): Promise<BlockFeedback> {
  const json = await kv.get(FEEDBACK_KEY)
  return json ? (JSON.parse(json) as BlockFeedback) : {}
}

/** Upsert (or clear, when text is empty) one block's review note. */
export async function setFeedback(
  kv: KVNamespace,
  id: string,
  text: string
): Promise<BlockFeedback> {
  const feedback = await getFeedback(kv)
  if (text.trim()) {
    feedback[id] = { text, updated: new Date().toISOString() }
  } else {
    delete feedback[id]
  }
  await kv.put(FEEDBACK_KEY, JSON.stringify(feedback))
  return feedback
}

/** Blocks in render order — the exact array shape `blocks.json` holds, for git backup. */
export async function exportBlocks(kv: KVNamespace): Promise<ResumeBlock[]> {
  return getAllBlocks(kv)
}
