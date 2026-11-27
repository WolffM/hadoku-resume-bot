/**
 * A fictional owner's block palette, shaped like the real one
 * (docs/resume-structure.md): a header, two summary variants, a primary
 * employer as a rollup plus detail blocks, a projects anchor and categorised
 * project blocks with tier tags, a skills opener, secondary employment and
 * education. Every name, link and figure here is invented.
 */
import type { ResumeBlock } from '../../src/blocks.js'

export const OWNER_BLOCKS: ResumeBlock[] = [
  {
    id: 'header',
    type: 'header',
    tags: ['always', 'canonical', 'section:header'],
    title: 'Header',
    content:
      '# Jordan Example\n\njordan@example.com | +1 555 0100 | Springfield | [GitHub](https://github.com/example)',
    priority: 100
  },
  {
    id: 'summary-platform',
    type: 'summary',
    tags: ['canonical', 'section:summary', 'variant:summary'],
    title: 'Summary (platform)',
    content: 'Platform engineer who Built a self-hosted app platform and shipped search at scale.',
    priority: 90
  },
  {
    id: 'summary-ml',
    type: 'summary',
    tags: ['section:summary', 'variant:summary', 'ml'],
    title: 'Summary (ML)',
    content: 'ML engineer who Built ranking models and evaluation tooling.',
    priority: 80
  },
  {
    id: 'exp-contoso-rollup',
    type: 'experience',
    tags: ['canonical', 'section:experience-primary', 'variant:contoso'],
    title: 'Contoso rollup',
    content:
      '**Contoso** - Software Engineer II, 2018-2024\n\n- Built the search indexing pipeline.\n- Led the migration to a new storage tier.',
    priority: 70
  },
  {
    id: 'exp-contoso-search',
    type: 'experience',
    tags: ['section:experience-primary', 'search'],
    title: 'Contoso search detail',
    content: '- Built query understanding for the search box, cutting zero-result queries.',
    priority: 60
  },
  {
    id: 'exp-contoso-infra',
    type: 'experience',
    tags: ['section:experience-primary', 'infra'],
    title: 'Contoso infra detail',
    content: '- Built deployment tooling used by forty teams.',
    priority: 50
  },
  {
    id: 'proj-anchor',
    type: 'project',
    tags: ['always', 'canonical', 'section:projects'],
    title: 'Platform anchor',
    content:
      '# Projects\n\nexample.dev is a self-hosted platform of 12 apps behind one edge router, with 3,800 tests and 84k indexed items.',
    priority: 100
  },
  {
    id: 'proj-agent',
    type: 'project',
    tags: ['canonical', 'section:projects', 'cat:ai-agents', 'tier:1'],
    title: 'Agent runner',
    content:
      '**Agent runner** - Built a job queue for coding agents. [GitHub](https://github.com/example/agent)',
    priority: 40
  },
  {
    id: 'proj-scraper',
    type: 'project',
    tags: ['canonical', 'section:projects', 'cat:data-automation', 'tier:1'],
    title: 'Scraper',
    content: '**Scraper** - Built 12 scraper verticals feeding one index.',
    priority: 39
  },
  {
    id: 'proj-game',
    type: 'project',
    tags: ['section:projects', 'cat:apps-games-tools', 'tier:2'],
    title: 'Puzzle game',
    content: '**Puzzle game** - Built a daily puzzle with a shared leaderboard.',
    priority: 30
  },
  {
    id: 'proj-odd',
    type: 'project',
    tags: ['section:projects', 'cat:misc', 'tier:3'],
    title: 'Odd one',
    content: '**Odd one** - Built something uncategorised.',
    priority: 10
  },
  {
    id: 'skills',
    type: 'skills',
    tags: ['always', 'canonical', 'section:skills'],
    title: 'Technical skills',
    content: '# Technical Skills\n\n**Languages:** TypeScript, Go, Python',
    priority: 100
  },
  {
    id: 'exp-additional',
    type: 'experience',
    tags: ['canonical', 'section:experience-secondary'],
    title: 'Additional experience',
    content: '**Fabrikam** - Junior Developer, 2015-2018',
    priority: 50
  },
  {
    id: 'education',
    type: 'education',
    tags: ['canonical', 'section:education'],
    title: 'Education',
    content: '**State University** - BSc Computer Science',
    priority: 50
  }
]
