# Applicant flow E2E — run #2, live-system re-validation, 2026-08-17

Follow-up to [applicant-e2e.md](./applicant-e2e.md) (run #1, same day, earlier). Run against
production (`hadoku.me`), friend-tier key via the jobplatform dev-vault script. Read-only except
the normal records the prep flow writes. Corpus at run time: **28,904 jobs** (run #1: 7,845 —
the ~205 newly-discovered boards landed overnight).

- **Primary job (full packet, real product path end-to-end):** `greenhouse_3851927` —
  **Senior Software Engineer, Distributed Systems @ Datadog** (newly-discovered board, scraped
  2026-08-17T21:56Z), hybrid, Boston/NYC, **8,304-char JD**. Ended state `saved` with
  `variant_slug=HSVzltjBaWKl`.
- **Stress job (found the new ceiling):** `greenhouse_7107437` — Staff Software Engineer,
  ML Observability @ Datadog, hybrid Boston/NYC, **11,757-char JD**. Tailored prep 413s (see
  problem 1); `tailor:false` succeeds. Left at `interested`.
- Versions: resume-bot package 3.4.3 (selection ladder + location threading present in source);
  resume-api last deployed 2026-08-17T06:24Z; palette still 57 blocks. Live feed behavior
  (discipline_factor in every breakdown, ranked pool = 800) confirms the new scorer is deployed.

## Worst three problems

1. **Long-JD tailoring still 413s — the budget ladder only guards pass 1.** The pass-2 tailoring
   prompt (`worker/src/tailored-resume.ts:179-190`) injects the **full, untruncated JD** plus the
   assembled résumé plus `TAILORING: 4096` max_tokens. On the 11,757-char ML Observability JD
   that is ~8.7k tokens against Groq's 8k free-tier TPM cap → deterministic 413
   (`Requested 8677, Limit 8000`, 502 in 4.2s) — arithmetic matches pass 2 exactly (est. ~8.5k),
   and `tailor:false` on the same job succeeds in 4.9s, proving pass 1 now fits. Feasibility
   ceiling is roughly a **9–10k-char JD**; the 8.3k-char job cleared it (74.5s), the 11.8k one
   cannot, ever. Contributing: **`CEREBRAS_API_KEY` is STILL not deployed** (`wrangler secret
list` → only EDGE_AUTH_SECRET, GROQ_API_KEY, RESUME_SYSTEM_PROMPT), unchanged since run #1 —
   though free-tier Cerebras (8,192 context) couldn't absorb an 8.7k-token request either. Fix
   shape: extend the shrink-to-fit ladder to pass 2 (truncate the JD slice there too).
2. **A tailored variant can render with NO employer header.** The selector picked 5 `ms-*`
   experience blocks for the Datadog Distributed Systems job but neither `variant:ms-anchor`
   block (`ms-headline` / `ms-azure-devops`), and nothing forces one in — the `always` tag list
   is header/education/skills-languages/proj-anchor only. Shipped result (this run's real
   packet): 15 Microsoft bullets under `# Experience` with **no "Microsoft", no title, no
   dates** anywhere. A recruiter sees an anonymous wall of bullets. The variant-group dedupe
   prevents two anchors but nothing guarantees one. Fix shape: treat `variant:ms-anchor` as
   pick-one-required in selection post-processing (same mechanism as `always`).
3. **The daily-driver profile cannot see the new corpus at all.** The e2e/Default profile's feed
   is hard-scoped by `profile_companies` to the 9 legacy boards, so its entire 800-job ranked
   pool is anthropic/databricks/openai/stripe/scaleai/mistral/plaid — **zero** of the ~21k new
   jobs, including every Datadog/CoreWeave/Snowflake role that would rank ~0.85+. The 205 new
   boards hang off the `discovery-auto` probation profile, whose empty keywords make its scored
   feed degenerate (every job flat 0.575; its 800-pool is arbitrary — 516 veeva rows). And the
   API has no company/title search param to reach them manually (`?search=datadog` is silently
   ignored — zod strips unknown keys and returns the full corpus 200). Until boards get promoted
   into a real profile, the corpus growth is invisible where it matters. I had to find the
   Datadog jobs via the public Greenhouse board + `GET /jobs/:id`.

## Regression table — run #1 findings

| Run-#1 finding                                                              | Verdict                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1 Prepare-application 100% down (pass-1 selection 413 on every job)        | **HELD-FIXED** — selection self-sizes: `tailor:false` 200 in 4.9s on an 11.8k JD; full tailored prep 200 in 74.5s on an 8.3k JD (run #1: impossible on ANY real job, even hand-trimmed). New gap: pass 2 has no ladder (problem 1)                                                                                                                                                                                  |
| #1-sub: Cerebras fallback not deployed                                      | **NOT FIXED** — secret list unchanged, chain is still Groq-only                                                                                                                                                                                                                                                                                                                                                     |
| #2 Location absent from the kit                                             | **HELD-FIXED** — cover letter ("open to relocating to Boston or New York for the hybrid schedule"), intro email, why-hook, and screening answers all speak to THIS job's hybrid Boston/NYC posting; no stray "remote" claims. `standard_fields` still carries the owner's static SF-Bay-Area location + "Remote preferred; open to relocation" — those are facts about the candidate, consistent with the narrative |
| #3 Staff PM tops the feed at 1.000 (substring keywords, no discipline axis) | **HELD-FIXED** — `greenhouse_7517535` is no longer in the 800-pool at all; `discipline_factor` present in every breakdown; zero PM/TPM/designer titles in the top 800 (nearest miss: pre-sales _engineering_ at rank 263, 0.65); top-10 is all senior/staff/principal engineering                                                                                                                                   |
| Minor: cover-letter salutation rendered as H1                               | **HELD-FIXED** — no H1; note the salutation line is now dropped entirely (letter opens directly with paragraph 1), which reads fine but is a style choice to be aware of                                                                                                                                                                                                                                            |
| Minor: thin projects/skills pages                                           | **NOT FIXED** — this run's variant: projects = anchor + 2 blocks (palette has 8 tier-1 + 8 tier-2), skills = 2 of 7 groups (Languages + Deployment & Infra; no Backend/API group despite a distributed-systems JD). Pages 2–3 still render thin                                                                                                                                                                     |
| Feed `total` semantics                                                      | **n/a (expected)** — `total: 800` is the ranked pool, per design; corpus total (28,904) still visible via the profile-less listing                                                                                                                                                                                                                                                                                  |

## Checklist

### Auth & feed

| Check                                                              | Result                                                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Friend-tier auth via dev-vault script against `/jobplatform/api/*` | **PASS** (script path invocation, per instructions)                                                                                                                                                                            |
| Scored feed for e2e profile, `sort=score`                          | **PASS** — 200; `discipline_factor` on every row; top-10 = databricks/mistral/anthropic/openai senior-staff-principal AI-infra engineering; level/remote factors sane (hybrid ⇒ `remote_match: 0` under `remote_pref: remote`) |
| No PM/TPM/design near the top                                      | **PASS** — none in the entire 800-pool                                                                                                                                                                                         |
| Corpus growth reflected                                            | **PASS with caveat** — corpus 28,904; but none of it reachable from the e2e profile's feed (problem 3)                                                                                                                         |
| Feed latency                                                       | **PASS** — 1.32s cold, 0.46–0.92s warm per 100-row page (probation profile: 2.0s cold). No sign of the 29k-row light pass hurting interactive latency                                                                          |

### Triage

| Check                                                     | Result                             |
| --------------------------------------------------------- | ---------------------------------- |
| `PUT /jobs/:id/state {"state":"interested"}` on both jobs | **PASS** — 200 in ~0.2s, persisted |

### Prepare application (real product path, `POST /jobs/:id/...`)

| Check                                                                    | Result                                                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Tailored résumé, 8,304-char JD (`greenhouse_3851927`)                    | **PASS** — 200 in **74.5s** (includes in-worker Groq TPM retry-wait between passes)                     |
| Tailored résumé, 11,757-char JD (`greenhouse_7107437`)                   | **FAIL** — 502 in 4.2s, `resume-api 500: 413 … Requested 8677, Limit 8000` (problem 1)                  |
| Same job, `{"tailor":false}`                                             | **PASS** — 200 in **4.9s** ⇒ the 413 is pass 2, selection ladder holds                                  |
| `POST application-extras` (with `resume_markdown` body, as the UI sends) | **PASS** — 200 in **5.4s**; bare `{}` body correctly 400s with "resume_markdown is required"            |
| `POST packet-link`                                                       | **PASS** — 200 in **0.74s** → `{"slug":"HSVzltjBaWKl","url":"https://hadoku.me/resume?v=HSVzltjBaWKl"}` |

### Tailored résumé audit (blocks: header, summary-platform, skills-languages, skills-infra, ms-perf-caching, ms-serverless-telemetry, ms-api-backend, ms-ops-dri, ms-etl-pipelines, proj-scraper, proj-watchparty, proj-anchor-hadoku, education-umass)

| Check                                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Right blocks for a distributed-systems JD                 | **PASS** — perf/caching, telemetry pipeline, ops/reliability, ETL; `summary-platform` over summary-ai/em; `proj-watchparty` (server-authoritative clock, drift correction) is exactly the realtime-distributed pick. Cross-check: the ML Observability job's selection instead chose summary-ai + ai-observability/ai-ml-eval/skills-ml-ai/skills-monitoring — tag routing clearly discriminates per-JD |
| Each `#` heading exactly once                             | **PASS** — Profile / Experience / Projects / Technical Skills / Education, once each                                                                                                                                                                                                                                                                                                                    |
| hadoku.me anchor first on projects page, before any `###` | **PASS**                                                                                                                                                                                                                                                                                                                                                                                                |
| `###` categories only for populated categories            | **PASS** — Data & Automation, Apps Games & Tools                                                                                                                                                                                                                                                                                                                                                        |
| Exactly ONE first-person summary                          | **PASS**                                                                                                                                                                                                                                                                                                                                                                                                |
| No duplicated Microsoft header                            | **FAIL (inverted)** — zero Microsoft headers: no `variant:ms-anchor` block selected and none forced (problem 2)                                                                                                                                                                                                                                                                                         |
| Page-break markers                                        | **PASS** — both markers, correct positions (before Projects, before Skills)                                                                                                                                                                                                                                                                                                                             |
| Tailoring rewrite factually faithful                      | **PASS** — spot-checked every number against palette blocks (66%/2.4s→0.8s/41%/74%, ~15M req/mo, 2,400 MAU, 380 branches/17 signals/~2.2M events, 65→90%, 99.9%/99% SLOs, ~67k LOC, 71→99.9% is palette-sourced in summary-platform) — no invention                                                                                                                                                     |
| Selection breadth                                         | **CONCERN (persists)** — see regression table                                                                                                                                                                                                                                                                                                                                                           |

### Application kit audit

| Check                    | Result                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cover letter             | **PASS** — 3 paragraphs, Datadog/observability-specific, zero placeholders, no H1 salutation                                                                                                                                   |
| Intro email              | **PASS** — correct company/role, location-aware                                                                                                                                                                                |
| Why-hook                 | **PASS**                                                                                                                                                                                                                       |
| Screening answers        | **PASS w/ nit** — 6 job-relevant `{q,a}` pairs; work-auth consistent. Nit: one answer says "improving availability by 74%" where the palette says _failure rate_ down 74% — a metric mislabel, the kind a screener could probe |
| Salary line              | **PASS** — "Target total compensation: $350,000+", matches the owner's floor                                                                                                                                                   |
| LinkedIn note            | **PASS** — 205 chars ≤ 300                                                                                                                                                                                                     |
| Talking points           | **PASS w/ nit** — 4 points, on-target; "integrated AI coding assistants into daily workflows" is JD-prompted (Datadog asks about AI tooling) but not traceable to any palette block                                            |
| **LOCATION consistency** | **PASS** — every location statement matches hybrid Boston/NYC: cover letter and email offer Boston-or-NYC relocation for the hybrid schedule; screening answers reference the hybrid setting; nothing claims the job is remote |

### Packet link & records

| Check                                                 | Result                                                                                                                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anonymous page fetch (NO auth header)                 | **PASS** — 200, 89KB, in 0.25s                                                                                                                                                                                                              |
| Anonymous API `/resume/api/resume?v=HSVzltjBaWKl`     | **PASS** — label "datadog — Senior Software Engineer - Distributed Systems"; `content` byte-identical to the generated résumé; cover letter attached (differs from extras only by typography normalization: U+2011 → ASCII hyphen)          |
| Anonymous PDF `/resume/api/resume.pdf?v=HSVzltjBaWKl` | **PASS** — 200, `application/pdf`, 28,398 bytes, valid PDF 1.7                                                                                                                                                                              |
| Bare `/resume/api/resume` still canonical after mint  | **PASS** — byte-identical to the pre-run snapshot, all 6 canonical headings, no Datadog text (regression check on 5236138 holds)                                                                                                            |
| `applied` + `variant_slug` persisted in D1            | **PASS** — `job_states` row `{state: applied, variant_slug: HSVzltjBaWKl}` (verified via wrangler d1, OAuth session — note: the vault `CLOUDFLARE_API_TOKEN` lacks D1 scope and, when exported, _overrides_ the working OAuth login → 7403) |
| Slug survives state change (COALESCE)                 | **PASS** — after `PUT {"state":"saved"}` the row keeps `variant_slug=HSVzltjBaWKl`                                                                                                                                                          |
| `variant_slug` readable back through the API          | **GAP (new, minor)** — no read endpoint surfaces it: job detail selects only `state, updated_at`, feed rows omit it. Written but write-only; auditing "what did I send them?" requires D1                                                   |

## Timing notes

| Step                               | Time                                                              |
| ---------------------------------- | ----------------------------------------------------------------- |
| Scored feed (100 rows)             | 1.32s cold; 0.46–0.92s warm; 2.0s probation-profile cold          |
| Triage state PUT                   | ~0.2s                                                             |
| Tailored résumé (8.3k JD)          | **74.5s** (TPM retry-wait dominates; run #1's bypass run was 55s) |
| Untailored résumé (`tailor:false`) | 4.9s                                                              |
| Application extras                 | 5.4s                                                              |
| Packet-link mint                   | 0.74s                                                             |
| Anonymous page / API / PDF         | 0.25s / 0.22s / 0.22s                                             |

## New findings this run (beyond the worst-three)

- **Probation-profile scoring is degenerate**: empty keywords ⇒ every job scores flat 0.575, so
  the discovery feed's 800-pool is an arbitrary slice (516 veeva rows). Fine as a scrape
  directive, useless as a review queue.
- **Unknown query params are silently stripped** (`?search=…` returns the full corpus with 200
  rather than erroring), and there is no company/title filter at all — combined with problem 3
  this means no API path from "I heard Datadog is hiring" to a job id except the public ATS board.
- **`variant_slug` is write-only** (table above).
- 74.5s for the résumé remains a long single spinner in the UI — unchanged ergonomics note from
  run #1; worth revisiting once Cerebras (30k TPM) actually lands, which should collapse both the
  74.5s wait and problem 1's ceiling.

## Records written by this run (deliberate, normal-flow)

- `job_states`: `greenhouse_7107437` → `interested`; `greenhouse_3851927` → `saved` with
  `variant_slug=HSVzltjBaWKl` (briefly `applied` to verify slug recording; nothing was actually
  submitted to Datadog).
- CONTENT_KV: variant `HSVzltjBaWKl` (label "datadog — Senior Software Engineer - Distributed
  Systems") plus resume-api's normal 24h generation caches.
