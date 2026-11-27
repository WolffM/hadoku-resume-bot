/**
 * Non-owner résumés fit on two pages: the compact PDF style, the page-fitting
 * ladder, and the tailoring path that applies it.
 */
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { createPageCounter, renderResumePdf, type PdfStyle } from '../src/pdf.ts'
import { paperForLocation, type Paper } from '../src/paper.ts'
import { putContactProfile, sanitizeContact } from '../src/contact.ts'
import { fitResumeToPages, GENERIC_MAX_PAGES } from '../src/fit.ts'
import { assembleResume, GENERIC_LAYOUT } from '../src/skeleton.ts'
import { parseResumeText } from '../src/resume-import.ts'
import { replaceBlocks } from '../src/builder.ts'
import { generateTailoredResume } from '../src/tailored-resume.ts'
import { normalizeTypography } from '../src/typography.ts'
import type { ContentScope } from '../src/scope.ts'
import { MemoryKV } from './helpers/kv.ts'
import { fakeLLM } from './helpers/llm.ts'
import { PERSONA_FIVE_ROLES, PERSONA_MARKDOWN } from './fixtures/persona.ts'

const USER: ContentScope = { kind: 'user', userId: 'user-five' }
const JOB = {
  job_title: 'Technical Program Manager',
  company: 'Initech',
  description: 'Run programs.'
}
const JOBS = [
  'Head of Operations',
  'Program Manager',
  'Project Manager',
  'Research Project Manager',
  'Junior Project Manager'
]

async function renderedPages(
  markdown: string,
  style: PdfStyle,
  paper: Paper = 'a4'
): Promise<number> {
  const bytes = await renderResumePdf({
    resume: normalizeTypography(markdown),
    ownerName: 'Alex Marrow-Tate',
    style,
    paper
  })
  return (await PDFDocument.load(bytes)).getPageCount()
}

/** The bullets under each `###` job heading, in order. */
function bulletsPerJob(markdown: string): number[] {
  const counts: number[] = []
  for (const line of markdown.split('\n')) {
    if (line.startsWith('### ')) counts.push(0)
    else if (line.startsWith('# ') && counts.length > 0) break
    else if (/^[-*] /.test(line) && counts.length > 0) counts[counts.length - 1]++
  }
  return counts
}

function experienceOnly(markdown: string): string {
  const start = markdown.indexOf('# Experience')
  const end = markdown.indexOf('\n# ', start + 1)
  return markdown.slice(start, end === -1 ? undefined : end)
}

/** A wordier rewrite: every bullet said twice, the way an over-eager LLM pads. */
function padded(resume: string): string {
  return resume
    .split('\n')
    .flatMap(l => (/^[-*] /.test(l) ? [l, `${l} This was done with care and on schedule.`] : [l]))
    .join('\n')
}

describe('page counter', () => {
  it('counts exactly the pages the renderer produces, in both styles', async () => {
    const md = assembleResume(parseResumeText(PERSONA_FIVE_ROLES).blocks, GENERIC_LAYOUT)
    for (const style of ['owner', 'compact'] as const) {
      for (const paper of ['a4', 'letter'] as const) {
        const count = await createPageCounter(style, paper)
        for (const doc of [md, padded(md), PERSONA_MARKDOWN]) {
          const text = normalizeTypography(doc)
          assert.equal(count(text), await renderedPages(text, style, paper), `${style} ${paper}`)
        }
      }
    }
  })
})

