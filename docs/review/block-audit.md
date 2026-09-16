# Resume block audit — writing quality + tag routing

Audited: all 56 blocks in `hadoku_site/scripts/resume/blocks.json`
Voice reference: `docs/Resume 13.docx` ("Resume 13")
Routing ground truth: `worker/src/tailored-resume.ts` (two-pass selection), `worker/src/skeleton.ts` (section bucketing, priority ordering, canonical filter), `worker/src/blocks.ts`.

**How tags are actually used** (everything below is grounded in this):

1. **Pass-1 selection** (`tailored-resume.ts:56-101`): the LLM sees only `ID / Type / Tags / Title / first 200 chars of content` per block. Tags are the dominant relevance signal — an over-broad tag misroutes because the selector can't see enough content to correct for it.
2. **`profile_type` hint** (`tailored-resume.ts:76-78`): "prefer blocks tagged with this" — profile_type values must literally match tag text, so tag-name consistency (e.g. `ml-eval` vs `llm-eval`) directly affects matching.
3. **`tier:N`** (`tailored-resume.ts:94`): prompt-level tie-breaker among similarly relevant project blocks. Only meaningful on `section:projects` blocks.
4. **`canonical`** (`skeleton.ts:55-59`): filters the default `/resume` and plain PDF. Not used in tailoring.
5. **`section:*` + type fallback** (`skeleton.ts:72-93`): buckets blocks into a fixed skeleton; **`priority` orders blocks within a section** (`skeleton.ts:119-121`) — the selector's ordering is discarded.
6. **`always`**: appears on 3 blocks (header, education-umass, skills-languages) but is **read by no code path**. Header/education inclusion is guaranteed only by prompt wording; skills-languages has no guarantee at all.

---

## 1. Summary table

