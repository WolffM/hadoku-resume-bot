// Does this commit message declare a breaking change? Shared by
// .husky/prepare-commit-msg and .husky/commit-msg so both judge identically.
//
//   node scripts/is-breaking-commit.mjs <path-to-commit-msg-file>
//
// Exits 0 for breaking, 1 for not. Conventional Commits defines two markers:
//   - a `!` before the colon in the subject:  feat!: …   refactor(api)!: …
//   - a `BREAKING CHANGE:` footer in the body
//
// Comment lines are stripped first — git's commit template is full of hints
// like "# … use feat!: for breaking changes", and matching those would flag
// every commit.

import { readFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) process.exit(1)

let text
try {
  text = readFileSync(file, 'utf8')
} catch {
  process.exit(1)
}

const lines = text.split(/\r?\n/).filter(l => !l.startsWith('#'))
const subject = lines.find(l => l.trim() !== '') ?? ''

// `type: …` / `type(scope): …`, with the `!` that marks it breaking.
const breakingSubject = /^[a-zA-Z]+(\([^)]*\))?!:/.test(subject.trim())
const breakingFooter = lines.some(l => /^BREAKING[ -]CHANGE:/.test(l))

process.exit(breakingSubject || breakingFooter ? 0 : 1)
