# Applicant flow E2E — live-system review, 2026-08-17

Run as the owner's daily driver against production (`hadoku.me`), friend-tier key from the
jobplatform dev-vault. Everything read-only except the normal records the prep flow writes
(job_states rows for two jobs, one minted variant `wxcqs04shN39`).

- **Primary job (intended run):** `greenhouse_5230394008` — Staff+ Site Reliability Engineer,
  Safeguards ML Infra @ anthropic, remote, scraped 2026-08-11, state was `new`. **Prep flow could
  not run on it** (see problem 1); left at `interested`.
- **Fallback job (full packet run):** `linkedin_4400762467` — Senior Platform Engineer @ Swoon,
  hybrid NYC, 927-char JD — the _only_ class of job small enough to squeeze under the token cap,
  and even it needed a hand-trimmed JD via a direct resume-api call. Ended state `saved` with
  `variant_slug=wxcqs04shN39` (honest: packet prepared, nothing actually submitted).
- Versions: resume-bot package.json says 3.4.1; palette = 57 blocks (`hadoku_site/scripts/resume/blocks.json`, backed up same-day as `blocks.json.bak-2026-08-17`).

## Worst three problems

1. **"Prepare application" is 100% down, corpus-wide.** The block-selection prompt (pass 1) alone
   now weighs ~8,336 tokens (57-block palette ≈5,700 fixed + JD capped at 2,500 chars + 2,048
   `max_tokens`) against Groq's free-tier 8,000-token request cap → deterministic 413 on **every**
   job with a JD ≥ ~1,200 chars, which is every real listing in the feed. `tailor:false` fails
   identically (same pass). The Cerebras primary that constants.ts says should absorb this is
   **not deployed**: `wrangler secret list --name resume-api` shows only `GROQ_API_KEY` and
   `RESUME_SYSTEM_PROMPT` — no `CEREBRAS_API_KEY`, so the chain degrades to Groq-only. (And even
   if deployed, free-tier Cerebras has an 8,192 context, so an 8,336-token selection request
   falls straight back to Groq anyway.) This is the 2026-07-31 "verify TPM fix" open item:
   **not fixed — regressed further as the palette grew 51 → 57 blocks.**
2. **Location handling is absent.** For the hybrid-NYC-3×/week Swoon job, the kit's standard
   fields say `Location: San Francisco Bay Area, CA` / `Relocation: Remote preferred…`, and no
   piece of the kit (cover letter, email, screening answers) acknowledges NYC. Cause: the
   application-extras prompt injects only the static contact profile
   (`worker/src/application-extras.ts:102-104`); the job's location is never passed in. The
   2026-07-31 "confirm location" open item is **still open**.
3. **A Staff _Product Manager_ tops the SWE feed at a perfect 1.000.** `greenhouse_7517535`
   ("Staff Product Manager, ML Foundations and GenAI" @ stripe) scores
   `{title:1, keyword:1, level:1, remote:1}` on the Default profile. Two compounding causes in
   `worker/src/scoring.ts`: (a) `countKeywordMatches` uses substring `includes`, so keyword
   `"ai"` matches "GenAI" — and any word containing "ai" ("maintain", "available", …) — inflating
   every job's keyword/title factors; (b) `titleMatch` clamps at `matched / (n·0.3)`, so 2 of 6
   keywords = 1.0. And the classifier (correctly, per its own design) puts Product/Program
   Managers on the `ic` track with no discipline axis, so an SWE profile cannot exclude them.

## Checklist

### Auth & feed

| Check                                                                                                             | Result                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Friend-tier auth via dev-vault (`FRIEND_KEY`) against `/jobplatform/api/*`                                        | **PASS** — note: `npx @wolffm/dev-vault` itself 401s (GitHub Packages token), had to invoke via `node ../hadoku_site/scripts/secrets/dev-vault.mjs`; cosmetic but it's the documented invocation |
| `GET /jobs` unscored corpus                                                                                       | **PASS** — 7,845 jobs, paginated                                                                                                                                                                 |
| `GET /jobs?profile_id=…&sort=score&state=new` scored feed                                                         | **PASS** — 3,000-candidate score-on-read, sensible ranking, top of feed is senior/staff AI-infra roles                                                                                           |
| Track/level filtering sensible for the chosen job                                                                 | **PASS** — staff SRE: exact-rung `level_match=1.0`; hybrid jobs get `remote_match=0` under `remote_pref=remote`; profile `track=either` correctly applies no hard filter                         |
| Scoring anomalies                                                                                                 | **FAIL** — see problem 3 (PM at 1.000; substring keyword matching)                                                                                                                               |
| TPM-_titled_ job routing (fresh: `ashby_aecce97b…`, "Technical Program Manager, Enterprise" @ openai, 2026-08-14) | **PASS-ish** — classified `ic`/`null`, scores 0.408 so it stays far down the feed; but by design it can never be _excluded_ by track for an eng profile (no discipline axis)                     |

