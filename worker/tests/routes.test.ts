/**
 * The HTTP surface, driven through createResumeHandler with the same headers
 * edge-router stamps (X-Edge-Auth, X-Hadoku-Tier, X-User-Id), so the real
 * createEdgeAuth and requireMinTier gates run. The LLM chain is scripted.
 */
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { createResumeHandler } from '../src/index.ts'
import { upsertBlock } from '../src/builder.ts'
import { CONTACT_KEY } from '../src/contact.ts'
import { MemoryKV } from './helpers/kv.ts'
import { fakeLLM, type FakeLLM } from './helpers/llm.ts'
import { OWNER_BLOCKS } from './fixtures/owner-blocks.ts'
import { PERSONA_MARKDOWN } from './fixtures/persona.ts'

const BASE = '/resume/api'
const SECRET = 'test-edge-secret'
const OWNER_ID = 'owner-0000'
const JOBPLATFORM_ID = 'svc-jobplatform'
const JOB = {
  job_title: 'Delivery Manager',
  company: 'Initech',
  description: '<p>Lead delivery.</p>'
}

let kv: MemoryKV
let llm: FakeLLM
let app: ReturnType<typeof createResumeHandler>

function env() {
  return {
    EDGE_AUTH_SECRET: SECRET,
    CONTENT_KV: kv.asKV(),
    RATE_LIMIT_KV: new MemoryKV().asKV(),
    RESUME_OWNER_USER_ID: OWNER_ID,
    ON_BEHALF_CALLER_USER_IDS: JOBPLATFORM_ID
  }
}

interface Caller {
  tier: string
  userId?: string
}
const friendA: Caller = { tier: 'friend', userId: 'user-a' }
const friendB: Caller = { tier: 'friend', userId: 'user-b' }
const admin: Caller = { tier: 'admin', userId: OWNER_ID }
const jobplatform: Caller = { tier: 'service', userId: JOBPLATFORM_ID }
const otherService: Caller = { tier: 'service', userId: 'svc-other' }

async function call(
  method: string,
  path: string,
  who: Caller | null,
  body?: unknown
): Promise<{ status: number; body: any; headers: Headers }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (who) {
    headers['X-Edge-Auth'] = SECRET
    headers['X-Hadoku-Tier'] = who.tier
    if (who.userId) headers['X-User-Id'] = who.userId
  }
  const res = await app.request(
    `${BASE}${path}`,
    { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
    env()
  )
  const type = res.headers.get('Content-Type') ?? ''
  return {
    status: res.status,
    body: type.includes('json') ? await res.json() : await res.arrayBuffer(),
    headers: res.headers
  }
}

beforeEach(async () => {
  kv = new MemoryKV()
  llm = fakeLLM()
  app = createResumeHandler(BASE, { ownerName: 'Jordan Example', createClient: () => llm.chain })
  for (const b of OWNER_BLOCKS) await upsertBlock(kv.asKV(), b)
  await kv.put(CONTACT_KEY, JSON.stringify({ name: 'Jordan Example', email: 'jordan@example.com' }))
})

