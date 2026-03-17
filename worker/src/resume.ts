import type { KVNamespace } from '@cloudflare/workers-types'

export interface ResumeEnv {
  CONTENT_KV: KVNamespace
  RESUME_SYSTEM_PROMPT: string
}

export async function getResumeContent(env: ResumeEnv): Promise<string> {
  const content = await env.CONTENT_KV.get('resume')
  if (!content) {
    throw new Error('Resume content not found in KV storage')
  }
  return content
}

export function getSystemPrompt(env: ResumeEnv): string {
  if (!env.RESUME_SYSTEM_PROMPT) {
    throw new Error('RESUME_SYSTEM_PROMPT secret not configured')
  }
  return env.RESUME_SYSTEM_PROMPT
}

export async function getFullSystemPrompt(env: ResumeEnv, ownerName: string): Promise<string> {
  const basePrompt = getSystemPrompt(env)
  const resumeContent = await getResumeContent(env)

  return `${basePrompt}

## Resume Content

Here is ${ownerName}'s complete resume. Use this information to answer questions accurately:

${resumeContent}

Remember: Only provide information that is explicitly stated in the resume above. Do not invent or speculate about information not present in the resume.`
}
