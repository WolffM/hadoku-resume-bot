# Public-access sweep — anonymous recruiter simulation

> ## ⚠️ CORRECTION (2026-08-12, same day — verified server-side)
>
> **The Playwright browser used for this sweep was NOT anonymous.** The Playwright
> MCP uses a persistent profile (`~/.cache/ms-playwright-mcp`) that carried the
> owner's real `hadoku_session` cookie from earlier in-browser verification
> sessions. Every finding made _through the browser_ saw the owner's
> authenticated view. Verified with genuinely-anonymous curl:
>
> - **Job Platform: NOT a public leak.** Anonymous: `/jobplatform/api/profiles` → 403,
>   `?state=applied` → 401, `/session/whoami` → `{"valid":false,"userType":"public"}`.
>   The profile + "applied" badges in `jobplatform-anonymous.png` are the owner's own
>   session. The worker code gates profiles (friend+) and never joins job_states unauthed.
> - **Watch Party: leader tokens NOT exposed.** Anonymous `/watchparty/api/rooms`
>   returns viewer keys + `leader_occupied` only. The `cedar-ridge-BF…` leader link was
>   authenticated-view rendering.
> - **TenHands: NOT publicly over-exposed.** Anonymous API → 401 `{"required":"friend"}`
>   (the 2026-07-14 whoami-delegation fix is holding). The "operator buttons" view was
>   the owner's session.
> - **Data Platform: NOT publicly browsable.** Anonymous → 401. The VOD archive was
>   the owner's view.
> - **Conjure / Pygmalion / Promptsmith: anonymous gets a bare 401**, not the working
>   UI described below.
>
> **Corrected anonymous status matrix (curl -L, 2026-08-12):**
> 200 — home, resume, resume PDF, contact, printtool, aggregator, task, watchparty,
> jobplatform (UI shell only; all personal data properly gated).
> 401 (bare, no gate card) — tenhands, dataplatform, conjure, pygmalion, promptsmith.
> 404 — /jobs, /tube, scraper.hadoku.me root.
>
> **Findings that STAND** (HTTP-status based, not browser-based): the 9/17 private
> GitHub links, the three broken resume "Live" links, and — _strengthened_ — the
> "no gate explains itself" finding: five résumé-advertised apps greet recruiters
> with raw 401 JSON and no story. The gate-card proposal in §3 remains the fix.
>
> **Process rule going forward:** "anonymous" web checks must use curl/WebFetch or a
> verified-fresh browser context, never the persistent Playwright MCP profile.

**Date:** 2026-08-12 · **Method:** Playwright profile (later found to be session-authenticated — see correction) + anonymous curl.
**Scope:** every app linked from https://hadoku.me/ plus every URL advertised by a `section:projects` block in `hadoku_site/scripts/resume/blocks.json` (the resume's own project links), plus the resume surface itself.

Categories: **PUBLIC** (fully usable demo) · **PARTIAL** (view-only / some features gated) · **GATED-explained** (gate says what it is + how to ask) · **GATED-dead-end** (gate with no story) · **BROKEN** (error/404/blank).

## 1. Access matrix

### Web apps

