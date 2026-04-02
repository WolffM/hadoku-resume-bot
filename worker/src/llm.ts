import OpenAI from 'openai'
import { LLM_CONFIG } from './constants.js'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
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

export function createLLMClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: LLM_CONFIG.BASE_URL
  })
}

export async function sendChatCompletion(
  client: OpenAI,
  messages: ChatMessage[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<ChatResponse> {
  const response = await client.chat.completions.create({
    model: LLM_CONFIG.MODEL,
    messages,
    temperature: options?.temperature ?? LLM_CONFIG.TEMPERATURE,
    max_tokens: options?.maxTokens ?? LLM_CONFIG.MAX_TOKENS
  })

  const choice = response.choices[0]
  if (!choice || !choice.message?.content) {
    throw new Error('No response from LLM')
  }

  return {
    message: choice.message.content,
    usage: response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens
        }
      : undefined
  }
}
