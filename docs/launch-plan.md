# Application launch plan

Goal: start blasting applications. Decided 2026-08-12: **tasks 1–5 all gate launch**;
flashcards (6) and contracting (7) come after.

The pattern for every task: an agent does the legwork and produces a review doc in
`docs/review/`; you do a bounded redline pass (30–60 min), then we apply the result.
You never start from a blank page.

## Gate tasks

### 1. Block quality + tag audit — ✅ REDLINED, APPLIED & LIVE 2026-08-13

Owner redlined all 12 rewrites + approved all 14 tag changes in-session; applied to
blocks.json (backup: blocks.json.bak-2026-08-13), ingested, live-verified (12/12
structural checks). Rules adopted: **all summary blocks first-person**; section
headings emitted by the assembler (resume-bot 3.4.0), variant-group guards, cat:\*
project categories. STILL OWED (3 facts, provisional gap-cut versions live): fill them in
**`docs/review/owed-facts.md`** whenever, then tell any session "apply owed-facts".

- Result: 44 KEEP / 12 REWRITE (all 3 summaries, all 6 ai-\* blocks, 3 MS level
  blocks); 14 mechanical tag changes; 8 `[NEEDS FACT]` gaps. Worst: ai-intro has a
  baked-in robotics/perception pitch. Structural bugs verified against worker code:
  the `always` tag was never enforced — FIXED and shipped as resume-bot 3.3.2
  (2026-08-12). Priority inversion (ai-intro 8 < ai-ml-eval 9), duplicate
  `# Experience` header (ms-headline vs ms-azure-devops), and headings-inside-blocks
  remain content-side fixes for the redline batch.
- Agent is comparing all 56 blocks in `hadoku_site/scripts/resume/blocks.json` against
  the Resume 13 voice (concrete numbers, named systems, tight verbs) and auditing every
  tag against the actual selection code in `worker/src/`.
- Output: `docs/review/block-audit.md` — KEEP/REWRITE verdict per block, side-by-side
  rewrites (no invented facts; gaps marked `[NEEDS FACT]`), and a mechanical tag-change list.
- **Your part:** redline the rewrites (accept/edit/reject), fill any `[NEEDS FACT]` gaps,
  approve the tag changes. Then we edit blocks.json and re-ingest (`resume_ingest.py --blocks`).

### 2. hadoku.me anchor block + project taxonomy — ✅ ADOPTED & LIVE 2026-08-13

Anchor block (proj-anchor-hadoku, always+canonical, prio 100) + 3 categories live;
proj-site retired to palette-only tier-2 deep-dive (GitHub link dropped); /jobs and
/tube Live links fixed in blocks.

- Result: 3 domain categories proposed (AI & Agents / Data & Automation / Apps,
  Games & Tools); anchor blurb drafted with verified numbers (13 apps, 13 repos,
  3,814 commits); open decision: retire or dedup proj-site; unresolved list includes
  proj-promptsmith having no links at all.
- Agent is inventorying repos + live apps, proposing 3–5 recruiter-legible categories
  (respecting your existing tier:1/2/3 ranking), a page-2 ordering, and a draft 2–3
  sentence hadoku.me anchor blurb linking https://hadoku.me/.
- Output: `docs/review/project-taxonomy.md`, including an "unresolved" list (orphan
  repos, dead projects, apps with no block).
- **Your part:** pick/adjust the categories, approve the blurb. Then we add the block
  - category presentation and re-ingest.

### 3. Public access audit — DONE (with correction) → your decisions