describe('per-user blocks', () => {
  it('a friend imports their resume and reads back only their own blocks', async () => {
    const imp = await call('POST', '/blocks/import', friendA, { resume_text: PERSONA_MARKDOWN })
    assert.equal(imp.status, 200)
    assert.equal(imp.body.contact.name, 'Robin Quillfeather')

    const mine = await call('GET', '/blocks', friendA)
    assert.equal(mine.status, 200)
    assert.ok(mine.body.blocks.length > 5)
    assert.equal(mine.body.contact.email, 'robin.q@example.org')

    const theirs = await call('GET', '/blocks', friendB)
    assert.deepEqual(theirs.body, { blocks: [], contact: null })
  })

  it('import refuses to clobber existing blocks unless replace is true', async () => {
    await call('POST', '/blocks/import', friendA, { resume_text: PERSONA_MARKDOWN })
    const again = await call('POST', '/blocks/import', friendA, { resume_text: 'Kim\n\nhello' })
    assert.equal(again.status, 409)
    const replaced = await call('POST', '/blocks/import', friendA, {
      resume_text: 'Kim Example\n\nhello',
      replace: true,
      contact: { name: 'Kim Example', email: 'kim@example.com', phone: '' }
    })
    assert.equal(replaced.status, 200)
    assert.equal(replaced.body.contact.email, 'kim@example.com')
  })

  it('a friend can upsert and delete their own blocks', async () => {
    const put = await call('PUT', '/blocks/summary', friendA, {
      type: 'summary',
      tags: ['always', 'canonical', 'section:summary'],
      title: 'Summary',
      content: 'Hello.',
      priority: 5
    })
    assert.equal(put.status, 200)
    assert.equal((await call('GET', '/blocks', friendA)).body.blocks.length, 1)
    assert.equal((await call('DELETE', '/blocks/summary', friendA)).status, 200)
    assert.equal((await call('DELETE', '/blocks/summary', friendA)).status, 404)
    assert.equal((await kv.get('resume:blocks:summary-platform')) !== null, true, 'owner untouched')
  })

  it("never exposes or edits the owner's set through /blocks", async () => {
    assert.equal((await call('GET', '/blocks', admin)).status, 403)
    assert.equal((await call('POST', '/blocks/import', admin, { resume_text: 'x' })).status, 403)
    const onBehalfOwner = await call('POST', '/blocks/import', jobplatform, {
      resume_text: PERSONA_MARKDOWN,
      on_behalf_of_user_id: OWNER_ID
    })
    assert.equal(onBehalfOwner.status, 403)
    assert.equal(onBehalfOwner.body.code, 'OWNER_SET')
    assert.equal((await kv.get('resume:blocks:index'))?.includes('summary-platform'), true)
  })

  it('refuses public and identity-less callers', async () => {
    assert.equal((await call('GET', '/blocks', null)).status, 403)
    assert.equal((await call('GET', '/blocks', { tier: 'friend' })).status, 403)
  })
})

