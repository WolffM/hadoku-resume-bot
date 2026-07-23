# Plan — Funnel expansion + Application Packet delivery

Status as of 2026-07-21. Cross-repo plan spanning `hadoku-scrape` (funnel) and
`hadoku-resume-bot` (+ one `hadoku_site` edge bit) for delivery/packet.

## Goal (near-term win)

Close the loop for **manual** apply:
**scrape → tailored résumé → cover letter → delivered as a clean packet** the
owner hands over or sends. NO browser automation yet (patchright is end-stage).
Résumé blocks/chunks are assumed correct for now — the builder chunk-review is
the owner's parallel track.

---

## Workstream A — Funnel (`~/repos/hadoku-scrape`)

Add job-board providers beyond Greenhouse/Lever (LinkedIn is OFF — ban risk).
All endpoints below were live-verified 2026-07-21.

### Pipeline grounding (how providers get wired)

Flow: resolve company → `(ats, slug)` → SQLite `jobboard_targets` registry →
orchestrator fetches each provider's public API → maps to normalized
`JobListing` (`models.py:173`) → `to_dict()` → `JobListingKV` (frozen cross-repo
contract w/ jobplatform) → Cloudflare KV + webhook batches to jobplatform.

Four wiring points (currently OUT OF SYNC — that's the Ashby bug):

- `slug_resolver.py:28` `ATS_PROBES` — greenhouse, lever, **ashby**
- `target_registry.py:24` `SUPPORTED_ATS` — greenhouse, lever, **ashby**
- `orchestrator.py:47` `_LIST_URLS` — greenhouse, lever **only** ← Ashby missing
- `orchestrator.py:208` `_parse_listings` — greenhouse, lever **only** ← Ashby missing

Fetch model is **GET-only** today (`_fetch_target_jobs` does
`httpx.get(url.format(slug=slug))`). Adding a GET provider = 4 small edits.
Workday needs POST-body support (a real change).

### A1 — Wire Ashby [S] ← START HERE (quick win + bug fix)

Ashby is half-wired: `/resolve` + `/targets` accept it, but with no `_LIST_URLS`
entry every scrape logs `unsupported_ats_in_orchestrator`, records
`status="failed"`, and **auto-disables the target after 3 runs**. So Ashby
companies added today silently rot.

- `orchestrator.py:47` `_LIST_URLS`: add
  `"ashby": "https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true"`
- fetch branch (~`orchestrator.py:82`): `jobs = data.get("jobs", []) if isinstance(data, dict) else []`
- `orchestrator.py:208` `_parse_listings`: add an `ashby` branch → new `ats/ashby.py::_parse_job`
- Field map: `ashby_{id}` / `jobUrl` / `descriptionHtml`→clean_html /
  `employmentType`→job_type / `workplaceType`+`isRemote`→workplace_type /
  `compensation.scrapeableCompensationSalarySummary`→`SalaryInfo.parse` /
  `publishedAt`→posted_date / `department`, `team`, `applyUrl`→application_url
- **Acceptance:** add a real Ashby co (e.g. Ramp / Notion / Linear) → scrape
  returns listings; target stays enabled.

### A2 — SmartRecruiters [M]

- list: `GET api.smartrecruiters.com/v1/companies/{id}/postings` (`.content` array)
- detail (N+1 for description): `GET .../postings/{id}`
- add to `ATS_PROBES` + `SUPPORTED_ATS` + `_LIST_URLS` + `_parse_listings` + `ats/smartrecruiters.py`
- Enterprise/EU coverage (Visa, Bosch, Ubisoft).

### A3 — Workday CXS [L] (biggest coverage ~32%, one real refactor)

- list: `POST {tenant}.{wdN}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs`
  body `{"appliedFacets":{},"limit":20,"offset":N,"searchText":""}`, loop offset until total
- detail (full `jobDescription`): `GET .../{site}{externalPath}`
- needs: POST-body support + pagination in `_fetch_target_jobs`; store
  `(tenant, wdN, site)` (extend target model or encode in slug); **seed a map**
  (mechanical prober can't discover tenant/datacenter). Ref request shapes:
  github.com/axm0/jobwatcher.
- Unlocks Tesla/Uber/NVIDIA/T-Mobile (currently in the `unsupported` alias map).

### A4 — Recruitee [S] / Workable [M] — later breadth (SMB/EU).

### SKIP — Personio (bot-gated 429), Teamtailor + iCIMS/Taleo/Jobvite/BambooHR/JazzHR (auth-gated).

### Scrape deploy

Backend at `scraper.hadoku.me`; mgmt-api cron in hadoku_site triggers
`POST scraper.hadoku.me/api/v1/jobboards/search`. **VERIFY the deploy mechanism
for hadoku-scrape before shipping** (not yet confirmed this session).

---

## Workstream B — Delivery & Packet (`~/repos/hadoku-resume-bot`, one edge bit in `hadoku_site`)

### E2E findings that drove this (verified live 2026-07-21)

Drove Stripe "Staff SWE, AI Platform" posting: `/tailored-resume` → 5747-char
résumé (13 blocks smartly picked); `/cover-letter` → clean 1812-char letter;
minted variant → rendered at `hadoku.me/resume?v=CFEX8aJwYMa9` (7-day TTL,
expires ~2026-07-28) with PDF/.md/.json downloads. `?v=slug` → `hadoku.me/resume`
IS the delivery route. Delivery pathway files:

- `worker/src/variants.ts` — `ResumeVariant {slug,label,markdown?,block_ids?,created_at}`, mint/render/list/delete
- `worker/src/tailored-resume.ts` — two-pass LLM (extract tags → select blocks → assemble)
- `worker/src/cover-letter.ts` — 3-para letter, 24h cache
- `worker/src/index.ts` — GET `/resume?v=` returns `{content, variant?}`; routes + auth gates
- `src/components/ResumeViewer.tsx` — reads `?v`, `fetchResume`, PDF(window.print)/.md/.json downloads
- `src/services/api.ts` — `fetchResume(variant?)`

### B1 — Strip the ` ```markdown ` fence [S] ← START HERE (2nd quick win)

`/tailored-resume` output is wrapped in a ` ```markdown … ``` ` fence →
ReactMarkdown renders the whole résumé as a code block. Affects EVERY tailored
résumé incl. jobplatform packets.

- Fix in `worker/src/tailored-resume.ts`: strip a leading `^```(markdown|md)?\n`
  and trailing `\n```$` from the LLM output before returning/caching. Add the
  same defensively in `cover-letter.ts` and/or the viewer.
- **Acceptance:** `/tailored-resume` returns clean markdown (no fence); delivered
  page renders formatted, not a `<pre><code>` block.

### B2 — Fix variant-mint timeout [S]

Minting a variant with `job_title+company+description` (inline tailoring) runs
the two-pass LLM but the `/resume/api/variants` POST is NOT in edge-router's
120s carve-out (only `/tailored-resume` + `/cover-letter` are — added in
hadoku_site #197). It 500s with `"Timeout after 10000ms"`.

- Fix: add `/resume/api/variants` (POST) to the edge-router 120s carve-out.
  This is a `hadoku_site` edge-router change → **worktree off origin/main → PR**
  (dirty tree). Look where the tailored-resume/cover-letter carve-out lives in
  the edge-router proxy/timeout config.
- **Acceptance:** mint with job_title+company+description succeeds (no 10s 500).

### B3 — Cover-letter packet [M] (the core "package it nicely" feature)

- Worker: extend `ResumeVariant` with `cover_letter_markdown?`, `company?`,
  `job_title?`. `mintVariant` generates the cover letter too when tailoring (or
  accepts pre-rendered). Extend GET `/resume?v=` (or add an endpoint) to return
  the cover letter alongside the résumé.
- UI (`ResumeViewer`): **Résumé / Cover Letter toggle** (DEFAULT — vs separate
  pages), label the variant (company/role), add a **combined packet download**
  (résumé + cover letter as .md and PDF).
- **Acceptance:** `hadoku.me/resume?v=slug` shows tailored résumé AND cover
  letter with downloads; one combined packet download works.

### B4 — Sticky slug (localStorage) [S]

Cache `?v` so a recruiter who later hits bare `hadoku.me/resume` still gets their
packet. Owner confirmed the shared-computer caveat is a non-issue (localStorage).

- `ResumeViewer.loadResume()`:
  ```ts
  const KEY = 'hadoku_resume_variant'
  const urlSlug = new URLSearchParams(location.search).get('v')
  if (urlSlug) localStorage.setItem(KEY, urlSlug) // fresh link wins + sticks
  const slug = urlSlug ?? localStorage.getItem(KEY) ?? undefined
  ```
  URL wins; downloads use the effective slug; self-heal (clear key) if the server
  fell back (expired slug — needs `fetchResume` to also surface the matched variant).
- **Acceptance:** visit `?v=slug`, then bare `/resume` → still the tailored packet.

---

## Recommended sequence

1. **Phase 1 (quick wins, independent):** A1 Ashby + B1 fence fix
2. **Phase 2 (the packet — the manual-apply win):** B2 → B3 → B4
3. **Phase 3 (coverage scale):** A2 SmartRecruiters → A3 Workday

## Deferred / out of scope (owner's call)

- Builder chunk review (owner's parallel track; chunks assumed correct)
- Apply automation (patchright/browser) — end-stage, later
- Job-posting→tag extraction for tailoring pass-1 (tags unused by the selector) — enhancement

## Defaulted decisions (flag to change)

- B2: fix via edge carve-out for `/variants` (keep mint-time tailoring), not a mint restructure.
- B3 UI: résumé/cover-letter toggle + one combined packet download.

---

## Execution reference (deploy chains, auth, gotchas)

- **resume-bot deploy:** edit → `pnpm build` (NOT just typecheck — worker
  `build:worker` tsc is stricter) → commit (pre-commit hook auto-bumps patch
  version, rolls .20→next minor) → push `main` → `publish.yml` → GitHub Packages
  → dispatch → hadoku_site "Update Packages" copies `dist/*.js` to
  `public/mf/resume/` → redeploy. A few min.
- **hadoku_site edge-router (B2):** its working tree is DIRTY with owner WIP —
  do edits in a `git worktree` off `origin/main` → PR → merge → deploy-workers.
  NEVER push hadoku_site to main directly; NEVER self-merge (it's the main site).
  (Both these repos also get periodic `chore: auto-update @wolffm/*` commits on
  main — fetch+rebase before pushing.)
- **Testing auth (no admin key for agents):** friend key via dev-vault —
  `npx @wolffm/dev-vault -- bash -c 'curl -s -H "X-User-Key: $RESUME_FRIEND_KEY" …'`
  Friend can call `/tailored-resume`, `/cover-letter`, `/variants`,
  `/system-prompt`, `/variants`. Builder is admin-only (agents can't exercise it).
  dev-vault prints a banner to stdout — filter JSON with `grep '^{'`.
- **No AI attribution** in commits/PRs (owner global rule).
- Scratchpad demo artifacts (posting JSON, tailored/cover md) are in this
  session's scratchpad; the demo variant `CFEX8aJwYMa9` auto-expires ~2026-07-28.
