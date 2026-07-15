// Admin builder API client. All calls go through the edge-router (same-origin,
// credentials:'include') so the caller's admin session cookie is resolved into
// the X-Hadoku-Tier: admin stamp the worker's requireUserType(['admin']) needs.

export type BlockType = 'experience' | 'project' | 'skills' | 'education' | 'summary' | 'header'

export interface ResumeBlock {
  id: string
  type: BlockType
  tags: string[]
  title: string
  content: string
  priority: number
}

export interface FeedbackEntry {
  text: string
  updated: string
}
export type Feedback = Record<string, FeedbackEntry>

export class BuilderApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'BuilderApiError'
  }
}

let baseUrl = ''
export function setBuilderApiBaseUrl(url: string): void {
  baseUrl = url
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}/api/builder${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
  })
  if (!res.ok) {
    let detail = `${res.status}`
    try {
      const body = (await res.json()) as { error?: string; message?: string }
      detail = body.message ? `${body.error}: ${body.message}` : (body.error ?? detail)
    } catch {
      /* non-JSON error body */
    }
    throw new BuilderApiError(detail, res.status)
  }
  return (await res.json()) as T
}

export function fetchBlocks(): Promise<{ blocks: ResumeBlock[]; feedback: Feedback }> {
  return req('/blocks')
}

export function saveBlock(block: ResumeBlock): Promise<{ block: ResumeBlock }> {
  return req(`/blocks/${encodeURIComponent(block.id)}`, {
    method: 'PUT',
    body: JSON.stringify(block)
  })
}

export function deleteBlock(id: string): Promise<{ deleted: true; id: string }> {
  return req(`/blocks/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function reorderBlocks(ids: string[]): Promise<{ ids: string[] }> {
  return req('/reorder', { method: 'PUT', body: JSON.stringify({ ids }) })
}

export function saveFeedback(id: string, text: string): Promise<{ feedback: Feedback }> {
  return req(`/feedback/${encodeURIComponent(id)}`, {
    method: 'POST',
    body: JSON.stringify({ text })
  })
}
