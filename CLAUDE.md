## What this repo is

@wolffm/resume-bot -- AI chat + resume viewer widget, published as a dual-export npm package to GitHub Packages.

## Two exports, one package

- **UI component** (`.` export): `mount(el, props)` / `unmount(el)` from `src/entry.tsx`
- **Worker API** (`./api` export): `createResumeHandler(basePath, options)` from `worker/src/index.ts`

Both ship in `dist/` via `pnpm build` (runs two vite builds + tsc).

## Contracts with hadoku_site

- **UI**: hadoku_site imports mount/unmount, provides React + @wolffm/themes as peer deps
- **Worker**: hadoku_site imports `createResumeHandler`, wires it into its Cloudflare Worker
- **Publish**: on push to main, `publish.yml` publishes to GitHub Packages and dispatches `packages_updated` to `WolffM/hadoku_site`
- **Sibling repo**: `../hadoku_site/`

## Worker API bindings (Cloudflare)

`GROQ_API_KEY`, `RESUME_SYSTEM_PROMPT`, `RATE_LIMIT_KV`, `CONTENT_KV`

These are Cloudflare Worker bindings configured in hadoku_site's wrangler config, not .env vars.

## Worker API endpoints

All prefixed with `basePath` (typically `/resume/api`): `/chat`, `/resume`, `/system-prompt`, `/tailored-resume`, `/cover-letter`

## Versioning

- Pre-commit hook auto-bumps patch version on src/ or config changes
- Rolls over at .20 to next minor (1.1.20 -> 1.2.0)
- publish.yml has fallback bump if hook was skipped
- `BUMP=major|minor|patch|none git commit ...` overrides the default. **A major
  needs `BUMP=major`** — the default can never reach one.
- A `feat!:` / `BREAKING CHANGE:` commit without a major bump is rejected by
  `.husky/commit-msg`, which tells you to re-run with `BUMP=major`. It can only
  reject, not fix: pre-commit writes the version but runs before git has the
  commit message, and the hooks that can read the message run after the tree is
  snapshotted, so their staging lands in the _next_ commit.
- Version arithmetic lives in `scripts/bump-version.mjs` (not published — `files`
  is `["dist"]`)

Majors reach production on their own: hadoku_site's update-packages workflow
upgrades `@wolffm/*` across major boundaries, ignoring the semver range.

## Does NOT

- Have its own wrangler.toml -- worker is deployed by hadoku_site (see `../hadoku_site/`)
- Have tests -- no test framework configured
- Have a local backend server -- the old Express server/ was removed
- Use .env for secrets -- all secrets are Cloudflare bindings