describe('tailoring for a non-owner', () => {
  it('409 NO_RESUME_BLOCKS for a user with no blocks, and no LLM call', async () => {
    const res = await call('POST', '/tailored-resume', friendB, JOB)
    assert.equal(res.status, 409)
    assert.equal(res.body.code, 'NO_RESUME_BLOCKS')
    assert.equal(llm.prompts.length, 0)
    const letter = await call('POST', '/cover-letter', friendB, JOB)
    assert.equal(letter.status, 409)
    assert.equal(letter.body.code, 'NO_RESUME_BLOCKS')
  })

  it("tailors from the caller's own blocks", async () => {
    await call('POST', '/blocks/import', friendA, { resume_text: PERSONA_MARKDOWN })
    const res = await call('POST', '/tailored-resume', friendA, JOB)
    assert.equal(res.status, 200)
    assert.match(res.body.resume_markdown, /^# Robin Quillfeather/)
    assert.doesNotMatch(res.body.resume_markdown, /Jordan Example|Contoso/)
    const letter = await call('POST', '/cover-letter', friendA, JOB)
    assert.equal(letter.status, 200)
    assert.doesNotMatch(llm.prompts.join('\n'), /Jordan Example|Contoso/)
  })

  it('an allowlisted service acts for the user it names; others are refused', async () => {
    await call('POST', '/blocks/import', jobplatform, {
      resume_text: PERSONA_MARKDOWN,
      on_behalf_of_user_id: 'user-a'
    })
    const forA = await call('POST', '/tailored-resume', jobplatform, {
      ...JOB,
      on_behalf_of_user_id: 'user-a'
    })
    assert.equal(forA.status, 200)
    assert.match(forA.body.resume_markdown, /Robin Quillfeather/)

    const spoof = await call('POST', '/tailored-resume', friendB, {
      ...JOB,
      on_behalf_of_user_id: 'user-a'
    })
    assert.equal(spoof.status, 403)
    const unlisted = await call('POST', '/tailored-resume', otherService, {
      ...JOB,
      on_behalf_of_user_id: 'user-a'
    })
    assert.equal(unlisted.status, 403)
  })

  it("the service itself, naming nobody, gets its own empty scope, not the owner's", async () => {
    const res = await call('POST', '/tailored-resume', jobplatform, JOB)
    assert.equal(res.status, 409)
    assert.equal(res.body.code, 'NO_RESUME_BLOCKS')
  })

  it("the owner, named by the service or calling as admin, still gets the owner's resume", async () => {
    const viaService = await call('POST', '/tailored-resume', jobplatform, {
      ...JOB,
      on_behalf_of_user_id: OWNER_ID
    })
    assert.equal(viaService.status, 200)
    assert.match(viaService.body.resume_markdown, /Jordan Example/)
    const asAdmin = await call('POST', '/tailored-resume', admin, JOB)
    assert.equal(asAdmin.status, 200)
    assert.equal(asAdmin.body.cached, true, 'same owner cache key as before')
  })

  it('application extras need the user contact profile (409 NO_CONTACT_PROFILE)', async () => {
    await call('PUT', '/blocks/summary', friendB, {
      type: 'summary',
      tags: ['always', 'canonical', 'section:summary'],
      title: 'Summary',
      content: 'Hi.',
      priority: 1
    })
    const req = { ...JOB, resume_markdown: '# Sam' }
    const missing = await call('POST', '/application-extras', friendB, req)
    assert.equal(missing.status, 409)
    assert.equal(missing.body.code, 'NO_CONTACT_PROFILE')
    assert.equal(
      (await call('PUT', '/contact-profile', friendB, { contact: { name: 'Sam Example' } })).status,
      200
    )
    const ok = await call('POST', '/application-extras', friendB, req)
    assert.equal(ok.status, 200)
    assert.equal(ok.body.contact.name, 'Sam Example')
  })
})

describe('variants', () => {
  it("lists only the caller's own variants", async () => {
    await call('POST', '/variants', admin, {
      label: 'owner one',
      slug: 'owner-one',
      markdown: '# Jordan Example'
    })
    await call('POST', '/variants', friendA, {
      label: 'a one',
      slug: 'a-one',
      markdown: '# Robin Quillfeather'
    })
    await call('POST', '/variants', friendB, { label: 'b one', slug: 'b-one', markdown: '# Sam' })

    const slugs = async (who: Caller) =>
      ((await call('GET', '/variants', who)).body.variants as { slug: string }[]).map(v => v.slug)
    assert.deepEqual(await slugs(friendA), ['a-one'])
    assert.deepEqual(await slugs(friendB), ['b-one'])
    assert.deepEqual(await slugs(admin), ['owner-one'])
  })

  it("a friend cannot overwrite or delete someone else's slug", async () => {
    await call('POST', '/variants', admin, {
      label: 'owner',
      slug: 'shared',
      markdown: '# Jordan Example'
    })
    const take = await call('POST', '/variants', friendA, {
      label: 'x',
      slug: 'shared',
      markdown: '# Robin'
    })
    assert.equal(take.status, 409)
    await call('POST', '/variants', friendA, { label: 'a', slug: 'mine', markdown: '# Robin' })
    assert.equal(
      (await call('POST', '/variants', friendB, { label: 'b', slug: 'mine', markdown: '# Sam' }))
        .status,
      409
    )
    assert.equal(
      (await call('POST', '/variants', admin, { label: 'o', slug: 'mine', markdown: '# J' }))
        .status,
      409
    )
    assert.equal((await call('DELETE', '/variants/mine', friendB)).status, 404)
    assert.equal((await call('DELETE', '/variants/shared', friendA)).status, 404)
    assert.equal((await call('DELETE', '/variants/mine', friendA)).status, 200)
    assert.equal(await kv.get('resume:variant-owner:mine'), null)
  })

  it("a user's shared link resolves by slug and is named for that user", async () => {
    await call('POST', '/blocks/import', friendA, { resume_text: PERSONA_MARKDOWN })
    await call('POST', '/variants', friendA, {
      label: 'Initech',
      slug: 'robin-initech',
      markdown: '# Robin Quillfeather\n\n# Projects\n\nMy own projects paragraph.'
    })
    const page = await call('GET', '/resume?v=robin-initech', null)
    assert.equal(page.status, 200)
    assert.equal(page.body.variant, 'robin-initech')
    assert.equal(page.body.candidate_name, 'Robin Quillfeather')
    assert.match(page.body.content, /My own projects paragraph/, 'no owner anchor spliced in')
    assert.doesNotMatch(page.body.content, /example\.dev/)

    const pdf = await call('GET', '/resume.pdf?v=robin-initech', null)
    assert.equal(pdf.status, 200)
    assert.equal(
      pdf.headers.get('Content-Disposition'),
      'attachment; filename="robin-quillfeather-resume.pdf"'
    )
    const text = Buffer.from(pdf.body as ArrayBuffer).toString('latin1')
    assert.ok(!text.includes('Jordan Example'), 'PDF metadata names the user, not the owner')
    const doc = await PDFDocument.load(pdf.body as ArrayBuffer, { updateMetadata: false })
    assert.equal(doc.getTitle(), 'Robin Quillfeather - Resume', 'plain title, no em dash')
    const { width, height } = doc.getPage(0).getSize()
    assert.deepEqual([width, height], [595.28, 841.89], 'A4 for a user outside the US and Canada')
    assert.equal(doc.getAuthor(), 'Robin Quillfeather')
  })

  it('a user located in the US or Canada gets a Letter PDF', async () => {
    await call('POST', '/blocks/import', friendA, { resume_text: PERSONA_MARKDOWN })
    const put = await call('PUT', '/contact-profile', friendA, {
      contact: { name: 'Robin Quillfeather', location: 'Toronto, ON' }
    })
    assert.equal(put.status, 200)
    await call('POST', '/variants', friendA, {
      label: 'Initech',
      slug: 'robin-toronto',
      markdown: '# Robin Quillfeather\n\n# Summary\n\nDelivery lead.'
    })
    const pdf = await call('GET', '/resume.pdf?v=robin-toronto', null)
    const doc = await PDFDocument.load(pdf.body as ArrayBuffer, { updateMetadata: false })
    const { width, height } = doc.getPage(0).getSize()
    assert.deepEqual([width, height], [612, 792])
  })

  it("the owner's links and PDF are unchanged", async () => {
    await call('POST', '/variants', admin, {
      label: 'o',
      slug: 'owner-link',
      markdown: '# Jordan Example'
    })
    const page = await call('GET', '/resume?v=owner-link', null)
    assert.equal(page.body.candidate_name, undefined)
    const pdf = await call('GET', '/resume.pdf?v=owner-link', null)
    assert.equal(
      pdf.headers.get('Content-Disposition'),
      'attachment; filename="jordan-example-resume.pdf"'
    )
    const doc = await PDFDocument.load(pdf.body as ArrayBuffer, { updateMetadata: false })
    assert.equal(doc.getTitle(), 'Jordan Example \u2014 R\u00e9sum\u00e9', 'owner title unchanged')
    const { width, height } = doc.getPage(0).getSize()
    assert.deepEqual([width, height], [612, 792], 'the owner stays on US Letter')
  })

  it('a slug with a colon cannot reach into a user key space', async () => {
    await call('POST', '/variants', friendA, { label: 'a', slug: 'secret', markdown: '# Robin' })
    const page = await call('GET', '/resume?v=user-a:secret', null)
    assert.equal(page.body.variant, undefined, 'falls back to the canonical resume')
    assert.match(page.body.content, /Jordan Example/)
  })
})
