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

export interface SystemPromptResponse {
  systemPrompt: string
}

export interface ApiError {
  error: string
  message?: string
  retryAfter?: number
}

// Runtime API base URL - set by the mount function
let API_BASE_URL = 'http://localhost:3001' // Default for development

/**
 * Set the API base URL at runtime
 * Called by the mount function with the apiBaseUrl prop
 */
export function setApiBaseUrl(url: string): void {
  API_BASE_URL = url
}

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

/**
 * Fetch the system prompt from the backend
 */
export async function fetchSystemPrompt(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/system-prompt`)

  if (!response.ok) {
    const errorData = (await response.json()) as ApiError
    throw new Error(errorData.error || 'Failed to fetch system prompt')
  }

  const data = (await response.json()) as SystemPromptResponse
  return data.systemPrompt
}
