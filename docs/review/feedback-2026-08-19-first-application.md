# First real application — owner feedback (2026-08-19)

Owner drives the full flow manually; raw napkin scratches land here as they come,
verbatim-ish, timestamped. Triage into fixes happens after the run, not during.

## Scratches

**#1–5 (batch, feed scoring) — "scoring on jobplatform is quite atrocious":**

1. Low pay scores 1.00 — delinea Staff SWE AI @ $150–180k tops the feed; pay is
   way too low (owner floor ~$350k).
2. Non-US remote scores 1.00 — affirm "Remote Spain" / "Remote Poland". Owner:
   very little chance of non-US remote for now; full-remote prioritized but must
   work continental-US hours.
3. Stack mismatch scores high — "Senior SWE — Business Platform (Ruby/Rails)";
   zero Ruby/Rails experience. Not excludable, but other listings must outrank it.
4. Domain matters — ads platforms, prediction markets, "boring business stuff"
   should rank below creative generative AI, video game dev, AI model tuning.
   Soft weighting, not exclusion.
5. Breakdown is nonsense — perfect 1.00 across Title/Keywords/Level/Remote on
   garbage listings; a wall of tied 1.00s means the calculation discriminates
   nothing. Owner verdict: overhaul the signal calculation completely so bad
   listings stop wasting their time.

**#6 (feed curation):** wants a responsive feedback system on postings — click
through ~100 postings with upvote/downvote + ONE inner choice for the reason.
Low-effort UI. Feedback must progressively apply to the scoring algorithm.
Owner prefers this over hand-writing a "perfect master doc" of preferences.

**#7 (UI):** "'Min score' slider is stupid, get rid of it" — remove the min-score
filter control from the dashboard. → FIXED same day (UI 3.4.1): control removed,
feed always unfiltered by score; API param kept for programmatic use.

**Status (end of day):** #1–5 → scoring v2 (worker 2.2.0, golden regression tests).
#6 → vote UI live (3.4.0) + job_feedback backend; tier-2/3 pending votes. #7 → min-score
removed (3.4.1... shipped in 3.5.0 bundle). #8 → prose salary mining + backfill
(3,294 ranges recovered; NVIDIA case verified 0.50→1.0). #9 → base×1.4 calibration.
#10 → filed as jobplatform#13 (comp enrichment; H-1B data preferred over levels.fyi
scraping). #11 → min-salary removed. #12 → hide-dismissed is client-side.
All deployed as worker 2.3.0 / UI 3.5.0.

**#13 (comp curve):** even 200k base is acceptable — must not score below neutral;
higher salaries weight monotonically higher. → mid-band recalibrated: fit 0.5 at
the sink threshold rising to 0.9 at ~250k base, 1.0 above; sink (<~187k base)
unchanged.

**Status (wave 2, end of day):** #13 comp curve → worker 2.3.1 ✓. #14 multi-select
reasons + #15 workplace filter + #16 lens sorts + #17 staleness → worker 2.4.0 /
UI 3.6.0, deployed ✓ (migration 0013 last_seen_at applied). #19 typography →
resume-bot 3.5.3 deployed ✓ (curly quotes/ellipsis straightened everywhere;
extras fields now normalized). #18 packets tab → SHIPPED & DEPLOYED (worker 2.5.0 / UI 3.7.0): Feed/Packets
top-nav; GET /jobs/packets (friend-gated, per-user, newest first); rows link
"View packet" + "PDF" (resume?v=slug); 7 new route tests (138 total).

**#14 (vote UX):** reason chips must be MULTI-select — currently one click submits
and the popover disappears. → chips toggle, each toggle saves (idempotent upsert),
popover stays open until blur/Escape/thumb; reasons persist and reload with the feed.

**#15 (filter):** need a full-remote vs hybrid/onsite filter condition on the feed.

**#16 (multi-lens sorting, design ask):** score is a catch-all; owner wants to
apply to some jobs for comp, some for company, some for how interesting the role
is — with a global comp floor ("never consider comp too low"). → Design: the
breakdown axes become selectable sort LENSES (Comp / Interest / Relevance
alongside overall Score); lens views auto-exclude floor-violating jobs (the
multiplicative sinks: lowball comp, non-US remote, non-eng discipline) and
downvoted postings; ties break by overall score. Company-lens deferred until
company affinity exists as a signal (votes/pins).

**#17 (stale postings):** first job owner tried to apply to (Instacart ML/AI
Platform via LinkedIn) was "Reposted 3 months ago … No longer accepting
applications" — dead listings must be culled/demoted. → Two-part fix:
(a) `last_seen_at` column bumped on every re-scrape — board postings that vanish
from their board go stale automatically; (b) feed staleness multiplier
(≤30d fresh ×1.0, 30–60d ×0.7, >60d ×0.25 using max(posted, last-seen)) so
unverifiable old keyword-feed postings sink. True closed-detection for board
jobs arrives with the next scrape cycles as last_seen_at diverges.

**#18 (packets tab):** generated application packets must be findable again — a
tab listing every job with a generated packet (data already persists: variant
slug on job_states + the minted variant itself), linking back to the kit and
the public resume?v= link.

**#19 (AI-tell typography):** '’' (curly apostrophe U+2019) appearing in generated
packet text — "a dead giveaway that it's ai-generated". Root cause: tailored
résumés pass through normalizeTypography but application-extras fields (cover
letter, intro email, screening answers, …) never did. → normalize every string
field of the extras JSON.

