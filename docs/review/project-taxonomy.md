# Page-2 project taxonomy — proposal

Proposal for organizing the projects page (page 2) of the résumé: a hadoku.me anchor block at the top, projects grouped into recruiter-legible categories below it. Tier ranking (`tier:1/2/3`, owner-assigned) is respected everywhere — this reorganizes presentation, not importance.

Sources: `hadoku_site/scripts/resume/blocks.json` (16 `section:projects` blocks), `hadoku_site/scripts/child-apps.json` (app registry), live checks of hadoku.me and GitHub repo visibility, repo READMEs. All link-health and count claims below were verified 2026-08-12.

---

## 1. Inventory

One line per project. "GH" = GitHub link in the block; "Live" = live link in the block. ✗ marks links a recruiter cannot open (private repo → 404, or gated route → 401/404).

| Project                | Block id           | Tier | Prio | What it is                                                                                          | GH        | Live   |
| ---------------------- | ------------------ | ---- | ---- | --------------------------------------------------------------------------------------------------- | --------- | ------ |
| tenhands               | proj-tenhands      | 1    | 10   | Agentic OSS-PR pipeline (Temporal-gated Copilot agent + LLM judge)                                  | ✗ private | ✗ 401  |
| hadoku-scraper         | proj-scraper       | 1    | 9    | 12+-vertical scraping platform (FastAPI, anti-bot Xvfb+Patchright)                                  | ✗ private | ✗ 404  |
| hadoku.me platform     | proj-site          | 1    | 8    | CF Workers edge router, ~10 micro-frontends, tiered auth, CI graph                                  | ✗ private | ✓ 200  |
| hadoku-task            | proj-task          | 1    | 7    | Task/board manager, dual npm export + stateless MCP server                                          | ✓ public  | ✓ 200  |
| hadoku-watchparty      | proj-watchparty    | 1    | 6    | Sync streaming (MSE/fMP4 engine) + Rust/WASM multiplayer Bomberman                                  | ✗ private | ✓ 200  |
| hadoku-pygmalion       | proj-pygmalion     | 1    | 5    | Self-hosted AI interactive-fiction engine (FastAPI + React)                                         | ✗ private | ✗ 401  |
| hadoku-dataplatform    | proj-dataplatform  | 1    | 4    | Personal media platform: archive, GPU re-encode, range streaming                                    | ✗ private | ✗ 404  |
| hadoku-conjure         | proj-conjure       | 1    | 3    | Multi-tenant AI image/video/3D studio on ComfyUI                                                    | ✗ private | ✗ 401  |
| hadoku-jobplatform     | proj-jobplatform   | 2    | 9    | Job-search pipeline: ingest → classify → triage → application kit                                   | ✗ private | ✗ 404  |
| hadoku-trader          | proj-trader        | 2    | 8    | Congressional-trade copier w/ backtested scoring + Fidelity automation                              | ✓ public  | (none) |
| brave-quartet          | proj-brave-quartet | 2    | 7    | 4-player co-op ARPG, deterministic headless ECS = the server                                        | ✗ private | (none) |
| vibecheck              | proj-vibecheck     | 2    | 6    | GitHub Action orchestrating 13+ static-analysis tools, SARIF out                                    | ✓ public  | (none) |
| hadoku-printTool       | proj-printtool     | 2    | 6    | Print prep: five 2D bin-packing algorithms, TCG/sticker sheets                                      | ✓ public  | ✓ 200  |
| hadoku-resume-bot      | proj-resume-bot    | 2    | 5    | This résumé: two-pass LLM tailoring, dual npm export                                                | ✓ public  | ✓ 200  |
| hadoku-promptsmith     | proj-promptsmith   | 2    | 4    | Non-LLM taxonomy + embedding-kNN classifier over 84k items                                          | (none)    | (none) |
| Other tools (combined) | proj-other-tools   | 3    | 3    | contact-ui (booking on Workers/D1), aggregator (OSS-issue scoring), task-mobile (Capacitor wrapper) | ✓ ✓ ✓     | (none) |

Section mechanics today (worker `skeleton.ts`): projects always open page 2; within the section blocks sort by `priority` descending, section-globally (so a selected tier-2 like jobplatform at prio 9 renders _above_ tier-1 site/task/watchparty). Only `canonical` blocks — the eight tier-1s — appear on the default resume; tier-2/3 are palette for tailoring. The `# Projects` H1 currently lives inside proj-tenhands's content, so a tailored variant that drops tenhands loses the section heading.

