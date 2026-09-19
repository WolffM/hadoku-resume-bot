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

`GROQ_API_KEY`, `RATE_LIMIT_KV`, `CONTENT_KV`

These are Cloudflare Worker bindings configured in hadoku_site's wrangler config, not .env vars.

`RESUME_SYSTEM_PROMPT` is NOT in that list any more. Since 3.8.0 the system
prompt is read from `CONTENT_KV` under `resume:prompt` — it is content, not a
credential, and `/system-prompt` already serves it verbatim to friend tier. The
secret is still honoured as a fallback, but hadoku_site deleted it from the
worker on 2026-09-03, so nothing sets it. Being the one piece of resume content
NOT in KV is what kept a forbidden `.env` file and a raw `wrangler secret put`
alive downstream.

## Worker API endpoints

All prefixed with `basePath` (typically `/resume/api`): `/chat`, `/resume`, `/resume.pdf` (server-rendered PDF download), `/system-prompt`, `/tailored-resume`, `/cover-letter`

## Versioning

**The commit message decides the version. There is nothing to remember.**

- `feat!:` / `<type>(scope)!:` / a `BREAKING CHANGE:` footer → **major**
- `feat:` → **minor**
- anything else → patch, rolling over at .20 to the next minor (1.1.20 -> 1.2.0)

Two hooks, because one cannot do it alone:

- `.husky/pre-commit` writes the ordinary patch/auto bump. It is the only hook
  whose staging lands in the commit it runs on — and the only one that cannot
  see the commit message, because git has not obtained it yet.
- `.husky/post-commit` runs `scripts/version-from-commit.mjs`, which reads the
  message, and if it asks for a higher level, recomputes from the parent
  commit's version and amends. Idempotent (always derived from `HEAD^`, so
  `--amend` converges rather than climbing), and it skips merges, rebases and
  cherry-picks.

`BUMP=major|minor|patch|none git commit ...` still overrides the message when
you need it — e.g. `BUMP=patch` for a break that is not in the published API.

- publish.yml has a fallback bump if the hook was skipped
- Version arithmetic lives in `scripts/bump-version.mjs`; the message→level
  mapping in `scripts/version-from-commit.mjs`. Neither is published (`files`
  is `["dist"]`)

Majors reach production on their own: hadoku_site's update-packages workflow
upgrades `@wolffm/*` across major boundaries, ignoring the semver range.

## Does NOT

- Have its own wrangler.toml -- worker is deployed by hadoku_site (see `../hadoku_site/`)
- Have tests -- no test framework configured
- Have a local backend server -- the old Express server/ was removed
- Use .env for secrets -- all secrets are Cloudflare bindings