describe('generic layout fits on two pages', () => {
  let kv: MemoryKV
  beforeEach(async () => {
    kv = new MemoryKV()
    await replaceBlocks(kv.asKV(), parseResumeText(PERSONA_FIVE_ROLES).blocks, USER)
  })

  it('a typical five-role résumé renders on at most two pages', async () => {
    const md = assembleResume(parseResumeText(PERSONA_FIVE_ROLES).blocks, GENERIC_LAYOUT)
    assert.ok((await renderedPages(md, 'owner', 'letter')) > 2, 'the fixture is full length')

    const out = await generateTailoredResume(fakeLLM().chain, kv.asKV(), JOB, undefined, USER)
    const pages = await renderedPages(out.resume_markdown, 'compact')
    assert.ok(pages <= GENERIC_MAX_PAGES, `rendered ${pages} pages`)
    for (const job of JOBS) assert.match(out.resume_markdown, new RegExp(`### ${job} - `))
    // The compact style alone is enough here: nothing had to be cut.
    assert.deepEqual(
      bulletsPerJob(experienceOnly(out.resume_markdown)),
      bulletsPerJob(experienceOnly(md))
    )
  })

  it('also fits on Letter for a user located in the US', async () => {
    const contact = sanitizeContact({ name: 'Alex Marrow-Tate', location: 'Austin, TX' })
    assert.ok(contact)
    await putContactProfile(kv.asKV(), contact, USER)
    const llm = fakeLLM({ tailor: padded })
    const out = await generateTailoredResume(llm.chain, kv.asKV(), JOB, undefined, USER)
    const pages = await renderedPages(out.resume_markdown, 'compact', 'letter')
    assert.ok(pages <= GENERIC_MAX_PAGES, `rendered ${pages} Letter pages`)
  })

  it('condenses a padded rewrite to two pages, keeping every job and its newest bullets', async () => {
    const md = assembleResume(parseResumeText(PERSONA_FIVE_ROLES).blocks, GENERIC_LAYOUT)
    assert.ok((await renderedPages(padded(md), 'compact')) > 2, 'the padded rewrite overflows')
    const llm = fakeLLM({ tailor: padded })
    const out = await generateTailoredResume(llm.chain, kv.asKV(), JOB, undefined, USER)
    const pages = await renderedPages(out.resume_markdown, 'compact')
    assert.ok(pages <= GENERIC_MAX_PAGES, `rendered ${pages} pages`)

    for (const job of JOBS) assert.match(out.resume_markdown, new RegExp(`### ${job} - `))
    assert.match(out.resume_markdown, /# Education\n/)
    assert.match(out.resume_markdown, /Lumen Tidewater, Hamburg, Germany/)
    const counts = bulletsPerJob(experienceOnly(out.resume_markdown))
    assert.equal(counts.length, 5)
    assert.ok(
      counts.every(n => n >= 1),
      `every job keeps a bullet: ${counts}`
    )
    assert.ok(counts[4] <= 2, `the oldest job is condensed: ${counts}`)
    assert.ok(counts[0] >= counts[4], `newer jobs keep more: ${counts}`)
    // Each job keeps its FIRST bullets (the tailoring pass orders them).
    assert.match(out.resume_markdown, /- Run day-to-day company operations end to end/)
  })

  it('asks the tailoring pass for two pages, relevance-ordered bullets and complete history', async () => {
    const llm = fakeLLM()
    await generateTailoredResume(llm.chain, kv.asKV(), JOB, undefined, USER)
    const prompt = llm.prompts.find(p => p.startsWith('You are tailoring a resume'))
    assert.ok(prompt)
    assert.match(prompt, /must fit on two pages/)
    assert.match(prompt, /order the bullets by relevance/)
    assert.match(prompt, /employment history stays complete/)
  })
})

describe('fitResumeToPages', () => {
  it('leaves a résumé that already fits untouched', async () => {
    const count = await createPageCounter('compact', 'a4')
    const md = assembleResume(parseResumeText(PERSONA_MARKDOWN).blocks, GENERIC_LAYOUT)
    const fit = fitResumeToPages(md, GENERIC_MAX_PAGES, count)
    assert.equal(fit.condensed, false)
    assert.equal(fit.markdown, md)
  })

  it('merges a bulleted skills list into one paragraph before cutting any bullet', () => {
    const md = assembleResume(parseResumeText(PERSONA_FIVE_ROLES).blocks, GENERIC_LAYOUT)
    // A counter that accepts the first condensed candidate.
    let calls = 0
    const fit = fitResumeToPages(md, 2, () => (++calls === 1 ? 3 : 2))
    assert.equal(fit.condensed, true)
    assert.match(
      fit.markdown,
      /Program and project management \(Scrum, Kanban, SAFe basics\) · Operations/
    )
    assert.deepEqual(bulletsPerJob(experienceOnly(fit.markdown)), bulletsPerJob(experienceOnly(md)))
  })

  it('never ends a job on a lead-in bullet whose items were cut', () => {
    const md = [
      '# Pat Example',
      '# Experience',
      '### Lead - 2020 - present',
      '- First point.',
      '- Clients included:',
      '- Example One',
      '- Example Two',
      '### Analyst - 2018 - 2020',
      '- Only point.'
    ].join('\n')
    const pages = (m: string) => (m.includes('Example One') ? 3 : 1)
    const fit = fitResumeToPages(md, 2, pages)
    assert.doesNotMatch(fit.markdown, /Clients included:/)
    assert.match(fit.markdown, /- First point\./)
    assert.match(fit.markdown, /### Analyst - 2018 - 2020\n- Only point\./)
  })

  it('drops an optional section only after the bullets are condensed', () => {
    const md = assembleResume(parseResumeText(PERSONA_FIVE_ROLES).blocks, GENERIC_LAYOUT)
    const seen: string[] = []
    fitResumeToPages(md, 2, m => {
      seen.push(m)
      return 3
    })
    const firstWithout = seen.findIndex(m => !m.includes('# Volunteering'))
    assert.ok(firstWithout > 0)
    const counts = bulletsPerJob(experienceOnly(seen[firstWithout - 1]))
    assert.ok(counts.at(-1)! <= 1, `oldest job already condensed: ${counts}`)
  })
})

describe('resume import', () => {
  it('joins items under a lead-in bullet onto it', () => {
    const { blocks } = parseResumeText(PERSONA_FIVE_ROLES)
    const second = blocks.find(b => b.content.includes('Northgate Kestrel'))
    assert.ok(second)
    assert.match(
      second.content,
      /\n- Programs included: Example Retail Bank: digital advertising optimization \(12-person team\); Example Grocers: /
    )
    assert.doesNotMatch(second.content, /\n- Example Grocers/)
  })
})

describe('paper size', () => {
  it('is A4 everywhere except the US and Canada, and A4 when unknown', () => {
    for (const loc of ['Berlin, Germany', 'Hamburg', 'London, UK', 'Paris, FR', 'Remote', '', null])
      assert.equal(paperForLocation(loc), 'a4', String(loc))
    for (const loc of [
      'Austin, TX',
      'New York, NY, USA',
      'San Francisco, CA',
      'Toronto, ON',
      'Vancouver, Canada',
      'Remote (US)',
      'United States'
    ])
      assert.equal(paperForLocation(loc), 'letter', loc)
    assert.equal(paperForLocation('Open to work with us in Berlin'), 'a4')
  })
})
