#!/usr/bin/env node
// Point git at .husky/ for hooks. Run from package.json's `prepare`.
//
// WHY THIS EXISTS INSTEAD OF `husky`
// ----------------------------------
// husky sets `core.hooksPath` to `.husky/_`, a directory it GENERATES and that
// its own `.gitignore` excludes from the repo. git resolves a relative
// `core.hooksPath` against the working tree root, and `core.hooksPath` lives in
// the shared config — so in a linked worktree the setting is inherited but
// `<worktree>/.husky/_` does not exist, and git runs no hook AT ALL. Silently:
// no warning, no non-zero exit. Commits made from a worktree therefore skipped
// the version bump entirely, and the published version drifted from the repo's
// (3.4.12 in git vs 3.5.15 on the registry by 2026-08-24).
//
// `.husky/pre-commit` and `.husky/post-commit` are tracked, so pointing at
// `.husky` itself is present in every worktree by construction. That is the
// whole fix; the `_` shim only added a PATH tweak and a `HUSKY=0` escape, both
// of which the hooks now do themselves.
//
// The config is repo-global (it lives in the common .git/config), so running
// this once in any checkout covers every worktree, existing and future.

import { execFileSync } from 'node:child_process'

const HOOKS_PATH = '.husky'

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

try {
  git('rev-parse', '--git-dir')
} catch {
  // Installed from a tarball or a vendored copy — nothing to wire up.
  process.exit(0)
}

const current = (() => {
  try {
    return git('config', '--get', 'core.hooksPath')
  } catch {
    return ''
  }
})()

if (current === HOOKS_PATH) process.exit(0)

git('config', 'core.hooksPath', HOOKS_PATH)
console.log(
  current
    ? `🪝 core.hooksPath: ${current} -> ${HOOKS_PATH}`
    : `🪝 core.hooksPath set to ${HOOKS_PATH}`
)
