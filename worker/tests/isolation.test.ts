/**
 * Per-user isolation at the module level: two users and the owner share one
 * KV namespace, and nothing one of them generates reads another's content.
 */
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getAllBlocks } from '../src/blocks.ts'
import { upsertBlock, replaceBlocks } from '../src/builder.ts'
import { generateTailoredResume } from '../src/tailored-resume.ts'
import { generateCoverLetter } from '../src/cover-letter.ts'
import { generateApplicationExtras } from '../src/application-extras.ts'
import { getResumeContent } from '../src/resume.ts'
import { putContactProfile, NoContactProfileError } from '../src/contact.ts'
import { NoResumeBlocksError, OWNER_SCOPE, type ContentScope } from '../src/scope.ts'
import { parseResumeText } from '../src/resume-import.ts'
import { MemoryKV } from './helpers/kv.ts'
import { fakeLLM, offeredIds } from './helpers/llm.ts'
import { OWNER_BLOCKS } from './fixtures/owner-blocks.ts'
import { PERSONA_MARKDOWN, PERSONA_PLAIN } from './fixtures/persona.ts'

const A: ContentScope = { kind: 'user', userId: 'user-a' }
const B: ContentScope = { kind: 'user', userId: 'user-b' }
const C: ContentScope = { kind: 'user', userId: 'user-c' }
const JOB = {
  job_title: 'Delivery Manager',
  company: 'Initech',
  description: '<p>Lead delivery.</p>'
}
const OWNER_MARKERS = ['Jordan Example', 'Contoso', 'example.dev', 'jordan@example.com']

let kv: MemoryKV

beforeEach(async () => {
  kv = new MemoryKV()
  for (const b of OWNER_BLOCKS) await upsertBlock(kv.asKV(), b)
  await replaceBlocks(kv.asKV(), parseResumeText(PERSONA_MARKDOWN).blocks, A)
  await replaceBlocks(kv.asKV(), parseResumeText(PERSONA_PLAIN).blocks, B)
})

function assertNoOwnerContent(text: string, where: string) {
  for (const m of OWNER_MARKERS)
    assert.ok(!text.includes(m), `${where} leaked owner content '${m}'`)
}

describe('block storage', () => {
  it('keeps each user and the owner in separate keys', async () => {
    const owner = await getAllBlocks(kv.asKV())
    const a = await getAllBlocks(kv.asKV(), A)
    const b = await getAllBlocks(kv.asKV(), B)
    assert.equal(owner.length, OWNER_BLOCKS.length)
    assert.ok(a.some(x => x.content.includes('Robin Quillfeather')))
    assert.ok(b.some(x => x.content.includes('Sam Okonkwo-Lind')))
    assert.ok(a.every(x => !x.content.includes('Sam Okonkwo-Lind')))
    assert.deepEqual(await getAllBlocks(kv.asKV(), C), [])
    for (const key of kv.keys().filter(k => k.startsWith('resume:blocks:user-a:'))) {
      assert.ok(!key.startsWith('resume:blocks:user-b'), key)
    }
  })

  it("refuses to replace the owner's set in bulk", async () => {
    await assert.rejects(replaceBlocks(kv.asKV(), [], OWNER_SCOPE), /owner/)
  })

  it('a re-import drops blocks the new resume no longer has', async () => {
    await replaceBlocks(kv.asKV(), parseResumeText(PERSONA_PLAIN).blocks, A)
    const ids = (await getAllBlocks(kv.asKV(), A)).map(b => b.id)
    assert.deepEqual(ids, [
      'header',
      'summary',
      'experience',
      'experience-2',
      'skills',
      'education'
    ])
    assert.equal(await kv.get('resume:blocks:user-a:certifications'), null)
  })
})

