import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { classifyHeading, parseResumeText } from '../src/resume-import.ts'
import { validateBlock } from '../src/builder.ts'
import { assembleResume, GENERIC_LAYOUT } from '../src/skeleton.ts'
import { PERSONA_MARKDOWN, PERSONA_PLAIN } from './fixtures/persona.ts'

describe('parseResumeText (markdown)', () => {
  const { blocks, contact } = parseResumeText(PERSONA_MARKDOWN)
  const byId = new Map(blocks.map(b => [b.id, b]))

  it('reads the header into contact fields', () => {
    assert.deepEqual(contact, {
      name: 'Robin Quillfeather',
      email: 'robin.q@example.org',
      phone: '+49 30 5550 1234',
      linkedin: 'linkedin.com/in/robin-quillfeather-example',
      github: '',
      location: 'Leipzig, Germany',
      work_auth: '',
      relocation: '',
      salary_line: ''
    })
  })

  it('splits summary, one block per job, skills, education, languages, certifications and extras', () => {
    assert.deepEqual(
      blocks.map(b => b.id),
      [
        'header',
        'summary',
        'languages',
        'skills',
        'experience',
        'experience-2',
        'education',
        'extra-awards',
        'certifications'
      ]
    )
    assert.equal(byId.get('experience')?.title, 'Delivery Lead - 03/2022 - present')
    assert.match(
      byId.get('experience')?.content ?? '',
      /^### Delivery Lead - 03\/2022 - present\n\*\*Nimbus Lanterns GmbH/
    )
    assert.equal(byId.get('languages')?.content, 'English (C1), German (native), Spanish (A2)')
    assert.doesNotMatch(byId.get('skills')?.content ?? '', /Languages:/)
    assert.match(byId.get('extra-awards')?.content ?? '', /^# Awards\n\n- Example Hack Night 2023/)
  })

  it('emits only valid blocks, structural ones tagged always and extras optional', () => {
    for (const b of blocks) assert.deepEqual(validateBlock(b), b)
    assert.ok(byId.get('experience')?.tags.includes('always'))
    assert.ok(byId.get('header')?.tags.includes('section:header'))
    assert.ok(!byId.get('extra-awards')?.tags.includes('always'))
    assert.ok(blocks.every(b => b.tags.includes('canonical')))
  })

  it('flattens nested bullets so the PDF renders them as bullets', () => {
    assert.match(byId.get('experience')?.content ?? '', /\n- Cut average release slip/)
  })

  it('assembles in the generic layout, in the order the person wrote each section', () => {
    const md = assembleResume(blocks, GENERIC_LAYOUT)
    const order = [
      '# Robin Quillfeather',
      '# Summary',
      '# Experience',
      '### Delivery Lead',
      '### Project Coordinator',
      '# Skills',
      '# Education',
      '# Languages',
      '# Certifications',
      '# Awards'
    ].map(h => md.indexOf(h))
    assert.ok(
      order.every(i => i >= 0),
      `missing heading: ${JSON.stringify(order)}`
    )
    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      order
    )
    assert.doesNotMatch(md, /page-break/)
  })
})

describe('parseResumeText (plain text)', () => {
  const { blocks, contact } = parseResumeText(PERSONA_PLAIN)

  it('finds the name, contact line and sections without markdown', () => {
    assert.equal(contact.name, 'Sam Okonkwo-Lind')
    assert.equal(contact.email, 'sam.lind@example.net')
    assert.equal(contact.phone, '+44 20 7946 0000')
    assert.equal(contact.location, 'Bristol, UK')
    assert.deepEqual(
      blocks.map(b => b.id),
      ['header', 'summary', 'experience', 'experience-2', 'skills', 'education']
    )
    assert.match(blocks[2].content, /^### Operations Manager, Parcel Owl Ltd, 2021 - present/)
  })

  it('keeps an unsectioned resume as one experience block', () => {
    const r = parseResumeText('Kim Example\nkim@example.com\n\nDid many things for many years.')
    assert.deepEqual(
      r.blocks.map(b => b.id),
      ['header', 'experience']
    )
    assert.equal(r.blocks[1].content, 'Did many things for many years.')
  })
})

describe('parseResumeText limits', () => {
  it('rejects empty and oversized input', () => {
    assert.throws(() => parseResumeText('   \n  '), /empty/)
    assert.throws(() => parseResumeText('x'.repeat(60_001)), /longer than/)
  })
})

describe('classifyHeading', () => {
  it('routes common section names', () => {
    const cases: Record<string, string> = {
      'Professional Summary': 'summary',
      'Work Experience': 'experience',
      'Volunteer Experience': 'extra',
      'Key Projects': 'projects',
      'Technical Skills': 'skills',
      'Programming Languages': 'skills',
      Languages: 'languages',
      'Licenses & Certifications': 'certifications',
      'Education & Certifications': 'education',
      Hackathons: 'extra'
    }
    for (const [heading, kind] of Object.entries(cases)) {
      assert.equal(classifyHeading(heading), kind, heading)
    }
  })
})