| #   | Block id                | Verdict | Tag changes                                                           |
| --- | ----------------------- | ------- | --------------------------------------------------------------------- |
| 1   | header                  | KEEP    | none (note: `always` unenforced in code)                              |
| 2   | summary-ai              | REWRITE | none                                                                  |
| 3   | ms-headline             | KEEP    | **+story:ai-applied, +story:leadership, +story:scale**                |
| 4   | summary-platform        | REWRITE | none                                                                  |
| 5   | summary-em              | REWRITE | none                                                                  |
| 6   | education-umass         | KEEP    | none (note: `always` unenforced in code)                              |
| 7   | skills-languages        | KEEP    | none (note: `always` unenforced; carries the `# Technical Skills` H1) |
| 8   | skills-ml-ai            | KEEP    | none                                                                  |
| 9   | skills-infra            | KEEP    | none                                                                  |
| 10  | skills-web              | KEEP    | none                                                                  |
| 11  | skills-data-viz         | KEEP    | none                                                                  |
| 12  | skills-monitoring       | KEEP    | none                                                                  |
| 13  | skills-collab           | KEEP    | none                                                                  |
| 14  | ai-intro                | REWRITE | none, but **priority must rise to 10** (see tag list)                 |
| 15  | ai-ml-eval              | REWRITE | **-tech:python** (unverified in content)                              |
| 16  | ai-fine-tuning          | REWRITE | **-layer:data-pipeline, +story:llm**                                  |
| 17  | ai-observability        | REWRITE | none                                                                  |
| 18  | ai-teaching             | REWRITE | none                                                                  |
| 19  | ai-light-ml             | REWRITE | **-layer:data-pipeline, +layer:telemetry**                            |
| 20  | ms-ai-agent-pipeline    | KEEP    | none (tech:react borderline but genuine — React 19 dispatch UI)       |
| 21  | ms-perf-caching         | KEEP    | none                                                                  |
| 22  | ms-serverless-telemetry | KEEP    | none                                                                  |
| 23  | ms-merge-conflict       | KEEP    | **-story:ai-applied, +story:data-driven-decisions**                   |
| 24  | ms-leadership           | KEEP    | none                                                                  |
| 25  | ms-security-compliance  | KEEP    | none                                                                  |
| 26  | ms-etl-pipelines        | KEEP    | **-story:ml-applied-anomaly** (or rename story:anomaly-detection)     |
| 27  | ms-dataviz              | KEEP    | none                                                                  |
| 28  | ms-cost-analytics       | KEEP    | none                                                                  |
| 29  | ms-react-extensions     | KEEP    | **-layer:fullstack**                                                  |
| 30  | ms-api-backend          | KEEP    | none                                                                  |
| 31  | ms-migrations           | KEEP    | none                                                                  |
| 32  | ms-ops-dri              | KEEP    | none                                                                  |
| 33  | ms-telemetry-engagement | KEEP    | none                                                                  |
| 34  | ms-git-internals        | KEEP    | **-layer:api**                                                        |
| 35  | ms-dynamic-resolver     | KEEP    | **tech:csharp → tech:dotnet**                                         |
| 36  | ms-build-break-analysis | KEEP    | none                                                                  |
| 37  | ms-azure-devops         | REWRITE | **-story:leadership, +layer:ui, +tech:react, +layer:data-pipeline**   |
| 38  | ms-windows-devops       | REWRITE | none                                                                  |
| 39  | ms-data-eng             | REWRITE | **+layer:etl**                                                        |
| 40  | charles-river           | KEEP    | none                                                                  |
| 41  | proj-tenhands           | KEEP    | **story:llm-eval → story:ml-eval** (taxonomy merge)                   |
| 42  | proj-scraper            | KEEP    | none                                                                  |
| 43  | proj-site               | KEEP    | none                                                                  |
| 44  | proj-task               | KEEP    | none                                                                  |
| 45  | proj-watchparty         | KEEP    | none                                                                  |
| 46  | proj-pygmalion          | KEEP    | none                                                                  |
| 47  | proj-dataplatform       | KEEP    | none                                                                  |
| 48  | proj-conjure            | KEEP    | none                                                                  |
| 49  | proj-jobplatform        | KEEP    | none                                                                  |
| 50  | proj-trader             | KEEP    | none                                                                  |
| 51  | proj-brave-quartet      | KEEP    | none                                                                  |
| 52  | proj-vibecheck          | KEEP    | none                                                                  |
| 53  | proj-printtool          | KEEP    | none                                                                  |
| 54  | proj-resume-bot         | KEEP    | none                                                                  |
| 55  | proj-promptsmith        | KEEP    | none                                                                  |
| 56  | proj-other-tools        | KEEP    | **-story:ai-agents**                                                  |

**Counts: 44 KEEP, 12 REWRITE.** The REWRITE cluster is almost entirely the three summaries, the six `ai-*` blocks, and the three legacy Microsoft level-history blocks.

**Tier sanity check:** all 16 `section:projects` blocks carry exactly one `tier:*` tag (8× tier:1, 7× tier:2, 1× tier:3), matching the owner's own 3-tier ranking. No tier changes needed.

---

## 2. REWRITE blocks — current vs proposed

Facts in proposals come only from the block palette, Resume 13, or other blocks in the palette. Missing facts are marked `[NEEDS FACT: …]`.

### summary-ai

> \# Profile
> Engineer with 10+ years of experience delivering scalable systems across data platforms, UI infrastructure, and AI tooling. Shipped a production AI-agent remediation pipeline at Microsoft — autonomous agents resolving security backlog items through merged PRs — alongside deep experience in ML evaluation, fine-tuning, and AI pipeline tooling. Passionate about making models reliable, observable, and usable by real teams.
>
> Currently focused on:
>
> - AI-agent systems and MCP tooling in production workflows
> - ML evaluation infrastructure and prompt benchmarking
> - LLM fine-tuning (LoRA, embedding memory, context chaining)

Proposed:

```
# Profile
Engineer with 10+ years shipping data platforms, developer tooling, and AI systems.
Built and shipped a production AI-agent remediation pipeline at Microsoft — autonomous
agents resolving security backlog through merged PRs (44 merged in its first cycle) —
plus hands-on ML evaluation, LoRA fine-tuning, and AI pipeline tooling.

Currently focused on:
- AI-agent systems and MCP tooling in production workflows
- ML evaluation infrastructure and prompt benchmarking
- LLM fine-tuning (LoRA, embedding memory, context chaining)
```

