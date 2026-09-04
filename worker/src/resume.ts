import type { KVNamespace } from '@cloudflare/workers-types'
import { getAllBlocks } from './blocks.js'
import { assembleResume, filterCanonical, stripPageBreaks } from './skeleton.js'

export interface ResumeEnv {
  CONTENT_KV: KVNamespace
  /**
   * Legacy fallback only. The prompt is content, not a credential — it is
   * already served verbatim to friend tier at `/system-prompt` — so it lives in
   * CONTENT_KV under `resume:prompt` alongside every other resume key. Optional
   * because the goal is for this binding to stop existing.
   */
  RESUME_SYSTEM_PROMPT?: string
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

/**
 * KV first, worker secret second.
 *
 * Every other piece of resume content already comes from CONTENT_KV — eleven
 * keys, `resume:full` and `resume:blocks:*` among them, read twelve lines above
 * this. The prompt was the one exception, and being the exception is what kept
 * a `resumeData.env` alive in hadoku_site as its only editable source, pushed
 * with a raw `wrangler secret put` that repo's rules forbid.
 *
 * The secret is kept as a fallback so the two repos can migrate in either
 * order: publishing this ahead of the KV write changes nothing.
 */
export async function getSystemPrompt(env: ResumeEnv): Promise<string> {
  const fromKv = await env.CONTENT_KV.get('resume:prompt')
  if (fromKv) return fromKv
  if (env.RESUME_SYSTEM_PROMPT) return env.RESUME_SYSTEM_PROMPT
  throw new Error(
    'System prompt not found: no CONTENT_KV resume:prompt and no RESUME_SYSTEM_PROMPT'
  )
}

export async function getFullSystemPrompt(env: ResumeEnv, ownerName: string): Promise<string> {
  const basePrompt = await getSystemPrompt(env)
  // Pages mean nothing to the chatbot — strip the markers so they never leak
  // into an answer.
  const resumeContent = stripPageBreaks(await getResumeContent(env))

  return `${basePrompt}

## Resume Content

Here is ${ownerName}'s complete resume. Use this information to answer questions accurately:

${resumeContent}

Remember: Only provide information that is explicitly stated in the resume above. Do not invent or speculate about information not present in the resume.`
}