| App              | URL                             | Anonymous experience             | Notes                                                                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home (yggdrasil) | hadoku.me                       | **PUBLIC**                       | Loads clean, 3 scene variants, 12 apps linked, ambient music. Only benign WebGPU→WebGL2 fallback warnings. Site-wide `/favicon.ico` 404s.                                                                                                                                              |
| Resume           | hadoku.me/resume                | **PUBLIC**                       | Full resume renders; .pdf/.md/.json download buttons; chat bot answered a test question well in ~5s.                                                                                                                                                                                   |
| Resume PDF       | hadoku.me/resume/api/resume.pdf | **PUBLIC**                       | 200, valid `application/pdf`, ~30 KB.                                                                                                                                                                                                                                                  |
| Contact          | hadoku.me/contact               | **PUBLIC**                       | Form + working scheduler (calendar, durations, Jitsi/Discord/Meet). Exactly what a recruiter needs.                                                                                                                                                                                    |
| Print Tool       | hadoku.me/printtool             | **PUBLIC**                       | 6 modes, "API Online" badge, usable immediately.                                                                                                                                                                                                                                       |
| Conjure          | hadoku.me/conjure               | **PUBLIC (surface)**             | Full generate UI, "engine online · 16 queued". No gate visible anywhere; whether an anonymous Generate actually runs on the GPU was deliberately not tested. No explanation of tiers/keys.                                                                                             |
| Pygmalion        | hadoku.me/pygmalion             | **PUBLIC (surface)**             | "online" badge, three story modes, empty story list. Same caveat as Conjure: no visible gate, no key story.                                                                                                                                                                            |
| Promptsmith      | hadoku.me/promptsmith           | **PUBLIC**                       | Prompt builder loads with 2,217 catalogue images / 44k chunks. Content domain is anime/furry character art ("Body", "Face", "Species & Tail" categories) — see recommendation.                                                                                                         |
| OSS Aggregator   | hadoku.me/aggregator            | **PUBLIC**                       | Full dashboard: 100 issues, 197 projects, live scores. Great anonymous demo.                                                                                                                                                                                                           |
| Job Platform     | hadoku.me/jobplatform           | **PUBLIC — leaks personal data** | Anonymous visitor auto-lands in the owner's real profile (`?profile=65b7…`): sees "Matthaeus" profile, 3,000 postings, and **"applied" badges on specific jobs** (e.g. OpenAI Principal SWE) plus edit/hide/new-profile buttons. A recruiter can see where else the owner has applied. |
| TenHands         | hadoku.me/tenhands              | **PUBLIC — over-exposed**        | Pipeline selector loads; OSS pipeline view shows live assignments, repo health (197 repos), and operator buttons (Refresh All, Signoff, Report) to anonymous users. Impressive demo but shows admin controls with no read-only framing.                                                |
| Task Manager     | hadoku.me/task                  | **PUBLIC**                       | Loads a clean empty "main" board with create/share controls. Fine anonymous demo, though an empty board undersells the 40k-LOC story.                                                                                                                                                  |
| Watch Party      | hadoku.me/watchparty            | **PUBLIC — leaks leader tokens** | Room list loads; joined a room anonymously (auto-identity "Frieren", chat works). But the lobby prints **Leader links with embedded tokens** (e.g. `cedar-ridge-BF2658055A23D1AD`) — any visitor can seize leader control of any room.                                                 |
| Data Platform    | hadoku.me/dataplatform          | **PUBLIC**                       | Redirects to `/dataplatform/tube/` — the owner's full personal gaming VOD archive (2019–2026) is anonymously browsable. Works well; confirm this exposure is intentional.                                                                                                              |

### Resume "Live" links that don't match reality

