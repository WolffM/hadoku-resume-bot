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

**The version is CI's, never a commit's.** Nobody edits it and no hook bumps
it. publish.yml's `Version` step (`WolffM/hadoku-actions/next-version@v1`) sets
it to one patch above the registry's newest, in the CI workspace only, and
nothing is committed back. A committed version above the registry is kept, so a
deliberate major/minor bump stays possible.

Majors reach production on their own: hadoku_site's update-packages workflow
upgrades `@wolffm/*` across major boundaries, ignoring the semver range.

## Does NOT

- Have its own wrangler.toml -- worker is deployed by hadoku_site (see `../hadoku_site/`)
- Have tests -- no test framework configured
- Have a local backend server -- the old Express server/ was removed
- Use .env for secrets -- all secrets are Cloudflare bindings

## Telemetry: where your app's data lives

What a visitor did is in monitoring-api's D1, readable with this repo's own
service key. Query it. Don't use Cloudflare Workers Logs (a normal
`wrangler login` can't read them), and don't ask the operator what a visitor
saw. If the log can't answer, add telemetry.

```sh
K=$(node -p "require('./.devvault.local.json').key")
curl -s -A "Mozilla/5.0 hadoku-agent" -H "X-User-Key: $K" \
  "https://hadoku.me/health/api/logs/query?path=/resume&since=2026-10-27T00:00:00Z&limit=200"
```

- Events your code posts go to `service_events`: `POST /health/api/telemetry`
  with `context.service: "resume"`, read back with
  `GET /health/api/service-events?service=resume`. Not `console.log`.
  Browser events: POST to your own `/resume/api/*` route and relay from
  the backend, which holds the key.
- Only finished requests that reach the edge are logged. A UI app's page
  is served by GitHub Pages, so only its `/resume/api/*` calls show up; a
  tunnel app's whole prefix does.
- `user_id c8c59a87-f8af-4da7-9c99-d9e536b3fca8` is the daily automated tour
  (~09:2x UTC), not a visitor.

Params, write format, caveats: `../hadoku_site/docs/child-apps/TELEMETRY.md`.
