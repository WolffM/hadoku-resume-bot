// Single source of truth for version bumping. Used by .husky/pre-commit and
// .husky/prepare-commit-msg so the arithmetic lives in exactly one place.
//
//   node scripts/bump-version.mjs <major|minor|patch|auto|none> [baseVersion]
//
// `auto` is the historical default: bump the patch, rolling over to the next
// minor at .20 to keep patch numbers manageable. `auto` can never produce a
// major — that is why an explicit level exists.
//
// baseVersion overrides package.json's current value. prepare-commit-msg needs
// this: pre-commit has already written a patch bump by the time it runs, so a
// major has to be computed from HEAD's version rather than from the file.
//
// Prints "<old> -> <new>" to stdout, or nothing when the level is `none`.

import { readFileSync, writeFileSync } from 'node:fs'

const LEVELS = ['major', 'minor', 'patch', 'auto', 'none']
const [, , rawLevel, baseVersion] = process.argv
const level = (rawLevel ?? '').toLowerCase()

if (!LEVELS.includes(level)) {
  console.error(`bump-version: unknown level ${JSON.stringify(rawLevel)}`)
  console.error(`              expected one of: ${LEVELS.join(', ')}`)
  process.exit(2)
}

const pkgPath = new URL('../package.json', import.meta.url)
const pkgSrc = readFileSync(pkgPath, 'utf8')
const pkg = JSON.parse(pkgSrc)
const current = baseVersion ?? pkg.version

const parsed = /^(\d+)\.(\d+)\.(\d+)$/.exec(current)
if (!parsed) {
  console.error(`bump-version: cannot parse version ${JSON.stringify(current)} — expected x.y.z`)
  process.exit(2)
}
const [major, minor, patch] = parsed.slice(1).map(Number)

function next() {
  switch (level) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    // Historical behaviour, preserved exactly: .20 rolls over to the next minor.
    case 'auto':
      return patch === 20 ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`
  }
}

if (level === 'none') process.exit(0)

const newVersion = next()
if (newVersion === pkg.version) process.exit(0)

// Patch the version string in place — re-stringifying the parsed object
// reindents the whole file, which turns a bump of a tab-formatted or CRLF
// package.json into a whole-file diff that format:check then rejects.
const patched = pkgSrc.replace(/("version"\s*:\s*")[^"]*(")/, (mm, a, b) => a + newVersion + b)
if (patched === pkgSrc) {
  console.error(`bump-version: no version field to patch in ${pkgPath}`)
  process.exit(2)
}
writeFileSync(pkgPath, patched)
console.log(`${current} -> ${newVersion}`)
