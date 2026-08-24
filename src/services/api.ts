export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatResponse {
  message: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface ResumeResponse {
  content: string
  variant?: string
  label?: string
  cover_letter?: string | null
  company?: string | null
  job_title?: string | null
}

/** The delivered application packet: résumé + optional tailored cover letter. */
export interface ResumePacket {
  content: string
  coverLetter: string | null
  variant: string | null
  label: string | null
  company: string | null
  jobTitle: string | null
}

export interface ApiError {
  error: string
  message?: string
  retryAfter?: number
}

// Runtime API root — always set by mount() via setApiBaseUrl(props.apiBaseUrl).
// The dev harness (index.html) supplies https://hadoku.me/resume/api; prod passes
// the real path. Empty until then — there is no local backend to default to (the
// old Express server was removed).
let API_BASE_URL = ''

/**
 * Set the API root at runtime.
 * Called by the mount function with the apiBaseUrl prop, which is the API root
 * ('/resume/api') — endpoints are appended to it directly.
 */
export function setApiBaseUrl(url: string): void {
  API_BASE_URL = url.replace(/\/+$/, '')
}

/**
 * Send a chat message to the backend
 */
export async function sendChatMessage(messages: ChatMessage[]): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messages })
  })

  if (!response.ok) {
    const errorData = (await response.json()) as ApiError
    throw new Error(errorData.message || errorData.error || 'Failed to send message')
  }

  return (await response.json()) as ChatResponse
}

/**
 * Fetch the resume content from the backend.
 * Pass a variant slug to fetch a link-tailored resume; the API falls back to
 * the full resume for unknown or expired slugs.
 */
export async function fetchResume(variant?: string): Promise<ResumePacket> {
  const url = variant
    ? `${API_BASE_URL}/resume?v=${encodeURIComponent(variant)}`
    : `${API_BASE_URL}/resume`
  const response = await fetch(url)

  if (!response.ok) {
    const errorData = (await response.json()) as ApiError
    throw new Error(errorData.error || 'Failed to fetch resume')
  }

  const data = (await response.json()) as ResumeResponse
  return {
    content: data.content,
    coverLetter: data.cover_letter ?? null,
    variant: data.variant ?? null,
    label: data.label ?? null,
    company: data.company ?? null,
    jobTitle: data.job_title ?? null
  }
}

/**
 * URL of the server-rendered resume PDF (the packet, when the variant carries a
 * cover letter). Same variant fall-back semantics as fetchResume.
 *
 * Returned as a URL rather than a fetched Blob on purpose: the endpoint already
 * sends `Content-Disposition: attachment` with the owner's filename, so linking
 * straight at it downloads the file with no object URL in the middle — and an
 * attachment cannot be hijacked by a browser's "open PDFs in Firefox" handler
 * the way a `blob:` URL can.
 */
export function resumePdfUrl(variant?: string): string {
  return variant
    ? `${API_BASE_URL}/resume.pdf?v=${encodeURIComponent(variant)}`
    : `${API_BASE_URL}/resume.pdf`
}
