import type { KVNamespace } from '@cloudflare/workers-types'
import { OWNER_SCOPE, scopeKeys, type ContentScope } from './scope.js'

export interface ResumeBlock {
  id: string
  type: 'experience' | 'project' | 'skills' | 'education' | 'summary' | 'header'
  tags: string[]
  title: string
  content: string
  priority: number
}

/**
 * Every block in one scope, in render order. Defaults to the owner's global
 * set; a user scope reads only that user's keys (scope.ts).
 */
export async function getAllBlocks(
  kv: KVNamespace,
  scope: ContentScope = OWNER_SCOPE
): Promise<ResumeBlock[]> {
  const keys = scopeKeys(scope)
  const indexJson = await kv.get(keys.blockIndex)
  if (!indexJson) return []

  const ids = JSON.parse(indexJson) as string[]
  const blocks = await Promise.all(
    ids.map(async id => {
      const json = await kv.get(keys.block(id))
      if (!json) return null
      return JSON.parse(json) as ResumeBlock
    })
  )

  return blocks.filter((b): b is ResumeBlock => b !== null)
}

export async function cacheKey(prefix: string, ...parts: string[]): Promise<string> {
  const combined = parts.join('|')
  const encoder = new TextEncoder()
  const data = encoder.encode(combined)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const hex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `${prefix}:${hex}`
}
