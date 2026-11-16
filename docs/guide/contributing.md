# Resume Bot: contributing

How to run, change and ship Resume Bot. What it does for a visitor is in
[features.md](features.md). This repo's own [`AGENTS.md`](../../AGENTS.md)
is the authoritative reference for the worker API's endpoints and bindings.

## Run it

```sh
pnpm install
pnpm dev          # dev server on :5173, index.html mounts the component directly
pnpm build        # two vite builds + tsc
pnpm lint:fix
pnpm format
```

`pnpm install` and `pnpm dev` need no credential. The friend-only API routes
do; getting one is documented in this repo's own README (identity:
`resume-bot-service-key`). There is no test framework configured in this
repo — there are no tests to run.

Pass URL parameters to the dev harness to see different states:
`?theme=ocean`, `?userType=admin&sessionId=test-123`.

## Architecture

One package, two exports, built and published together:

| Export  | What                              | Entry point           |
| ------- | --------------------------------- | --------------------- |
| `.`     | UI component: `mount`/`unmount`   | `src/entry.tsx`       |
| `./api` | Worker API: `createResumeHandler` | `worker/src/index.ts` |

**The résumé is content, not code.** Every piece — a job, a project, a
skill group, the system prompt itself — is a tagged block in Cloudflare
`CONTENT_KV`, never markdown checked into this repo. The canonical résumé is
assembled from blocks tagged `canonical`; a tailored one is assembled from a
subset an LLM picks for the job at hand. See `worker/src/blocks.ts` and
`worker/src/skeleton.ts` (the section-boundary splitter that lets the UI
style each section for what it is).

**Gating is in-worker**, not left to the edge alone
(`worker/src/index.ts`): `createEdgeAuth()` degrades any request with no
valid provenance header to `public`, and two `requireMinTier` groups sit on
top of it — friend-and-up for `/system-prompt`, `/tailored-resume`,
`/cover-letter`, `/application-extras` and `/variants*`, admin-only for
`/builder/*`. A tier hierarchy (`public < friend < service < admin`) means
naming the lowest tier admits everything above it, including a same-origin
Cloudflare service binding call stamped as `service` by another app.

**The LLM provider chain** (`worker/src/constants.ts`) tries Groq first and
falls over to a second free-tier provider on a rate limit, because Groq's
free tier cannot serve one tailored résumé inside its own token-per-minute
window; see [trivia.md](trivia.md) for the numbers. The order is a
deliberate quality choice — every prompt was tuned against Groq's model —
not a throughput one.

**The content builder** (`src/builder/`, `worker/src/builder.ts`) is a
separate admin-only bundle (`dist/builder.js`), built from the same repo but
shipped and loaded on its own.

## Tests and gates

```sh
pnpm lint:fix
pnpm format      # prettier --write
pnpm format:check
```

No unit or end-to-end test suite exists in this repo (`AGENTS.md`, "Does
NOT"). Verification today is manual probing against the real API.

## How it deploys

Push to `main` publishes to GitHub Packages and dispatches a
`packages_updated` event; the parent site pulls the new version and
redeploys. **Versions are CI's**, computed once at publish time from the
registry's current version — nobody bumps one by hand, and no commit hook
does either (`4cbbe5b`; see [history.md](history.md)).

## Trivia

This repo and Job Platform fixed the identical bug on the identical day:
`core.hooksPath` pointed at a husky-generated directory excluded from git,
so a linked worktree inherited the setting but had nothing there to run —
silently, with no warning and no failed exit. Every commit made from a
worktree in either repo had been skipping its lint/typecheck gates and its
version bump (`a8a4912`, 2026-08-24).