| Resume block      | Advertised URL    | Result                                                                                                                                                                                                     |
| ----------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| proj-jobplatform  | hadoku.me/jobs    | **BROKEN** — 404 ("Not found — hadoku.me"). Real app is at `/jobplatform`.                                                                                                                                 |
| proj-dataplatform | hadoku.me/tube    | **BROKEN** — 404. Real app is at `/dataplatform` (which redirects to `/dataplatform/tube/`).                                                                                                               |
| proj-scraper      | scraper.hadoku.me | **GATED-dead-end** — root returns bare FastAPI JSON `{"detail":"Not Found"}`. (`/docs` is actually a live public Swagger UI, but nothing tells a visitor that — and it probably shouldn't be open anyway.) |

### GitHub links on the resume (anonymous HTTP status)

| Repo                | Status            | Repo               | Status     |
| ------------------- | ----------------- | ------------------ | ---------- |
| tenhands            | **404 (private)** | hadoku-trader      | 200 public |
| hadoku-scraper      | **404 (private)** | vibecheck          | 200 public |
| hadoku_site         | **404 (private)** | hadoku-printTool   | 200 public |
| hadoku-watchparty   | **404 (private)** | hadoku-resume-bot  | 200 public |
| hadoku-pygmalion    | **404 (private)** | hadoku-contact-ui  | 200 public |
| hadoku-dataplatform | **404 (private)** | hadoku-aggregator  | 200 public |
| hadoku-conjure      | **404 (private)** | hadoku-task-mobile | 200 public |
| hadoku-jobplatform  | **404 (private)** | hadoku-task        | 200 public |
| brave-quartet       | **404 (private)** |                    |            |

**9 of 17 GitHub links 404 for anonymous visitors — including 7 of the 8 tier-1 canonical projects.** Every tier-1 "GitHub" link except hadoku-task is a dead end for the person the resume is written for. (proj-promptsmith has no links at all — neither GitHub nor Live.)

## 2. Per-app recommendations

| App                      | Verdict                             | Reasoning                                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Home                     | Fine as-is                          | Polished, fast, zero errors; add a `/favicon.ico` to kill the one console 404.                                                                                                                                                                                                             |
| Resume + PDF + chat      | Fine as-is                          | The whole surface works anonymously end-to-end; chat gives good answers.                                                                                                                                                                                                                   |
| Contact                  | Fine as-is                          | Best-in-class for a recruiter: message + self-serve scheduling.                                                                                                                                                                                                                            |
| Print Tool               | Fine as-is                          | Genuinely usable public demo.                                                                                                                                                                                                                                                              |
| Aggregator               | Fine as-is                          | Live data makes the resume claim self-evident.                                                                                                                                                                                                                                             |
| Task Manager             | Needs a public demo mode (light)    | Loads fine but empty; seed a read-only example board so the first 30 seconds show what 40k LOC bought.                                                                                                                                                                                     |
| Watch Party              | **Needs fixing**                    | Stop rendering Leader (token) links to anonymous visitors — show them only to authed friends, or move leader claim behind the key gate.                                                                                                                                                    |
| Job Platform             | **Needs fixing (priority)**         | Anonymous read of the owner's real job hunt — including "applied" companies — is a privacy leak a recruiter _will_ see. Gate the profile data (friend/admin tier per the vault ACL) and give anonymous visitors either a demo profile or the standard gate card.                           |
| TenHands                 | Needs a public demo mode            | Data read is a nice demo, but operator buttons (Signoff, Refresh All) shouldn't render for anonymous users; present a read-only "tour" view.                                                                                                                                               |
| Data Platform            | Fine if intentional                 | Public VOD library works well; confirm the owner wants 7 years of personal recordings public. Fix the resume link (`/tube` → `/dataplatform`).                                                                                                                                             |
| Conjure                  | Needs a "request access" affordance | UI implies anyone can generate on the owner's GPU; either it silently fails (confusing) or it works (abuse risk). Add the standard gate card at generate-time.                                                                                                                             |
| Pygmalion                | Needs a "request access" affordance | Same as Conjure: "online" + start buttons with no explanation of what happens without a key.                                                                                                                                                                                               |
| Promptsmith              | Needs a decision, then a link       | It's linked from the homepage but the resume block has no Live/GitHub link. Either add the Live link to the resume block, or unlink it from the homepage if the content domain isn't something to show recruiters. Be deliberate — it's one click from the resume's "Live" hadoku.me link. |
| Scraper                  | **Needs fixing**                    | Resume "Live" link lands on `{"detail":"Not Found"}`. Serve a small landing page at the root (what it is, stats, gate card) and consider closing public `/docs`.                                                                                                                           |
| `/jobs`, `/tube` aliases | **Needs fixing (trivial)**          | Two resume Live links 404. Either add edge-router redirects (`/jobs`→`/jobplatform`, `/tube`→`/dataplatform`) or fix the URLs in `blocks.json`. Redirects are safer — the PDF is already in recruiters' hands.                                                                             |
| GitHub links             | **Needs fixing (priority)**         | Make the 9 private repos public (or publish sanitized mirrors), or drop the GitHub link from blocks whose repo can't be public. A resume whose flagship "GitHub" links 404 reads as inflated.                                                                                              |

## 3. Proposed STANDARD key-request pattern

Today there is no gate anywhere — apps are either fully open or fail silently/404. One consistent pattern, shipped once as a shared component/route in hadoku_site and reused by every child app:

**A. One shared "gate card" component (`@wolffm/themes` or a tiny `@wolffm/gate` package).**
Rendered by any app when an anonymous user hits a gated feature (or by the edge router for fully-gated routes). Always the same four elements:

1. **What this is** — one sentence pulled from the same registry that feeds the homepage ("Conjure is a multi-tenant AI image/video/3D studio running on my personal GPU.").
2. **Why it's gated** — one sentence ("It runs on my own hardware, so generation requires a friend key.").
3. **What you can still do** — link to the read-only/demo surface if one exists, plus GitHub + the resume block.
4. **How to get access** — a single canonical CTA: **"Request a key → hadoku.me/contact?about=<app>"**. The existing contact form already does messages + scheduling; adding an `about` query param that pre-fills the message ("I'd like an access key for Conjure — I'm …") means zero new backend. Keys continue to be issued manually through the existing vault/ACL system.

**B. One canonical URL convention.** Every app answers `/<app>/about` (or the root when fully gated) with the gate card. The edge router can serve it generically from the app registry, so apps that never implemented it still get a correct gate instead of a JSON 404 — this fixes scraper.hadoku.me for free.

**C. Three declared tiers per app in the registry** (already conceptually present in the KV key registry): `public` (full demo), `demo` (read-only view + gate card on write actions), `keyed` (gate card everywhere). The homepage can badge each app with its tier so a recruiter knows _before_ clicking what they'll get.

**D. API contract:** gated endpoints return `401` with a JSON body `{ "gate": "<app>", "info": "https://hadoku.me/<app>/about" }` — never a bare 404 — so UI widgets can render the card instead of spinning or silently failing.

## 4. Screenshots

- `docs/review/home.png` — homepage, anonymous, tree scene.
- `docs/review/resume.png` — resume surface with chat widget, anonymous.
- `docs/review/jobplatform-anonymous.png` — the owner's personal job-search profile as seen with zero credentials (evidence for the priority fix).

## Worst findings, ranked

1. **9/17 resume GitHub links are private → 404** (7 of 8 tier-1 projects). The resume's strongest proof-of-work links are dead for its intended audience.
2. **/jobplatform exposes the owner's real job hunt anonymously**, including which companies he's applied to — visible to any recruiter.
3. **Three resume "Live" links are broken** (`/jobs`, `/tube`, `scraper.hadoku.me` root).
4. **Watchparty leaks room-leader tokens** to anonymous visitors.
5. **No app anywhere explains gating or how to request a key** — the gate pattern in §3 doesn't exist yet in any form.