---

## 2. Category scheme (proposed)

**Three categories.** Domain categories, not the 'tool vs platform' type axis: a recruiter maps "AI & Agents" to a job family instantly, while "platform/tool" describes shape, not skill. (If you still want the type axis, it works as a small italic label on each project line — see §3 — without costing the domain grouping.)

Three, not four, because the _canonical_ page only shows the eight tier-1 blocks — a fourth category would leave headings sitting over a single project. With three, the canonical split is 3/2/2 (after proj-site becomes the anchor).

| Category                | Tier 1                       | Tier 2                               | Tier 3      |
| ----------------------- | ---------------------------- | ------------------------------------ | ----------- |
| **AI & Agents**         | tenhands, pygmalion, conjure | jobplatform, resume-bot, promptsmith | —           |
| **Data & Automation**   | scraper, dataplatform        | trader                               | —           |
| **Apps, Games & Tools** | task, watchparty             | brave-quartet, printtool, vibecheck  | other-tools |

Assignment notes:

- **conjure** could argue for a "media" bucket, but its résumé story is the AI generation pipeline → AI & Agents.
- **watchparty** is half streaming-infra, half game; the game/product half is the differentiator → Apps, Games & Tools.
- **vibecheck** is developer tooling, not a data pipeline → Apps, Games & Tools.
- **trader** is scraping + automation + stats → Data & Automation.
- **other-tools** mixes flavors (aggregator is AI-ish); it stays a trailing catch-all in the last category rather than being split.
- **proj-site** leaves the list entirely — it becomes the anchor (§4).

Category order = descending strongest-member priority, i.e. your existing ranking decides: AI & Agents (tenhands 10) → Data & Automation (scraper 9) → Apps, Games & Tools (task 7).

---

## 3. Page-2 layout (proposed)

```
─ page break ─  (page 2)
# Projects
[anchor blurb — hadoku.me, §4]

### AI & Agents
tenhands · pygmalion · conjure          (+ jobplatform, resume-bot, promptsmith when tailored in)

### Data & Automation
hadoku-scraper · hadoku-dataplatform    (+ trader when tailored in)

### Apps, Games & Tools
hadoku-task · hadoku-watchparty         (+ brave-quartet, printtool, vibecheck, other-tools)
─ page break ─  (page 3: skills, prior experience, education)
```

