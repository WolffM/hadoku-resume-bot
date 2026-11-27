/**
 * A scripted LLM provider. It records every prompt it is sent and answers by
 * recognising which generator is asking, so tests can assert on the exact
 * prompts and on what was assembled from the answers.
 */
import type { ChatMessage, ChatResponse, LLMChain, LLMProvider } from '../../src/llm.js'

export interface FakeLLM {
  chain: LLMChain
  prompts: string[]
}

export interface FakeLLMOptions {
  /** The block ids the selection pass answers with. */
  select?: (prompt: string) => string[]
  /** What the tailoring pass returns for the résumé it was given. */
  tailor?: (resume: string) => string
}

/** Every block id the selection prompt offered, in the order offered. */
export function offeredIds(prompt: string): string[] {
  return [...prompt.matchAll(/^ID: (.+)$/gm)].map(m => m[1])
}

export function fakeLLM(opts: FakeLLMOptions = {}): FakeLLM {
  const prompts: string[] = []
  const provider: LLMProvider = {
    name: 'fake',
    model: 'fake-model',
    attemptTimeoutMs: 5_000,
    async complete(messages: ChatMessage[]): Promise<ChatResponse> {
      const prompt = messages.map(m => m.content).join('\n')
      prompts.push(prompt)
      if (prompt.startsWith('You are assembling a tailored resume')) {
        const ids = opts.select ? opts.select(prompt) : offeredIds(prompt)
        return { message: JSON.stringify(ids), provider: 'fake' }
      }
      if (prompt.startsWith('You are tailoring a resume')) {
        const resume = prompt.split('Resume to tailor:\n')[1]?.split('\n\nReturn only')[0] ?? ''
        const out = opts.tailor ? opts.tailor(resume) : resume.replace(/Built/g, 'Delivered')
        return { message: out, provider: 'fake' }
      }
      if (prompt.startsWith('Write a tailored cover letter')) {
        return { message: 'Dear hiring team,\n\nA fake letter.', provider: 'fake' }
      }
      return { message: '{}', provider: 'fake' }
    }
  }
  return { chain: [provider], prompts }
}