- Output: `docs/review/public-access-sweep.md`. **Read the correction block at the
  top first**: the sweep's browser findings were made through an authenticated
  session (persistent Playwright profile carried the owner's cookie), so the scary
  "jobplatform leaks your job hunt" finding is FALSE — verified server-side, all
  personal data is properly gated. What actually stands:
  - 9 of 17 resume GitHub links → private repos → 404 (incl. 7 of 8 tier-1 projects)
  - 5 resume-advertised apps (tenhands, dataplatform, conjure, pygmalion,
    promptsmith) are bare 401s to recruiters — no demo, no gate card, no key story
  - 3 broken resume "Live" links (/jobs, /tube, scraper root)
  - the proposed standard gate card + `contact?about=<app>` key-request pattern (§3)
- **Your part:** per app decide: make public / demo mode / gate card; and per private
  repo decide: make public / sanitized mirror / drop the GitHub link.

#### 3a. Repo fan-out — ISSUES FILED 2026-08-13 (15 issues)

Policy decided: every repo goes public by default after a thorough readiness cleanup
(full-history secret scan, personal-data scan, ecosystem-security review, lint-clean,
vibeCompact audit, structural + IP/legal pass, stranger-grade README). Agents may push
back ONLY on legal exposure or concrete ecosystem-security risk. Exceptions: hadoku_site
and brave-quartet stay private. Card captures are HARD-BLOCKED until the repo clears.
Demo assets: silent webm (15–30s) + timestamped voiceover script; owner records audio
and muxes to one file.

**DIRECTION CHANGE 2026-08-17: most repos STAY PRIVATE — no big refactors to
publicize.** Going/now public: jobplatform (already flipped by an agent session),
tenhands (#89 continues), meet (#1 continues). The rest paused on publicize; the six
undecided (conjure/pygmalion/watchparty/dataplatform/promptsmith/scraper) may opt in
later — re-adding a GitHub link to a block is a one-line edit + re-ingest.
Consequences applied same day: GitHub links DROPPED from blocks for
watchparty/pygmalion/dataplatform/conjure/scraper/brave-quartet (blocks + Live links
kept; backup blocks.json.bak-2026-08-17; live-verified — canonical resume now links
only tenhands + hadoku-task on GitHub). Card assets DECOUPLED from visibility:
conjure#9, pygmalion#13, watchparty#135, dataplatform#6, promptsmith#3 rescoped to
assets+audit only; scraper#45 rescoped to landing page only; jobplatform#5 = assets
remain (Phase 1 done).
CLOSED — games-host#1: owner decision 2026-08-13, repo stays private (loopback
docker-control tunnel; registry names private game deployments incl. brave-quartet);
/games card assets get produced from hadoku_site without opening the repo.
Assets only (already public): resume-bot#32, contact-ui#23, aggregator#19, task#82
(seed a demo board first).
Special: scraper#45 (publicize w/ legal scrutiny — likeliest pushback candidate — plus
landing page for scraper.hadoku.me root), brave-quartet#1 (stays private: drop resume
GitHub link, optional gameplay showcase).
Still handled in the block redline, not an issue: proj-site's GitHub link (hadoku_site
stays private → link becomes https://hadoku.me/), /jobs + /tube Live-link fixes.

### 4. Applicant e2e validation — RUN 2026-08-17, BLOCKER FOUND & FIXED

Report: `docs/review/applicant-e2e.md` (24 PASS / 6 FAIL at time of run).
**Worst finding — FIXED same day:** "Prepare application" was deterministically
down for every real job: the 57-block selection prompt (~8.3k tokens) exceeded
Groq's 8k request cap AND Cerebras's free 8k context. Fix shipped in resume-bot
3.4.1+3.4.2 (deployed, live-verified on the exact failing job — Anthropic Staff+
SRE, 10k-char JD → full packet in ~70s): selection prompt now self-sizes via a
(snippet, JD) ladder under SELECTION_BUDGET, and selection max_tokens is 2048
because gpt-oss-120b spends output tokens on reasoning (1024 → empty content).
**Still open from the report:**

- [x] location handling — FIXED 2026-08-17 (resume-bot 3.4.3 + jobplatform-worker
      2.1.7): job location/workplace_type now flow into the extras prompt with a
      hard consistency rule; live-verified on the hybrid-NYC Swoon job (kit now
      acknowledges NYC + relocation stance).
- [x] scoring — FIXED 2026-08-17 (jobplatform-worker 2.1.7): whole-word keyword
      matching + discipline axis (classifyDiscipline, adjacent ladders ×0.15).
      Live-verified: the Staff PM dropped 1.000 → 0.13; top-8 feed is all
      staff/principal eng roles. 44/44 worker unit tests.
- [ ] CEREBRAS_API_KEY never deployed to resume-api (chain works Groq-only;
      deploying it adds burst headroom for full packets)
- [ ] minor: thin projects/skills pages on tailored variants; H1-salutation in
      cover letter
      What works: feed/scoring/triage sub-second; tag routing excellent; packet link
      works anonymously; applied-state slug survives state changes.

Run one fresh, real job end-to-end through jobplatform and score the packet:

- [ ] job ingested and scored correctly (track/level filters behave)
- [ ] "Prepare application" produces résumé + cover letter + link + extras
      (intro email, screening answers, salary, LinkedIn note, talking points)
- [ ] tailored résumé picked the RIGHT projects for the job (this is what task 1's
      tag audit protects)
- [ ] location handling correct; TPM-style roles route correctly (open item from
      2026-07-31 verification)