### Triage

| Check                                                     | Result                                        |
| --------------------------------------------------------- | --------------------------------------------- |
| `PUT /jobs/:id/state {"state":"interested"}` on both jobs | **PASS** — 200, persisted, visible on re-read |

### Prepare application

| Check                                                                     | Result                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /jobs/greenhouse_5230394008/resume` (body `{}`)                     | **FAIL** — 502 in 0.8s: `resume-api 500: 413 Request too large for openai/gpt-oss-120b … TPM Limit 8000, Requested 8336`                                                                   |
| Same with `{"tailor":false}`                                              | **FAIL** — identical `Requested 8336` ⇒ the 413 is pass 1 (selection), not the tailoring rewrite                                                                                           |
| Same on the shortest viable real job (`linkedin_4400762467`, 927-char JD) | **FAIL** — `Requested 8019` vs limit 8,000. Nineteen tokens over, on the most favorable job in the corpus                                                                                  |
| Root cause: Cerebras fallback deployed?                                   | **FAIL** — `wrangler secret list --name resume-api` → only `GROQ_API_KEY`, `RESUME_SYSTEM_PROMPT`                                                                                          |
| Workaround used to audit downstream                                       | Direct `POST /resume/api/tailored-resume` (friend key, resume-bot dev-vault) with the Swoon job and a hand-trimmed 559-char JD → 200 in 55.4s. **This is a bypass, not the product path.** |

### Tailored résumé audit (Swoon run, blocks: header, summary-platform, skills-languages, skills-infra, ms-serverless-telemetry, ms-api-backend, ms-azure-devops, ms-perf-caching, ms-etl-pipelines, ms-ops-dri, proj-anchor-hadoku, proj-scraper, proj-site, education-umass)

| Check                                                                                                   | Result                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tag routing picked the RIGHT blocks for an Azure/CI-CD/SQL/platform JD                                  | **PASS** — every experience pick is azure/api/etl/ops-tagged; `summary-platform` chosen over `summary-ai`/`summary-em`; projects are the `cat:data-automation` platform picks                                                                                  |
| Assembler headings `# Profile` / `# Experience` / `# Projects` / `# Technical Skills` exactly once each | **PASS**                                                                                                                                                                                                                                                       |
| hadoku.me anchor block first on the projects page, before any `###` category heading                    | **PASS**                                                                                                                                                                                                                                                       |
| `###` category headings only for populated categories                                                   | **PASS** — single `### Data & Automation`                                                                                                                                                                                                                      |
| Exactly ONE first-person summary                                                                        | **PASS**                                                                                                                                                                                                                                                       |
| No duplicated Microsoft header                                                                          | **PASS** — `ms-azure-devops` (variant:ms-anchor) selected once; `ms-headline` correctly excluded by the variant-group dedupe                                                                                                                                   |
| Page-break markers intact                                                                               | **PASS** — both `<!-- page-break -->` markers present (before Projects, before Skills)                                                                                                                                                                         |
| Tailoring rewrite factually faithful                                                                    | **PASS** — every number spot-checked against palette sources (80%, ~13K repos, ~25K builds, 25/44, ~100TB/day, 66%/41%/74%, 2.4s→0.8s, ~15M req/mo, 65→90%, 99.9%/99% SLOs) — no invention                                                                     |
| Selection breadth                                                                                       | **CONCERN** — projects page has only 2 blocks + anchor (palette has 8 tier-1 + 8 tier-2); skills has 2 of 7 groups; `# Additional Experience` (charles-river — layer:api, story:migration, java) dropped despite being backend-relevant. Pages 2–3 render thin |

### Application kit (real path: `POST /jobs/linkedin_4400762467/application-extras`, 200 in 4.3s)

