# Résumé structure spec (canonical)

This is the owner's layout requirement, stated once so nobody has to re-explain
it. Any change to the résumé — code, blocks, or tailoring — must preserve this.
Last confirmed by owner: 2026-08-21.

The résumé is a **fixed 3-page skeleton**. Tailoring selects WHICH blocks fill
each section; it never reorders sections, never moves a section across pages,
and never changes the page budgets below.

## Page 1 — who I am + Microsoft

| Budget         | Content                                              |
| -------------- | ---------------------------------------------------- |
| top ~1/4       | Name, contact line, Profile paragraph                |
| remaining ~3/4 | **Microsoft** employment only (`experience-primary`) |

## Page 2 — hadoku.me

| Budget         | Content                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| top ~1/5       | **One paragraph** introducing the hadoku.me platform (the anchor block) |
| remaining ~4/5 | As many child-app blocks as fit, each with a relevant description       |

Anchor-paragraph rules:

- Exactly one paragraph. No second paragraph, no list.
- **No "Public demos:" link list.** Each child-app block carries its own
  `[GitHub]` / `[Live]` links — the apps explain and link themselves.
- Every number in it (app counts, repo counts) must be verified against the
  actual repos at edit time, not estimated.
- **No effort metrics anywhere** (owner rule, 2026-08-21): LOC counts, test
  counts, and commit counts are banned in every block. They read as effort
  claimed as achievement, and big solo-project LOC pattern-matches to
  AI-generated volume. Numbers that describe the SYSTEM are welcome (12+
  scraper verticals, 84k-item corpus, ~13ms lookups, 8,252 trade pairs).
- The auth system and the deploy pipeline are the two strongest platform
  claims — describe them concretely, not as "a basic CI chain".

## Page 3 — skills + everything else, in this order

1. **Technical Skills** — the large multi-category block, first thing on the page
2. **Additional Experience** — Charles River Development
3. **Education**

## Tailored-variant rules

- **The anchor paragraph is exempt from LLM rewriting.** Its figures are
  verified; a rewrite restyling them ("3 800+", "84 k") is drift, not polish.
  Enforced in code: `restoreProjectsAnchor` splices the canonical anchor text
  back in verbatim, both at mint time (`tailored-resume.ts`) and at read time
  (`renderVariant` in `variants.ts`) — so even already-minted recruiter links
  render the current verified paragraph.
- **Selection is dynamic, never hardcoded.** The owner explicitly does not
  want project blocks pinned with `always` (that tag is for structural blocks
  only: header, section openers, the anchor). Instead the selector treats
  tier:1 projects as default-include — dropped only when clearly irrelevant to
  the specific role and the slot is needed — cutting tier:3 before tier:2
  before tier:1, aiming for 6-7 project blocks.
- Number style is plain American: `3,800` / `74%` / `84k`. The tailoring
  prompt instructs this and `normalizeTypography` tightens spaced variants.
- **Em dashes are banned across the board** (owner rule, 2026-08-21). No
  block, variant, cover letter, or generated field may contain one. Sources
  are scrubbed, every generation prompt forbids them, and
  `normalizeTypography` converts any that slip through (`—` to `-`, bare
  `—` to `-`) at the read boundary. En dashes in date ranges are fine.
- Category placement: `proj-vibecheck` lives under `cat:ai-agents` (it is an
  AI-adjacent tool, not a game). It is palette-only (tier:2) — the 7 canonical
  projects are all tier:1 and page 2 cannot fit an 8th block (verified: adding
  one renders a 4th page).

## Where each piece is enforced

- Section order + hard page breaks: `worker/src/skeleton.ts`
  (`SECTION_ORDER`, `PAGE_BREAK_BEFORE` = {projects, skills},
  `<!-- page-break -->` marker). Code guarantees WHERE pages break.
- Content: `hadoku_site/scripts/resume/blocks.json` (private, untracked) →
  `python3 scripts/admin/resume_ingest.py` → CONTENT_KV. Blocks tagged
  `canonical` form the default résumé.
- Page-1 density IS enforced by code: `PAGE1_CHAR_BUDGET` (2,500 chars) in
  `tailored-resume.ts` trims lowest-priority Microsoft detail blocks after
  selection. Measured, not guessed: 2,460 chars renders 3 pages, 2,750 spills
  to 4. Re-measure if the PDF typography changes.
- **Remaining page budgets are NOT enforced by code.** They are a content-length
  discipline: after any content change, render `/resume/api/resume.pdf` and
  check (a) pageCount === 3, (b) the proportions above still hold by eye.

## Verification checklist (run after any change)

1. `GET /resume/api/resume` — sections appear in skeleton order, exactly two
   `<!-- page-break -->` markers (before Projects, before Technical Skills).
2. `GET /resume/api/resume.pdf` — exactly 3 pages.
3. Page 1: Microsoft fills the page below the header/profile; nothing spills.
4. Page 2: one anchor paragraph, then only app blocks.
5. Page 3: skills block first, then Charles River, then Education.