- [ ] records slug saved; daily-driver ergonomics feel sustainable
      Handoff prompt exists below; run it only after the new blocks are ingested, otherwise
      we validate stale content.

### 5. Recruiter e2e validation — RUN 2026-08-17: 14/17 PASS

Report: `docs/review/recruiter-e2e.md` (verified-anonymous). PDF valid 3-page +
contact correct; chat grounded; tenhands now PUBLIC as hadoku-tenhands (block
link updated + re-ingested same day). Remaining:

- [ ] scraper.hadoku.me raw 404 — the one dead-reading resume link (scraper#45)
- [ ] OWNER: GitHub profile polish — pin hadoku-tenhands/task/resume-bot (stale
      TTRPG/seaborn pins now), add a profile README, replace bio ("i LOVE
      burning tokens" is a recruiter's first impression)
- [ ] OWNER: LinkedIn freshness pass
- known: gated apps' bare 401s (gate-card work, fan-out issues)

### 8a. Discovery first cycle — EXECUTED BY HAND 2026-08-17 (late)

Full 888-company resolution sweep DONE: 222 resolved (125 greenhouse / 74 ashby /
23 lever), 24,668 board postings reachable. Dataset committed:
hadoku-scraper `docs/discovery/2026-08-17-company-resolution.json` (data/ is
gitignored there). **205 boards subscribed** to a dedicated prunable profile
`discovery-auto (probation boards 2026-08-17)` (id 6823d011-…, e2e identity) —
directives now list 214 companies (was 9); scrape trigger fired once. Prep that
gated it: jobplatform-worker **2.1.9 batched ingest** (INSERT OR IGNORE via
db.batch, 100-stmt chunks — old path was 2 D1 subrequests/job and would have
blown the 1,000-subrequest cap) deployed FIRST via a manual hadoku_site bump
(update-packages runs kept getting cancelled by the evening publish storm).
LinkedIn untouched throughout (hard constraint on #46 + memory).
OUTCOME (verified ~2h after trigger): corpus 7,845 → **28,904** (+21,092 ingested
in 2h, zero ingest failures); ~206/214 boards reported. Criteria cuts: senior+
eng 1,901 → 6,660 (402 cos); AI-titled 552 → 1,436; remote senior eng 323 → 1,407.
SCORE CAP — ✅ FIXED 2026-08-17 (jobplatform-worker 2.1.11, deployed+verified):
two-stage score-on-read. Light pass ranks the WHOLE corpus without descriptions
via scoreJobUpperBound (keyword factor optimistic, everything else real;
LIGHT_CANDIDATE_CAP=50k safety valve), then top-800 get descriptions fetched
(chunked db.batch) and fully scored — provably no top-rank casualties. 127/127
worker tests. Live-verified: feed top-12 now ALL pre-burst postings that the
old newest-3k window had made invisible. Feed `total` now reports the ranked
pool (800), not corpus size. RUN HEALTH (same night): zero throttling — 205
boards at full depth, 21k jobs in ~12min, no partial boards; the "17 missing"
were slug aliases (datadog→datadoghq, waymo→withwaymo, pinterest→
pinterestcareers) — canonical slugs all present. Local gotcha: the
machine's ~/.npmrc GitHub-Packages token is DEAD (401) — `gh auth token` works
as a substitute for registry reads.

### 8. Company discovery loop — DESIGNED + ISSUE FILED 2026-08-17 (scraper#46)

Owner's constraint: NO hardcoded target list — whitelist a few exciting corps,
discover the rest by criteria. Feasibility measured: 277 companies already
discovered via shallow feeds with senior+ postings; naive slug probing against
public greenhouse/lever/ashby board APIs resolved 30/60 (50%) exposing 10,871
postings (whole current corpus: 7,845 from 9 boards). Design in
hadoku-scraper#46: shallow feeds discover → resolve board (slug variants +
posting-URL sniff) → probation subscribe → auto-prune non-scoring boards →
pinned/blocked tiers for the owner. Includes the company-name normalization fix
("anthropic" vs "Anthropic" are separate rows today). Corpus numbers baseline
for before/after: 7,845 jobs / 9 deep boards / 1,901 senior+ eng / 552 AI-titled.

### 9. Applicant e2e RUN #2 — 2026-08-18, all prior fixes HELD, 3 new findings ALL FIXED same session

Report: `docs/review/applicant-e2e-2.md`. Datadog Senior SWE Distributed Systems
packet shipped end-to-end (slug HSVzltjBaWKl); 413/location/PM-scoring/salutation
all HELD-FIXED; feed latency fine at 29k (~0.5–1.3s). New findings, fixed:

- [x] pass-2 tailoring 413 on JDs ≳10k — FIXED resume-bot 3.4.17 (JD slice sized
      to remaining token budget; pass-2 failure now falls back to deterministic
      assembly, never 500s). Verified fresh on CoreWeave 11.6k-char JD (61s).
- [x] variant shipped with no employer header — FIXED: new `ms-employer-header`
      block (always+canonical, prio 99), header lines stripped from
      ms-headline/ms-azure-devops; verified in fresh variant (header exactly once).
- [x] company-scoped feeds blinded the daily driver to the new corpus — FIXED:
      all profile_companies rows consolidated onto the discovery profile
      (directives unchanged at 214; local backup
      scratchpad/profile_companies-backup-2026-08-18.json); user profiles now
      whole-corpus. Verified: e2e feed top-10 all newly-discovered companies
      (Lyra Health, Spotify, Aledade AI roles).
      Still open (minor): CEREBRAS_API_KEY undeployed; thin projects/skills pages on
      tailored variants; tailored-resume cache key ignores the `tailor` flag (a
      tailor:false result can serve a later tailor:true request for 24h).

## Post-launch (do not block applications)

### 6. Interview flashcards — AGENT RUNNING (phase 1) → prune → generate

- Phase 1 DONE: ~78 terms verified against the repos in
  `docs/review/flashcard-terms.md`. 11 hard NOT-FOUND (Whisper, LangChain, Weaviate,
  K-means — promptsmith actually uses DBSCAN — Seaborn, Geneva, Scope, …) and ~14
  work-only terms with zero personal-repo evidence (Redis is the risky one: headline
  latency numbers, no code). skills-collab is 4/5 dead weight; meanwhile the
  best-evidenced tech (Cloudflare Workers/KV/D1, FastAPI, Temporal, Rust/Bevy,
  Playwright, MCP, Hono) is mostly missing from the skills blocks — natural swap-ins.
- Phase 2 (after your prune): generate actual flashcards from the surviving terms,
  grounded in YOUR usage of each tech, not generic definitions.

### 7. Contracting profiles — PARKED

Deliberately nothing until applications are flowing. When ready: research agent scopes
platforms (contract EM/staff work, Upwork/Toptal/Gun.io tier), what a profile needs,
and how the resume-block system maps onto contractor positioning.

## Handoff prompts (fire when their turn comes)

### Task 4 — applicant e2e (run after blocks re-ingested)

> Validate the jobplatform applicant flow end-to-end as a daily driver. Pick one fresh
> real job listing (not one used in past tests). Ingest it, check scoring/track/level
> filtering, run "Prepare application", and audit the full packet: tailored résumé
> (did tag routing pick the right projects for THIS job? compare against
> hadoku_site/scripts/resume/blocks.json tiers/tags), cover letter, intro email,
> screening answers, salary answer, LinkedIn note, talking points, records slug.
> Specifically verify location handling and TPM/adjacent-role routing (known open
> items from the 2026-07-31 verification). Output a pass/fail checklist with
> repro details for every failure to docs/review/applicant-e2e.md. Read-only except
> that file; no git operations.

### Task 5 — recruiter e2e (run after 1–4 land)

> Act as a recruiter who just received an application. Open the tailored resume link
> cold in a VERIFIED-anonymous context — the persistent Playwright MCP profile carries
> the owner's hadoku_session cookie, so first confirm https://hadoku.me/session/whoami
> returns {"valid":false,"userType":"public"} from whatever client you use (or stick
> to curl/WebFetch). Download
> the PDF endpoint, verify 3-page layout/page breaks/contact info
> (matthaeus@hadoku.me), click every link on the resume (hadoku.me, project links,
> LinkedIn, GitHub) and confirm none 404 or look abandoned. Note anything that would
> give a recruiter pause in the first 60 seconds. Output findings to
> docs/review/recruiter-e2e.md. Read-only except that file; no git operations.

### Task 6 phase 2 — flashcard generation (after you prune flashcard-terms.md)

> Read docs/review/flashcard-terms.md (owner has pruned it). For each surviving term,
> write flashcards grounded in the owner's actual usage: front = interview-style
> question ("You list Kusto — what did you build with it?"), back = the real answer
> from their repos/resume blocks, plus one "what it is" fundamentals card for
> HIGH-probe terms. Output docs/review/flashcards.md grouped by skills category.