| Check                             | Result                                                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cover letter                      | **PASS w/ nit** — coherent, Swoon-specific, no placeholders, no wrong-company text. Nit: salutation is emitted as an H1 (`# Dear Hiring Team at Swoon,`) so it renders as a huge heading |
| Intro email                       | **PASS** — coherent, correct company/role                                                                                                                                                |
| Why-hook                          | **PASS**                                                                                                                                                                                 |
| Screening answers                 | **PASS** — 6 `{q,a}` pairs, job-relevant, work-auth answer consistent with standard fields                                                                                               |
| Salary answer                     | **PASS** — "$350k+ total compensation", matches the owner's floor                                                                                                                        |
| LinkedIn note                     | **PASS** — 179 chars, fits connection-request limit                                                                                                                                      |
| Talking points                    | **PASS** — 5 points, all traceable to résumé content                                                                                                                                     |
| Standard fields / contact         | **PASS** — `matthaeus@hadoku.me`, phone, links all current                                                                                                                               |
| Location correctness for THIS job | **FAIL** — see problem 2                                                                                                                                                                 |

### Packet link & records

| Check                                                   | Result                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `POST /jobs/:id/packet-link`                            | **PASS** — 200 in 0.43s → `{"slug":"wxcqs04shN39","url":"https://hadoku.me/resume?v=wxcqs04shN39"}`                            |
| Anonymous page fetch (NO auth header)                   | **PASS** — 301 (nginx adds trailing slash, query preserved) → 200, 89KB, title "Matthaeus Wolff — Resume"                      |
| Anonymous API fetch `/resume/api/resume?v=wxcqs04shN39` | **PASS** — correct label "Swoon — Senior Platform Engineer", content byte-identical to generated résumé, cover letter attached |
| Anonymous PDF `/resume/api/resume.pdf?v=wxcqs04shN39`   | **PASS** — 200, `application/pdf`, 31,613 bytes, valid PDF 1.7                                                                 |
| Bare `/resume/api/resume` still canonical after mint    | **PASS** — no variant key, no Swoon text, all 6 canonical headings (regression check on 5236138)                               |
| `PUT state applied + variant_slug` recorded             | **PASS** — D1 row `{state:applied, variant_slug:wxcqs04shN39}`                                                                 |
| Slug survives later state change (COALESCE)             | **PASS** — after `PUT {"state":"saved"}` the row keeps `variant_slug=wxcqs04shN39`                                             |

## Daily-driver ergonomics — honest verdict

**Today it is not a daily driver: the one button that matters does not work on any real job.**
The UI's `handlePrepare` calls the same `POST /jobs/:id/resume` that 413s, so the owner sees
"Failed to generate résumé" with no retry, no queue, and no hint that the failure is
deterministic. Everything around the broken core is genuinely good:

- Feed → drawer → triage is fast (all sub-second) and state writes are optimistic + persistent.
- When generation _can_ run: résumé ~55s (includes a Groq TPM retry-wait inside the worker),
  extras 4.3s, link mint 0.4s. The two-wave sequencing (résumé, then extras-with-cover-letter)
  matches the UI and avoids the old stacked-call 500.
- Manual step count once fixed: 4 clicks (open job → Prepare → Create link → Applied), which is
  the right shape. Screening answers and standard fields as copy-paste blocks are exactly what
  filling an ATS form needs.
- Rough edges: back-to-back preps inside one minute will still fight the 8k TPM budget
  (Groq-only); the 55s résumé wait has no progress indication beyond a spinner; the cover-letter
  H1 salutation looks wrong in the viewer and in the PDF packet.

### Fix directions for problem 1 (any one unblocks the flow)

- Deploy `CEREBRAS_API_KEY` to resume-api (constants.ts already chains it) — fixes extras and
  small-palette calls, but selection at ~8.3k tokens still exceeds Cerebras's free 8,192 context;
  so ALSO needed:
- Shrink pass 1: drop snippet to ~80 chars or send id+tags+title only (~2k token saving), and/or
  cut `SELECTION` max_tokens from 2,048 (the answer is a ~150-token JSON array).

## Records written by this run (deliberate, normal-flow)

- `job_states`: `greenhouse_5230394008` → `interested`; `linkedin_4400762467` → `saved` with
  `variant_slug=wxcqs04shN39` (was briefly `applied` to verify slug recording).
- CONTENT_KV: variant `wxcqs04shN39` (label "Swoon — Senior Platform Engineer", 365d TTL),
  plus resume-api's normal 24h generation caches.