describe('tailored resume', () => {
  it("offers the selector only the caller's own blocks", async () => {
    const llm = fakeLLM()
    // Robin's palette has an optional extra section, so the selector is asked.
    const out = await generateTailoredResume(llm.chain, kv.asKV(), JOB, undefined, A)
    const selection = llm.prompts.find(p => p.startsWith('You are assembling'))
    assert.ok(selection, 'selection prompt sent')
    const aIds = new Set((await getAllBlocks(kv.asKV(), A)).map(b => b.id))
    assert.ok(offeredIds(selection).every(id => aIds.has(id)))
    for (const p of llm.prompts) assertNoOwnerContent(p, 'prompt')
    assertNoOwnerContent(out.resume_markdown, 'resume')
    assert.match(out.resume_markdown, /^# Robin Quillfeather/)
    assert.doesNotMatch(selection, /Microsoft|tier:1|platform-anchor/)
  })

  it('skips the selector when every block is structural', async () => {
    const llm = fakeLLM()
    const out = await generateTailoredResume(llm.chain, kv.asKV(), JOB, undefined, B)
    assert.ok(!llm.prompts.some(p => p.startsWith('You are assembling')))
    assert.equal(llm.prompts.length, 1, 'only the tailoring pass')
    assert.match(out.resume_markdown, /^# Sam Okonkwo-Lind/)
    assert.match(out.resume_markdown, /Delivered the returns process/)
  })

  it("a user with no blocks gets NoResumeBlocksError, never the owner's resume", async () => {
    const llm = fakeLLM()
    await assert.rejects(
      generateTailoredResume(llm.chain, kv.asKV(), JOB, undefined, C),
      (err: unknown) => err instanceof NoResumeBlocksError && err.code === 'NO_RESUME_BLOCKS'
    )
    assert.equal(llm.prompts.length, 0)
    await assert.rejects(getResumeContent({ CONTENT_KV: kv.asKV() }, C), NoResumeBlocksError)
  })

  it('caches per user: the same job tailored for A and B yields two resumes', async () => {
    const llm = fakeLLM()
    const a = await generateTailoredResume(llm.chain, kv.asKV(), JOB, undefined, A)
    const b = await generateTailoredResume(llm.chain, kv.asKV(), JOB, undefined, B)
    const owner = await generateTailoredResume(llm.chain, kv.asKV(), JOB)
    assert.equal(b.cached, false, "B must not be served A's cached resume")
    assert.equal(owner.cached, false)
    assert.notEqual(a.resume_markdown, b.resume_markdown)
    assert.match(owner.resume_markdown, /Jordan Example/)
    const cacheKeys = kv.keys().filter(k => k.startsWith('resume:tailored:'))
    assert.equal(cacheKeys.length, 3)
    assert.equal(cacheKeys.filter(k => k.startsWith('resume:tailored:user-a:')).length, 1)
    assert.equal(cacheKeys.filter(k => k.startsWith('resume:tailored:user-b:')).length, 1)
  })

  it("an owner block edit keeps users' caches; a user's edit keeps the owner's and other users'", async () => {
    const llm = fakeLLM()
    await generateTailoredResume(llm.chain, kv.asKV(), JOB, undefined, A)
    await generateTailoredResume(llm.chain, kv.asKV(), JOB, undefined, B)
    await generateTailoredResume(llm.chain, kv.asKV(), JOB)
    const count = (p: string) => kv.keys().filter(k => k.startsWith(p)).length

    await upsertBlock(kv.asKV(), { ...OWNER_BLOCKS[0], content: '# Jordan Example (edited)' })
    assert.equal(count('resume:tailored:user-a:'), 1)
    assert.equal(count('resume:tailored:user-b:'), 1)
    assert.equal(
      kv.keys().filter(k => /^resume:tailored:[0-9a-f]{64}$/.test(k)).length,
      0,
      "the owner's own cache was busted"
    )

    await generateTailoredResume(llm.chain, kv.asKV(), JOB)
    const blocksA = await getAllBlocks(kv.asKV(), A)
    await upsertBlock(kv.asKV(), { ...blocksA[0], content: '# Robin Q' }, A)
    assert.equal(count('resume:tailored:user-a:'), 0)
    assert.equal(count('resume:tailored:user-b:'), 1)
    assert.equal(kv.keys().filter(k => /^resume:tailored:[0-9a-f]{64}$/.test(k)).length, 1)
  })
})

describe('cover letter and application extras', () => {
  it("writes from the caller's resume and caches under the caller", async () => {
    const llm = fakeLLM()
    const resume = await getResumeContent({ CONTENT_KV: kv.asKV() }, A)
    assertNoOwnerContent(resume, 'canonical resume')
    await generateCoverLetter(llm.chain, kv.asKV(), resume, JOB, undefined, A)
    const second = await generateCoverLetter(llm.chain, kv.asKV(), 'other', JOB, undefined, B)
    assert.equal(second.cached, false, "B must not get A's cached letter")
    assert.match(llm.prompts[0], /Robin Quillfeather/)
    assertNoOwnerContent(llm.prompts[0], 'cover letter prompt')
  })

  it("grounds extras in the caller's contact profile, and refuses without one", async () => {
    const llm = fakeLLM()
    const req = { ...JOB, resume_markdown: '# Robin Quillfeather' }
    await assert.rejects(
      generateApplicationExtras(llm.chain, kv.asKV(), req, A),
      NoContactProfileError
    )
    await kv.put(
      'resume:profile:contact',
      JSON.stringify({ name: 'Jordan Example', email: 'jordan@example.com' })
    )
    await putContactProfile(
      kv.asKV(),
      {
        name: 'Robin Quillfeather',
        email: 'robin.q@example.org',
        phone: '',
        linkedin: '',
        github: '',
        location: 'Leipzig, Germany',
        work_auth: 'EU citizen',
        relocation: '',
        salary_line: ''
      },
      A
    )
    const extras = await generateApplicationExtras(llm.chain, kv.asKV(), req, A)
    assert.equal(extras.contact.name, 'Robin Quillfeather')
    assert.match(extras.standard_fields, /Name: Robin Quillfeather/)
    assertNoOwnerContent(llm.prompts.join('\n'), 'extras prompt')
  })
})
