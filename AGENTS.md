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

`EDGE` (service binding to edge-router) + `HADOKU_SERVICE_KEY` (`resume-bot-service-key`,
on the edge allow list `crossposter-claude-code-lease`): the Claude pool, first in the chain.
`GROQ_API_KEY`: the free fallback. `RATE_LIMIT_KV`, `CONTENT_KV`.

These are Cloudflare Worker bindings configured in hadoku_site's wrangler config, not .env vars.

`RESUME_SYSTEM_PROMPT` is NOT in that list any more. Since 3.8.0 the system
prompt is read from `CONTENT_KV` under `resume:prompt` — it is content, not a
credential, and `/system-prompt` already serves it verbatim to friend tier. The
secret is still honoured as a fallback, but hadoku_site deleted it from the
worker on 2026-09-03, so nothing sets it. Being the one piece of resume content
NOT in KV is what kept a forbidden `.env` file and a raw `wrangler secret put`
alive downstream.

## Worker API endpoints

All prefixed with `basePath` (typically `/resume/api`): `/chat`, `/resume`, `/resume.pdf` (server-rendered PDF download), `/system-prompt`, `/tailored-resume`, `/cover-letter`, `/application-extras`, `/variants`, `/builder/*` (admin, the owner's blocks), and per user: `/blocks`, `/blocks/:id`, `/blocks/import`, `/contact-profile`

## Per-user content (`worker/src/scope.ts`)

Résumé content is scoped. The owner's is the original global key set
(`resume:blocks:<id>`, `resume:variant:<slug>`, `resume:profile:contact`, the
unprefixed caches), unchanged. Every other user has the same keys with their
registry userId after the namespace (`resume:blocks:<userId>:<id>`,
`resume:variant:<userId>:<slug>`, `resume:tailored:<userId>:<hash>`, ...), plus
`resume:variant-owner:<slug>` so a shared `?v=<slug>` link resolves. That
pointer has no TTL and survives a delete: a user's expired or deleted packet
answers 404 `VARIANT_GONE` on `/resume` and `/resume.pdf`, never the owner's
resume (only an unknown or owner slug falls back to it).

- Scope comes from the edge-verified identity: admin, or the userId in
  `RESUME_OWNER_USER_ID`, is the owner; any other userId is its own scope; no
  userId is 403. Never a fallback to the owner's blocks.
- A service caller acting for a person (jobplatform-api) sends
  `on_behalf_of_user_id` in the JSON body. It is honoured only when the
  caller's own userId is in `ON_BEHALF_CALLER_USER_IDS`, and only when
  `RESUME_OWNER_USER_ID` is set (503 otherwise, so the owner named by
  jobplatform never lands in a fresh user scope).
- A user with no blocks gets `409 {code: "NO_RESUME_BLOCKS"}` from
  `/tailored-resume`, `/cover-letter` and `/variants`; `/application-extras`
  without a stored contact gets `409 {code: "NO_CONTACT_PROFILE"}`.
- `POST /blocks/import` splits pasted résumé text into blocks
  (`worker/src/resume-import.ts`, no LLM) for the generic layout
  (`GENERIC_LAYOUT` in `skeleton.ts`). The owner's three-page skeleton and
  selection rules apply to the owner only.
- A user's tailored résumé is held to two pages (`worker/src/fit.ts`): the
  tailoring prompt asks for it, then `fitResumeToPages` measures the result
  with the PDF typesetter's page counter and, only if it overflows, merges a
  bulleted skills list into one paragraph, caps bullets per job by recency
  (oldest jobs down to one or two), shortens certifications and optional
  sections, and as a last resort drops optional sections. Every job heading,
  employer line, date and the education section always stay. A user's packet
  PDF uses the `compact` style in `pdf.ts` and the title "<Name> - Resume",
  on A4, or US Letter when the user's contact location is in the US or Canada
  (`worker/src/paper.ts`); the fitter measures on the same paper. The owner's
  PDF layout, Letter paper and title are unchanged.
- `RESUME_OWNER_USER_ID` and `ON_BEHALF_CALLER_USER_IDS` are plain `[vars]` on
  resume-api in hadoku_site's wrangler config.

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
- Have a test framework dependency -- `pnpm test` runs `worker/tests/` on node's
  built-in `node:test`. `worker/tests/golden/owner.json` is the owner's output
  recorded before per-user scoping; it must stay byte-identical.
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
