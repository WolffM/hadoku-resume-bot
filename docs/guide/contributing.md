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

`pnpm install` and `pnpm dev` need no credential or `.npmrc`: the `@wolffm/*`
dev dependencies are npm aliases of their public npmjs copies, and the dev
harness talks to the public résumé API. The friend-only API routes take your
own hadoku.me key, at friend tier, as `X-User-Key`. There is no test framework
configured in this repo — there are no tests to run.

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

**The LLM provider chain** (`worker/src/llm.ts`, `worker/src/constants.ts`)
runs Claude first: Sonnet 5.5 on the operator's Claude Code subscription, leased
per request from crossposter's account pool (`worker/src/claude-pool.ts`) and
reported back after every call, so a spent account is benched and the pool
moves on. The chain falls over to the free providers, Groq first, whenever
this worker cannot lease: no `EDGE` binding or service key, a refusal, or no
account usable. See [trivia.md](trivia.md) for why Groq alone cannot serve one
tailored résumé inside its own token-per-minute window.

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