**#22 (ghost postings):** Cohere Agent Infra posted 2026-03 (5mo) topping the feed
— owner expected it culled. Clarified: it's STILL LISTED on the board (liveness
correctly spares open reqs from the cull). Real issue = posted-age: a req open
5 months is a ghost-posting risk. → posted-age decay ON TOP of liveness:
≤60d ×1.0, 60–120d ×0.9, 120–180d ×0.75, >180d ×0.6 — visible but demoted;
lens views exclude >120d-posted.

**#21 (packets empty + hash route):** /#/packets showed nothing despite two
generated kits. TWO root causes, both fixed: (a) minting the packet link was a
separate "Create link" button after Prepare application — the owner's kits were
never persisted as variants at all → prepare now AUTO-mints (UI 3.8.1); (b) even
minted packets never wrote variant_slug to job_states → mint now records it
(worker 2.5.1, tested). The owner's two kits are one cached-regenerate away from
appearing. Hash route: pre-existing MFE hash routing (static hosting can't serve
sub-paths without edge rewrites) — not introduced by the Packets work.

**#20 (cull):** → SHIPPED (worker 2.6.0): auto-cull on every scrape's final batch

- manual endpoint; first sweep removed 4,745 dead listings (corpus ~29k → ~24k,
  all fresh or owner-touched).

**#20 (cull, original scratch):** 2-month timeout for all listings — once 2 months old, cull them.
→ DELETE where freshness (max of posted/first-seen/last-seen) > 60d, EXCEPT rows
with owner activity (job_states incl. packets, feedback votes — those are records/
training data). Runs automatically on every scrape's final batch + manual endpoint.

**#8 (comp axis blind):** NVIDIA Principal LLM Memory role shows "base salary
range is 272,000 USD - 431,250 USD" in its description but Comp = 0.50 (the
unpublished-neutral default) — and the same for other postings with clearly
listed ranges. Diagnosis: comp_fit reads the structured salary_max COLUMN, which
is NULL on ~90% of postings; boards put pay-transparency ranges in description
PROSE. Fix: parse annual-USD ranges out of description text at ingest + backfill
the existing corpus.

**#9 (comp calibration):** ~250k BASE is fine — the ~350k target is TOTAL comp;
posted ranges are base, and stock/bonus typically bridges the gap at these tiers.
→ comp_fit must treat posted salary as base: estimated_total = base × ~1.4 before
comparing to the 350k floor.

**#10 (comp enrichment):** try approximating actual total comp from external
sources (levels.fyi-like), corroborated by title+company, to fill in the many
postings with no published range. Owner explicitly OK with approximation.

**#11 (UI):** "'Min salary' slider is also useless, get rid of that" — remove the
min-salary filter input too. (Comp belongs to the score, not a manual filter.)

**#12 (UI perf):** 'Hide dismissed' triggers a full feed refetch (slow, ~1s+ of
re-scoring) on every toggle. → make it a client-side view filter over the
already-loaded list; no API call. (Server-side param stays for initial loads.)

## Run log

- Job chosen:
- Packet slug:
- Submitted:

**#23 (origin links):** every posting needs a direct link to its origin post
(verify a suspicious/ghost req at the source). → card footer's source label is
now a link to job.url (↗, new tab); drawer already had "Apply on <source>".

**#24 (lone 1.00):** the only 1.00 in the feed (upvoted Cohere job) over a 0.82
field — "it should be nearly impossible for a post to get a 1". Cause: the tier-1
upvote boost clamped min(1, ×1.2+0.02), saturating any upvoted 0.82+ job to a
flat 1.00. → boost is now asymptotic (score + (1−score)×0.25): rewards without
ever reaching 1.0. The model itself already never emits 1.0 (golden #5).

**#25 (packets UI rework):** (1) row click must NOT bounce to feed+drawer — open
a bigger two-column split view instead: left = the posting, right = the packet;
(2) rename the "View packet" link → "Tailored resume" (external resume?v= page),
since the packet itself shows on row click; (3) drop the per-row "PDF" button —
PDF lives top-right of the split view only (it also exists on the resume page).

**#26 (apply automation):** owner landed on an Ashby application form and asked
to drive e2e with fewer clicks — can applications be automated? → Design filed
(jobplatform#14): approve-to-apply queue; PC-side Playwright runner fills
ATS forms (Ashby/Greenhouse/Lever) from the packet (standard fields, screening
answers, resume PDF), screenshots for audit; submit mode configurable
(review-first vs auto); hard-captcha forms flag back for manual. Human stays
the trigger per-application; modest volumes; no LinkedIn.

## 🎉 MILESTONE — 2026-08-21

**First fully-automated application SUBMITTED**: Pinecone, Senior/Staff SWE
Search & Retrieval Infrastructure (ashby_7ef089cb…, packet NLjT6hJndZr6).
Ashby filler v2: résumé-upload-first ordering, keyboard-event fills (React
ignores programmatic .fill()), ArrowDown+Enter combobox commits, canned-answer
question matching, self-healing resubmit on corrections banners. Owner ran the
final submit command; confirmation: "Your application was successfully
submitted." Recorded: application row e849afcb (status=submitted, evidence),
job state=applied+slug. Lessons for the production runner captured in memory.
