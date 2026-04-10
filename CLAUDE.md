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

## Does NOT

- Have its own wrangler.toml -- worker is deployed by hadoku_site (see `../hadoku_site/`)
- Have tests -- no test framework configured
- Have a local backend server -- the old Express server/ was removed
- Use .env for secrets -- all secrets are Cloudflare bindings
