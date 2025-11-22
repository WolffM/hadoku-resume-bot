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
}

export interface ApiError {
  error: string
  message?: string
  retryAfter?: number
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:3001'

/**
 * Send a chat message to the backend
 */
export async function sendChatMessage(messages: ChatMessage[]): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
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
 * Fetch the resume content from the backend
 */
export async function fetchResume(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/resume`)

  if (!response.ok) {
    const errorData = (await response.json()) as ApiError
    throw new Error(errorData.error || 'Failed to fetch resume')
  }

  const data = (await response.json()) as ResumeResponse
  return data.content
}
