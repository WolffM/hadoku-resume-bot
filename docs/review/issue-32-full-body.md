## Why

hadoku_site's new frontpage app cards need per-app content for **resume**. This repo is
already public — this issue is assets + audit only, plus a quick hygiene pass since
recruiters will click through from the resume and the new card.

- [ ] Quick hygiene: README presentable to a stranger; no stray secrets/personal data in
      recent commits; CI green.

## Phase 2 — frontpage app-card assets (no gate — repo already public)

Card: app id `resume`, route `hadoku.me/resume`, tier `public`, category `Matthaeus Wolff`
(source of truth: `hadoku_site/spec/categories.json`).

Resume claim this card must live up to (block `proj-resume-bot` in the resume palette):

> hadoku-resume-bot — this resume + chat widget: a two-pass Groq LLM pipeline that selects and tailors resume blocks per job.

**Current known state (verified-anonymous, 2026-08-12):** Anonymous today: flawless — page, PDF endpoint, and chat all work with zero credentials. Best capture: the chat answering a question about the resume, or the tailoring flow.

**Privacy specifics for this app:** Contact info on the resume is public by design; still no keys/tokens in captured URLs.

### Delivery

Into **hadoku_site** (worktree-first: `pnpm run worktree <name>` inside hadoku_site, commit,
push `origin HEAD:main`):

1. `spec/assets/apps/resume.webp` — the app's most representative screen. 1280x800 viewport,
   webp, <=200KB, dark theme default, captured from the LIVE app at `https://hadoku.me/resume`
   (never a dev build).
2. `spec/assets/apps/resume.webm` — **silent, video-only** capture of one real interaction,
   15-30s, same viewport, target <=2MB (hard cap 4MB). The owner records voiceover themselves,
   so ALSO deliver `spec/assets/apps/resume-voiceover.md`: a narration script timed to the
   capture (timestamped beats, ~2.5 words/sec) so a single ffmpeg mux step produces the final
   one-file webm with audio baked in.
3. `spec/assets/apps/descriptions.json` — merge an entry `{ "resume": { "description": "..." } }`.
   One punchy sentence (<=18 words) saying what it does, optional second sentence of flavor.
   Voice: direct, a little edgy, no marketing fluff, no "A tool that..." openers. Written for a
   stranger who has never seen the ecosystem.
4. `spec/assets/apps/AUDIT.md` — add this app's row: anonymous status code, renders something
   meaningful y/n, interactive y/n, console errors, capture auth level used, anything broken.
   **Anything broken is a finding, not a footnote — put it at the TOP of AUDIT.md** (route
   404/500, blank render for the declared tier, WAF challenge loop).

Do NOT edit `spec/categories.json` or any POC — the hadoku_site session integrates
descriptions into the catalogue itself. `spec/assets/README.md` currently declares the folder
emoji-only/frozen; the first asset commit may update that README to document the new `apps/`
subfolder.

### Capture & audit rules (apply to every asset)

- **All traffic through `hadoku.me/{prefix}/`** — never `*.hadoku.me` subdomains.
- **Cloudflare 403s bare/bot user agents** — use a real browser UA everywhere, including curl probes.
- `/meet` 301s to `/meet/` — follow it; that's healthy, not a failure.
- **Verified-anonymous rule:** the persistent Playwright MCP profile carries the owner's real
  `hadoku_session` cookie, so a "fresh" browser there is silently logged in. Before trusting any
  anonymous observation, confirm `https://hadoku.me/session/whoami` returns
  `{"valid":false,"userType":"public"}` from that exact client, or use curl with a browser UA.
  (This exact trap produced a false "data leak" finding on 2026-08-12.)
- **Authenticated captures:** auth is the session COOKIE set by the in-browser sign-in POST —
  writing localStorage does nothing.
- **PRIVACY GATE (hard requirement):** no real personal data in any asset. Stage demo data or
  crop. Every screenshot/webm gets a second look for leaked names, emails, keys, and URLs with
  embedded tokens.