What was wrong: "delivering scalable systems", "deep experience", and the "Passionate about…" closer are filler; the one number this story has (44 merged agent PRs, from ms-headline) was missing.

### summary-platform

> \# Profile
> Engineer with 10+ years of experience delivering scalable systems across data platforms, UI infrastructure, and developer tooling. Proven record shipping telemetry pipelines processing ~100TB/day, developer portals serving hundreds of organizations, and monitoring that lifted critical API uptime from 71% to 99.9%. Passionate about building reliable, observable systems that real teams depend on.

Proposed:

```
# Profile
Engineer with 10+ years building data platforms, UI infrastructure, and developer
tooling: telemetry pipelines processing ~100TB/day, a pipeline portal serving ~200
Azure DevOps organizations, and monitoring that lifted critical API uptime from
71% to 99.9%.
```

What was wrong: "delivering scalable systems", "Proven record", and the "Passionate about…" closer are boilerplate; "hundreds of organizations" is vaguer than the actual figure (~200, per Resume 13 and ms-azure-devops).

### summary-em

> \# Profile
> Engineer with 10+ years of experience who leads as readily as he builds: drove a cross-org initiative spanning four Microsoft organizations as lead developer, project manager, and data analyst; led feature crews as the senior engineer; and built an unbroken mentoring track record — interns shipped to production, junior engineers grown into data owners, PMs made self-sufficient. Combines hands-on technical depth (data platforms, developer tooling, AI systems) with the planning, delegation, and cross-team communication that engineering management demands.

Proposed:

```
# Profile
Engineer with 10+ years who leads as readily as builds: drove a merge-automation
initiative across four Microsoft organizations as lead developer, project manager,
and data analyst; led feature crews as senior engineer; mentored 3 interns into
production-shipped work and grew 2 junior engineers into data owners. Hands-on
depth in data platforms, developer tooling, and AI systems.
```

