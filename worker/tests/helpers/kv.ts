/**
 * An in-memory stand-in for a Cloudflare KV namespace: get / put / delete and a
 * paginated prefix `list`, which is everything the worker uses. Keys come back
 * from `list` in lexicographic order, as they do from real KV. TTLs are
 * recorded, not enforced.
 */
import type { KVNamespace } from '@cloudflare/workers-types'

export class MemoryKV {
  readonly store = new Map<string, string>()
  readonly ttls = new Map<string, number>()
  /** Small on purpose, so the list cursors are exercised. */
  pageSize = 3

  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }

  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value)
    if (opts?.expirationTtl) this.ttls.set(key, opts.expirationTtl)
    else this.ttls.delete(key)
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
    this.ttls.delete(key)
  }

  async list(opts: { prefix?: string; cursor?: string } = {}) {
    const prefix = opts.prefix ?? ''
    const all = [...this.store.keys()].filter(k => k.startsWith(prefix)).sort()
    const start = opts.cursor ? Number(opts.cursor) : 0
    const page = all.slice(start, start + this.pageSize)
    const next = start + this.pageSize
    const complete = next >= all.length
    return {
      keys: page.map(name => ({ name })),
      list_complete: complete,
      cursor: complete ? '' : String(next)
    }
  }

  /** Every key, sorted: the snapshot tests compare. */
  keys(): string[] {
    return [...this.store.keys()].sort()
  }

  asKV(): KVNamespace {
    return this as unknown as KVNamespace
  }
}