Within a category: tier first, then your current relative priority. Tier ranking stays visually dominant — a tier-2 can never render above a tier-1 in its group (which fixes today's quirk where jobplatform prio 9 outranks four tier-1s when selected).

**Mechanics — two options:**

**Option A (recommended): priority re-banding + tiny assembler change.**
Re-band priorities so grouping falls out of the existing sort, and add a `cat:*` tag per block; `assembleResume()` emits a `###` subheading whenever the category changes (empty categories never render, so tailoring can't orphan a heading). ~15 lines in `worker/src/skeleton.ts` plus a label map.

| Block          | New prio |     | Block         | New prio |
| -------------- | -------- | --- | ------------- | -------- |
| _anchor (new)_ | 100      |     | scraper       | 69       |
| tenhands       | 89       |     | dataplatform  | 68       |
| pygmalion      | 88       |     | trader        | 64       |
| conjure        | 87       |     | task          | 49       |
| jobplatform    | 84       |     | watchparty    | 48       |
| resume-bot     | 83       |     | brave-quartet | 44       |
| promptsmith    | 82       |     | printtool     | 43       |
|                |          |     | vibecheck     | 42       |
|                |          |     | other-tools   | 40       |

Convention: 80s = AI & Agents, 60s = Data & Automation, 40s = Apps/Games/Tools; within a band, x7–x9 = tier 1, x2–x4 = tier 2, x0 = tier 3.

**Option B (zero code): re-banding only, category as inline label.** Same priorities, no subheadings; each title line gains a small label, e.g. `**tenhands** — agentic OSS-PR pipeline · *AI & Agents*`. Survives any tailoring subset trivially, but grouping is implicit — weaker visually. Fine as a stopgap if you don't want to touch the assembler now.

Either way, move the `# Projects` H1 out of proj-tenhands and into the anchor block.

---

## 4. Anchor block draft

Proposed content (the H1 moves here from proj-tenhands):

> # Projects
>
> Everything below runs in production on **[hadoku.me](https://hadoku.me)** — a personal cloud platform designed, built, and operated end-to-end: a Cloudflare Workers edge router with tiered key-auth fronting 13 self-built apps (10 independently-versioned npm micro-frontends plus 3 services tunneled from a self-hosted server), deployed hands-free by a publish→dispatch→auto-deploy CI graph across 13 child repos. 3,800+ commits on the platform repo alone.

All numbers verified today: 13 apps = 10 `includeInRegistry` micro-frontends + 3 tunneled services (conjure, pygmalion, games-host) in `child-apps.json`; 13 child repos = the distinct `repoName` entries there; 3,814 commits on hadoku*site `main`. No GitHub link, per the private-repo constraint — hadoku.me is the only reference. Optional trailing sentence if you want to preempt the gated-app question: *"Public demos: /task, /watchparty, /printtool, /resume; the rest are key-gated."\_

Proposed block JSON:

```json
{
  "id": "proj-anchor-hadoku",
  "type": "project",
  "tags": [
    "always",
    "canonical",
    "section:projects",
    "tier:1",
    "story:platform",
    "story:devops",
    "layer:infra",
    "tech:cloudflare",
    "tech:typescript"
  ],
  "title": "hadoku.me — projects anchor",
  "content": "<the draft above>",
  "priority": 100
}
```

Tag rationale, from how blocks.json + the worker actually use tags:

- `canonical` — the only machine-enforced inclusion tag (`filterCanonical` in skeleton.ts); required or the default résumé loses the anchor **and** the `# Projects` heading.
- `always` — currently a convention (header/education/skills-languages carry it; the selection prompt hardcodes header+education by name). Recommend one added rule line in the `tailored-resume.ts` selection prompt — "Always include blocks tagged `always`" — so tailored variants can never drop the anchor.
- `section:projects` + `type: "project"` — buckets it into the page-2 section; priority 100 pins it above every project in the section-global sort.
- `tier:1` — keeps the LLM's tier heuristic coherent if it ever weighs the anchor.
- story/layer/tech tags mirror proj-site's, so any tailoring profile that favored the platform story still matches.

**Open decision — proj-site.** The anchor absorbs proj-site's headline (edge router, micro-frontends, tiered auth, CI graph, commit count). Keeping both duplicates half a paragraph at the top of page 2. Recommendation: retire proj-site and let the anchor carry the platform story; its dropped specifics (Vaultwarden, PM2 control plane, ~95k LOC) can seed a tier-2 palette-only "platform deep-dive" block for infra-heavy roles if you want them kept. Alternative: keep proj-site as the top of Data & Automation, rewritten to not overlap the anchor.

---

## 5. Unresolved (for the owner)

1. **Nine résumé blocks link private GitHub repos** — recruiters get 404s: tenhands, hadoku-scraper, hadoku_site, watchparty, pygmalion, dataplatform, conjure, jobplatform, brave-quartet. (Public and fine: task, trader, vibecheck, printTool, resume-bot, contact-ui, aggregator, task-mobile.) Decide per repo: make public, drop the link, or point at the hadoku.me route instead.
2. **Six of ten [Live] links fail for an anonymous visitor**: /tenhands, /pygmalion, /conjure → 401 (friend-gated); scraper.hadoku.me, /tube (dataplatform), /jobs (jobplatform) → 404. Only /task, /watchparty, /printtool, /resume return 200 publicly. Same decision: open a demo tier, drop the link, or annotate "(gated)".
3. **proj-promptsmith has no links at all** — no GitHub, no Live. Intentional?
4. **Stale numbers in proj-site**: "3,354 commits" is now 3,814; "~9 repos" is now 13 child repos. Fixed in the anchor draft; worth a sweep of the other blocks' LOC/test counts at some point.
5. **Registry apps with no block**: hadoku-meet (README is still a stub — probably rightly omitted) and games-host (docker-compose control plumbing — rightly omitted). Confirm both are deliberate.
6. **proj-other-tools straddles categories** (aggregator is AI-flavored, contact-ui/task-mobile are apps). Left intact as a tier-3 catch-all at the bottom of Apps, Games & Tools; splitting it isn't worth three tiny blocks.
7. **Non-hadoku repos in ~/repos with no block** (gwEvolution, StoryCanopy, silverTongue, upcominganimego, webcomicreact, …) look dormant/pre-hadoku — assumed intentionally excluded; flagging only so the exclusion is a decision rather than an accident.