What was wrong: third-person "he" (Resume 13's profile is first-person and plain); "unbroken mentoring track record" is a claim where the numbers (3 interns, 2 juniors — from ms-leadership) are stronger; the final sentence is a generic capability statement.

### ai-intro

> \# Relevant AI Experience
>
> Built ML evaluation pipelines and model observability tools across LLMs, image generation, and transcription models. Excited to apply these techniques to real-world perception systems and physical-world robustness problems in safety-critical contexts.

Proposed:

```
# Relevant AI Experience

Built ML evaluation pipelines and model observability tooling across LLMs, image
generation (SDXL, Flux), and transcription (Whisper) — benchmarking, regression
tracking, and fine-tuning applied in both Microsoft production systems and
self-hosted infrastructure.
```

What was wrong: the second sentence ("perception systems… safety-critical contexts") is a leftover pitch for one specific robotics/AV job — it will be pasted verbatim onto every résumé this block is selected for, which is exactly the wrong-block-on-wrong-résumé failure this audit exists to prevent.

### ai-ml-eval

> \### ML Evaluation & Prompt Benchmarking
>
> - Designed scalable evaluation pipelines to compare LLMs and image/audio models (GPT-4, SDXL, Whisper) across output quality, inference stability, and degradation scenarios. Included prompt benchmarking, hallucination detection, and structured metric logging to drive model iteration decisions.
> - Created image generation benchmarks using Stable Diffusion (SDXL, Flux, ChatGPT image gen) with X/Y grid scripts to optimize prompt, sampler, and workflow steps.
> - Developed perception-adjacent evaluation techniques using Whisper audio pipelines and Stable Diffusion generations, focusing on input-output consistency, feature coverage, and mode collapse scenarios.
> - Deployed AI tools for personal and team use, including prompt diagnostics and model switching logic.

Proposed:

```
### ML Evaluation & Prompt Benchmarking
- Built evaluation pipelines comparing LLMs and image/audio models (GPT-4, SDXL,
  Whisper) on output quality and degradation, with prompt benchmarking, hallucination
  detection, and structured metric logging feeding model-choice decisions
  [NEEDS FACT: a named pipeline or scale — prompts run, models compared, or one
  decision the results drove].
- Built X/Y-grid image-generation benchmarks (SDXL, Flux) to pick prompt, sampler,
  and workflow-step settings.
- Stress-tested Whisper transcription and Stable Diffusion pipelines for
  input-output consistency and mode collapse [NEEDS FACT: which pipeline/dataset,
  and one measurable outcome].
```

What was wrong: "Designed scalable evaluation pipelines", "perception-adjacent evaluation techniques", "feature coverage" — capability-statement language with zero numbers or named deliverables across four bullets. Bullet 4 ("Deployed AI tools for personal and team use") says nothing checkable and was cut; if a real system exists (e.g. the pluggable LLM abstraction in pygmalion, or the provider chain in resume-bot), name it instead.

### ai-fine-tuning

> \### Fine-tuning & Embedding-Based Memory
>
> - Fine-tuned LoRA models for Stable Diffusion to enable consistent character rendering; published on CivitAI and HuggingFace.
> - Integrated vector database memory with summarization chains to combat context rot and provide continuity in AI chat workflows.
> - Designed custom retrieval strategies and memory chaining for persistent, long-form interaction via Discord bot and CLI tools.

Proposed:

```
### Fine-tuning & Embedding-Based Memory
- Fine-tuned Stable Diffusion LoRA models for consistent character rendering;
  published on CivitAI and HuggingFace [NEEDS FACT: download or usage count, if
  available].
- Built vector-database memory with summarization chains that keep long-running AI
  chat coherent past the context window — shipped in a Discord bot and CLI tools.
```

What was wrong: bullets 2 and 3 describe the same system twice in overlapping abstractions ("integrated… to combat context rot" / "designed custom retrieval strategies… for persistent, long-form interaction"); merged into one bullet with the concrete artifacts (Discord bot, CLI) kept.

### ai-observability

> \### Evaluation Feedback & Model Observability
>
> - Built telemetry dashboards and alerting pipelines for model-in-the-loop tools, tracking output quality over time and surfacing regressions. Designed tools to help teams interpret noisy outputs and guide data collection and labeling efforts.

Proposed:

```
### Evaluation Feedback & Model Observability
- Built telemetry dashboards and alerting for model-in-the-loop tools, tracking
  output quality over time and flagging regressions [NEEDS FACT: which tool or
  team, and one number — models tracked, regressions caught, or users served].
```

What was wrong: no named system, no number, and the second sentence ("Designed tools to help teams interpret noisy outputs and guide data collection and labeling efforts") is a generic capability claim — as written this bullet is indistinguishable from filler.

### ai-teaching

> \### Teaching, Leadership, and Knowledge Sharing
>
> - Regularly mentored coworkers on AI use, prompting, deployment strategies, and compliance usage within enterprise tools.
> - Led AI best practices sessions within Microsoft engineering teams to accelerate adoption and safe experimentation.
> - Taught evaluation techniques and chaining workflows to non-ML colleagues for use in test and telemetry environments.

Proposed:

```
### Teaching & Knowledge Sharing
- Ran AI best-practices sessions for Microsoft engineering teams — prompting,
  deployment, and compliant enterprise use [NEEDS FACT: session count or audience
  size].
- Taught evaluation techniques and chaining workflows to non-ML colleagues for
  test and telemetry work.
```

What was wrong: bullets 1 and 2 say the same thing ("mentored coworkers on AI use" / "led AI best practices sessions"); "to accelerate adoption and safe experimentation" is padding. Note: for leadership-profile roles the concrete ms-leadership block covers this ground far better (3 interns, 289 participants) — this block should stay narrowly about AI teaching.

### ai-light-ml

> \### Light ML Applications
>
> - Applied clustering (K-means) to telemetry tagging systems to infer parent relationships in work item graphs.
> - Built structured and unstructured models for classification and tagging inside secure enterprise environments at Microsoft.

Proposed:

```
### Applied ML
- Applied K-means clustering to work-item telemetry to infer parent relationships
  in tagging graphs [NEEDS FACT: scale — items clustered, or accuracy vs the manual
  baseline].
- Built classification and tagging models over structured and unstructured data at
  Microsoft [NEEDS FACT: a named system or measurable outcome — without one this
  bullet is a capability claim and should be dropped].
```

What was wrong: "inside secure enterprise environments" is filler that adds compliance-flavored vagueness; "Light ML Applications" as a heading undersells; neither bullet has a number or named system.

### ms-azure-devops

> \# Experience
>
> \### Microsoft — Software Engineer 2
> _Apr 2018 – Present_
> **Azure DevOps & UI (Level 62)**
>
> - Designed and shipped a unified pipeline portal used by ~200 orgs, reducing feedback cycles from months to days and cutting deployment errors by 80%.
> - Led rollout of policy enforcement on ~13K repositories, deprecating legacy tools and reducing policy management overhead.
> - Designed and deployed evaluation dashboards for internal telemetry pipelines, integrating anomaly detection and regression metrics across ~25K daily builds. Enabled rapid root cause detection and improved test robustness at org scale.
> - Created telemetry and compliance solutions processing ~100TB/day using ADF/Databricks with alerting and anomaly detection.

Proposed (Resume 13 wording preferred throughout):

```
# Experience

### Microsoft — Software Engineer 2
*Apr 2018 – Present*
**Azure DevOps & UI (Level 62)**
- Shipped a React-based pipeline portal for ~200 Azure DevOps orgs — cut feedback
  cycles from months to days and reduced manual deployment errors by 80%.
- Rolled out approver policies across ~13K repositories, replacing governed branches
  and deprecating EasyStart to lower governance maintenance.
- Enhanced Azure Build Health with a unified Deployment Health dashboard — anomaly
  detection and regression metrics across ~25K daily builds — and an "Unknown Test
  Class" fix that unblocked 25 of 44 QCS customers.
- Built ADF/Databricks telemetry and compliance pipelines processing ~100TB/day
  with alerting and anomaly detection.
```

What was wrong: "Enabled rapid root cause detection and improved test robustness at org scale" is an AI-ish impact tail with no evidence; Resume 13 covers the same facts with named systems (EasyStart, Deployment Health, "Unknown Test Class") and a real outcome ("unblocked 25 of 44 QCS customers") that the block dropped.

### ms-windows-devops

> **Windows DevOps & UI (Level 61)**
>
> - Migrated .NET/PowerShell tools to distributed Azure-native architecture, cutting onboarding latency from 8 days to 5 hours.
> - Rebuilt internal Codeflow tooling with a React + Azure DevOps extension used by 4,000+ developers.
> - Boosted Windows dev tool API uptime from 71% to 99.9% with telemetry and health monitoring improvements.

Proposed (Resume 13 wording preferred):

```
**Windows DevOps & UI (Level 61)**
- Modernized .NET/PowerShell tools into cloud-native services and moved builds to
  Azure Pipelines with distributed agents — cut branch onboarding from 8 days to
  5 hours (98% faster).
- Replaced an on-prem Codeflow tool with a React Azure DevOps extension used by
  4,000+ monthly users.
- Improved API uptime for Windows branches, builds, and dev tools from 71% to
  99.9% with telemetry and health monitoring.
```

What was wrong: "cutting onboarding latency" is vaguer than Resume 13's "cut branch onboarding … (98% faster)" — the owner's own voice target for this exact fact; "Rebuilt internal Codeflow tooling" loses the on-prem→cloud replacement framing.

### ms-data-eng

> **Data Engineering & Business Intelligence (Level 59–60)**
>
> - Partnered with teams to build data pipelines, dashboards, and telemetry tools reducing build waste (e.g., 381 nightly builds → 268).
> - Productized data ingestion/reporting templates and published via internal extension hubs.

Proposed (Resume 13 wording preferred):

```
**Data Engineering & Business Intelligence (Level 59–60)**
- Partnered with engineering teams on data pipelines and telemetry reports that
  cut nightly builds from 381 to 268 (29%).
- Productized ADF/Databricks ETL templates handling 100+ TB/day, added
  alerting/anomaly detection, and published them via Merlinbot and Visual Studio
  extensions.
```

What was wrong: "reducing build waste (e.g., …)" buries the number in a parenthetical and drops the 29%; bullet 2 lost every specific from Resume 13 — the tech (ADF/Databricks), the scale (100+ TB/day), and the named distribution channels (Merlinbot, VS extensions) — leaving "published via internal extension hubs", which is exactly the diluted-by-rewriting pattern the owner complained about.

---

## 3. Consolidated tag-change list

Apply mechanically. "Selector" = pass-1 LLM selection in `tailored-resume.ts`, which sees only tags/title/200-char snippet; "profile hint" = the `profile_type` preference at `tailored-resume.ts:76-78`; "assembly" = section bucketing + priority sort in `skeleton.ts`.

```
ms-headline:            +story:ai-applied, +story:leadership, +story:scale
  — the canonical anchor has ZERO story/tech tags, so every profile hint under-weights
    it. It is also a carrier of the "# Experience" H1 + employer/date line: if the
    selector skips it (and ms-azure-devops), the experience section renders headless.

ai-intro:               priority 8 → 10  (not a tag, but assembly-critical)
  — assembleResume orders experience-primary by priority; ai-ml-eval (9) currently
    renders BEFORE its own "# Relevant AI Experience" section heading (8).

ai-ml-eval:             -tech:python
  — content never names Python; a Python-tagged search should land on
    ms-ai-agent-pipeline / proj-scraper / proj-tenhands instead. Re-add only if the
    owner confirms the eval scripts were Python and names them in the content.

ai-fine-tuning:         -layer:data-pipeline, +story:llm
  — nothing in the block is a data pipeline; the tag invites the selector to put a
    hobby LoRA block on a data-engineering résumé. +story:llm groups it with
    pygmalion/jobplatform/resume-bot for LLM-profile roles.

ai-light-ml:            -layer:data-pipeline, +layer:telemetry
  — the content is clustering over work-item telemetry, not pipeline construction;
    same misrouting risk as above.

ms-merge-conflict:      -story:ai-applied, +story:data-driven-decisions
  — content is analytics + a *scoped* ML prototype (target AUC), not applied AI.
    story:ai-applied already covers 16 of 56 blocks; every dilution makes the profile
    hint (\"prefer blocks tagged with this\") less selective for real AI work.

ms-etl-pipelines:       -story:ml-applied-anomaly   (or rename → story:anomaly-detection)
  — singleton tag no other block or profile value will ever match; as tag text shown
    to the selector it is noise.

ms-react-extensions:    -layer:fullstack
  — pure UI/extension work (the one permission-model mention is not backend
    ownership); fullstack-profile roles should route to proj-task / proj-site /
    ms-api-backend, not here.

ms-git-internals:       -layer:api
  — no API surface in the content (resolver service internals + git plumbing);
    api-tagged selection should prefer ms-api-backend / ms-perf-caching.

ms-dynamic-resolver:    tech:csharp → tech:dotnet
  — 5 blocks use tech:dotnet, only this one uses tech:csharp; a .NET-shaped JD match
    on tag text will systematically miss this block. Normalize the taxonomy.

ms-azure-devops:        -story:leadership, +layer:ui, +tech:react, +layer:data-pipeline
  — content has no leadership bullets (portal, policy rollout, dashboards, pipelines);
    story:leadership makes EM-profile selection prefer this over ms-leadership.
    The portal is React-based (per Resume 13) and half the block is data-pipeline
    work (~100TB/day ADF/Databricks), so those tags are genuinely missing.

ms-data-eng:            +layer:etl
  — the block IS the ETL-template story; today layer:etl only matches
    ms-etl-pipelines and proj-scraper, so an ETL-heavy JD can miss this block.

proj-tenhands:          story:llm-eval → story:ml-eval
  — story:ml-eval (6 blocks) and story:llm-eval (1 block) are the same concept split
    in two; a profile hint of \"ml-eval\" currently misses the flagship eval artifact
    (LLM-judge calibrated on 54 issues). Merge to one name.

proj-other-tools:       -story:ai-agents
  — the tier:3 grab-bag block earns the tag from a one-line aggregator mention;
    ai-agents roles already route to proj-tenhands / proj-task /
    ms-ai-agent-pipeline. Per the tier rule relevance-beats-tier, an over-broad tag
    here can promote the weakest block on the sheet.
```

**Non-tag routing findings (need code or authoring-convention fixes, listed for completeness):**

1. **`always` is decorative.** No code reads it. Header and education survive only because the selection prompt says so in prose; `skills-languages` — which carries the `# Technical Skills` H1 — has no guarantee at all. Either enforce `always` post-selection in `generateTailoredResume` (union the tag's blocks into `selectedIds`) or accept prompt-only enforcement knowingly.
2. **Section H1s live inside block content.** `# Experience` only in ms-headline/ms-azure-devops, `# Projects` only in proj-tenhands, `# Additional Experience` only in charles-river, `# Profile` in each summary. Any selection that drops the carrier block renders a headless section; selecting ms-headline AND ms-azure-devops (both priority 10, both experience-primary) renders the H1 and the employer/date line twice. Cleanest fix: emit section headings from `assembleResume` and strip them from content.
3. **Variant groups are unmarked.** The prompt tells the selector to "prefer the most role-relevant variant when multiple variants of the same experience exist", but nothing in the data marks ms-headline as a rollup of ms-ai-agent-pipeline / ms-perf-caching / ms-merge-conflict / ms-dynamic-resolver / ms-security-compliance / ms-leadership. Selecting the rollup plus any child duplicates bullets verbatim. A `variant:<group>` tag (e.g. `variant:ms-anchor` on ms-headline + ms-azure-devops) would let the prompt rule actually bite.
4. **Three `# Profile` blocks share priority 8-9 in one section.** If the selector returns two summaries, both render. Consider a prompt rule ("select at most one summary block") or a variant tag as in (3).

---

## 4. Systemic patterns

1. **Capability statements instead of events.** The whole `ai-*` family describes what the author _can do_ ("Designed scalable evaluation pipelines…", "Built structured and unstructured models…") rather than what _happened_ (built X, shipped to Y, moved Z by N%). Every Resume 13 bullet is an event with a named system and usually a number. Rule of thumb: if a bullet would be true of a thousand engineers, it isn't finished.
2. **Rewriting away the specifics.** ms-data-eng and ms-azure-devops are _derived from_ Resume 13 bullets but dropped the named systems (Merlinbot, EasyStart, "Unknown Test Class") and numbers (29%, 25 of 44 QCS, 98% faster) along the way. When a hand-written bullet exists, treat it as the ceiling — condense it, never paraphrase it.
3. **Impact tails with no evidence.** "…to drive model iteration decisions", "Enabled rapid root cause detection and improved test robustness at org scale", "to accelerate adoption and safe experimentation" — trailing purpose clauses that assert impact without a fact. Either attach the number or end the sentence at the deliverable.
4. **Job-specific pitch text baked into reusable blocks** (ai-intro's "perception systems… safety-critical contexts"). In a system that assembles hundreds of résumés from these blocks, one stale audience-specific sentence contaminates every output it lands in. Blocks must be audience-neutral; pass-2 tailoring is where per-job framing belongs.
5. **Tag taxonomy drift.** Singletons (story:ml-applied-anomaly), synonyms (story:ml-eval / story:llm-eval, tech:csharp / tech:dotnet), and prestige tags that don't match content (story:leadership on ms-azure-devops, story:ai-applied on ms-merge-conflict). Because the selector matches on literal tag text with only a 200-char content snippet as backup, taxonomy hygiene _is_ routing accuracy. Keep a canonical tag list next to blocks.json and lint new blocks against it.
6. **The newer 2025–2026 blocks are the model.** ms-perf-caching, ms-dynamic-resolver, ms-build-break-analysis, and the proj-_ one-liners are already at or above Resume 13's bar (named systems, real denominators, honest negative results). The palette's problem is confined to the early-written summary and ai-_ blocks; new blocks should be drafted against §1-3 above.
