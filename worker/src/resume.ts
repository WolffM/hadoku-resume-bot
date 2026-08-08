import type { KVNamespace } from '@cloudflare/workers-types'
import { getAllBlocks } from './blocks.js'
import { assembleResume, filterCanonical, stripPageBreaks } from './skeleton.js'

export interface ResumeEnv {
  CONTENT_KV: KVNamespace
  RESUME_SYSTEM_PROMPT: string
}

/**
 * The canonical résumé is assembled on the fly from the blocks tagged
 * `canonical`, following the fixed page skeleton — one source of truth, so the
 * display, the PDF and the chatbot never drift from a stale pre-baked blob.
 * Falls back to the legacy pre-rendered keys only if no block carries the tag.
 */
export async function getResumeContent(env: ResumeEnv): Promise<string> {
  const blocks = await getAllBlocks(env.CONTENT_KV)
  const canonical = filterCanonical(blocks)
  if (canonical.length > 0) return assembleResume(canonical)

  const content = (await env.CONTENT_KV.get('resume:full')) ?? (await env.CONTENT_KV.get('resume'))
  if (!content) {
    throw new Error('Resume content not found: no canonical blocks and no legacy resume:full')
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
  // Pages mean nothing to the chatbot — strip the markers so they never leak
  // into an answer.
  const resumeContent = stripPageBreaks(await getResumeContent(env))

  return `${basePrompt}

## Resume Content

Here is ${ownerName}'s complete resume. Use this information to answer questions accurately:

${resumeContent}

Remember: Only provide information that is explicitly stated in the resume above. Do not invent or speculate about information not present in the resume.`
}
