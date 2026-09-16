# Recruiter E2E audit — hadoku.me resume

**Date:** 2026-08-17 · **Method:** anonymous curl with a real Chrome UA (no browser sessions used).
**Anonymity proof:** `https://hadoku.me/session/whoami` → HTTP 401, body `{"valid":false,"userType":"public"}` from the exact client used for every check below.

## What would give a recruiter pause in the first 60 seconds

1. **NEW — `scraper.hadoku.me` (hadoku-scraper "Live" link) returns a raw 404**: `{"detail":"Not Found"}` from FastAPI. Every other gated app returns a 401 gate (`{"error":"unauthorized","required":"friend"}`), which at least reads as "restricted." A 404 reads as _dead project_ — the worst possible signal for a resume link, and it's the only ~67k-LOC Python flagship in the Data section. Either route it through the same friend-gate (401) or give it a landing page.
2. **NEW — GitHub pinned repos undermine the resume story**: pins are `vibecheck`, `TTRPGSessionSummarizer`, `hadoku-resume-bot`, `hadoku-task`, `seaborn-ranked-animated`, `hadoku-aggregator`. The flagship `hadoku-tenhands` — now public and freshly pushed — is **not pinned**, while two old hobby scripts are. A recruiter who clicks through from the resume to the profile sees a different (weaker) portfolio than the one the resume sells.
3. **NEW (judgment call) — GitHub bio reads "i LOVE burning tokens"** with no profile README (`WolffM/WolffM` doesn't exist). Charming to insiders; to a recruiter skimming, it's the only self-description on an otherwise blank profile header. Company/location/blog fields are good (`@Microsoft`, Seattle WA, hadoku.me).
4. **Known — four "Live" links are auth-gated bare 401s** (`/tenhands`, `/pygmalion`, `/conjure`, `/dataplatform`): JSON error, no human-readable gate card. The resume _does_ pre-warn ("the rest are key-gated"), which softens this. Gate-card work is already tracked in the repo fan-out issues.

Nothing else in the first-60-seconds path is broken: page loads fast, PDF is clean, chat answers well, public demos all render.

## Link-status table (extracted from live resume content)

| Link (as on resume)                                | Status               | What a recruiter sees                                                                                                                                          |
| -------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://hadoku.me` (anchor)                       | 200                  | Clean landing page: "Matthaeus Wolff — Software Engineer", Resume/Contact/LinkedIn/GitHub links, theme picker                                                  |
| `https://hadoku.me/resume`                         | 301→200 (`/resume/`) | Full resume app, title "Matthaeus Wolff — Resume", chat widget present                                                                                         |
| `https://hadoku.me/task` (demo + hadoku-task Live) | 200                  | Task Manager app shell loads                                                                                                                                   |
| `https://hadoku.me/watchparty` (demo + Live)       | 200                  | Watch Party app shell loads                                                                                                                                    |
| `https://hadoku.me/printtool` (demo)               | 200                  | Print Tool app shell loads                                                                                                                                     |
| `https://github.com/WolffM/tenhands`               | 301→200              | Redirects to public `WolffM/hadoku-tenhands`: good description, README present, pushed today                                                                   |
| `https://github.com/WolffM/hadoku-task`            | 200                  | Public repo, README present, pushed today                                                                                                                      |
| `https://hadoku.me/tenhands` (Live)                | 401                  | `{"error":"unauthorized","required":"friend"}` — bare JSON (KNOWN)                                                                                             |
| `https://hadoku.me/pygmalion` (Live)               | 401                  | Same bare 401 (KNOWN)                                                                                                                                          |
| `https://hadoku.me/conjure` (Live)                 | 401                  | Same bare 401 (KNOWN)                                                                                                                                          |
| `https://hadoku.me/dataplatform` (Live)            | 401                  | Same bare 401 (KNOWN)                                                                                                                                          |
| `https://scraper.hadoku.me` (Live)                 | **404**              | `{"detail":"Not Found"}` — looks dead, not gated (**NEW**)                                                                                                     |
| `https://linkedin.com/in/mw5`                      | 200                  | Anonymous curl hits LinkedIn's reCAPTCHA interstitial; `www.` variant resolves to real public profile "Matthaeus Wolff - Microsoft \| LinkedIn". URL is valid. |
| `https://github.com/WolffM` (profile)              | 200                  | 64 public repos, active, but see pinned-repo + bio findings above                                                                                              |

Only two GitHub links appear on the resume (tenhands + hadoku-task) — matches expectation exactly.

## Pass/fail checklist

| Check                                                                                                                | Result                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/resume` loads anonymously and serves the app                                                                       | PASS                                                                                                                                |
| Markdown structure: `# Profile`, `# Experience`, `# Projects`, `# Technical Skills`, `# Education` each exactly once | PASS (plus `# Additional Experience` once, per skeleton)                                                                            |
| First-person summary in Profile                                                                                      | PASS ("I'm an engineer with 10+ years…")                                                                                            |
| hadoku.me anchor paragraph at top of projects page                                                                   | PASS (bold anchor + public-demos line)                                                                                              |
| `###` categories: AI & Agents / Data & Automation / Apps, Games & Tools, in order                                    | PASS                                                                                                                                |
| `/resume/api/resume.pdf` returns 200, `application/pdf`                                                              | PASS                                                                                                                                |
| PDF valid, 3 pages, US Letter                                                                                        | PASS (pdfinfo: 3 pages, 612x792)                                                                                                    |
| PDF contact: matthaeus@hadoku.me / 408-372-7884 / linkedin.com/in/mw5                                                | PASS (all three in page-1 header)                                                                                                   |
| GitHub links limited to tenhands + hadoku-task                                                                       | PASS                                                                                                                                |
| tenhands GitHub link resolves                                                                                        | PASS — **known 404 is resolved**: repo is now public, renamed `hadoku-tenhands`, old URL 301s correctly                             |
| Public demo links (/task, /watchparty, /printtool, /resume)                                                          | PASS (all 200, correct app titles)                                                                                                  |
| Gated Live links present a human-friendly gate                                                                       | FAIL (KNOWN — bare 401 JSON; tracked)                                                                                               |
| scraper.hadoku.me Live link                                                                                          | **FAIL (NEW — 404, reads as dead)**                                                                                                 |
| Homepage first-30-seconds                                                                                            | PASS (loads, clear identity, resume/contact/GitHub/LinkedIn links)                                                                  |
| Chat widget answers sensibly                                                                                         | PASS — asked about Microsoft AI-agent work; accurate, grounded answer citing 104 repos / MCP server / Copilot CLI, no hallucination |
| LinkedIn public URL resolves                                                                                         | PASS (content behind LinkedIn's wall as expected)                                                                                   |
| GitHub profile presentable anonymously                                                                               | PARTIAL — active (both linked repos pushed today) but pinned repos stale-skewed, no profile README, jokey bio                       |

## Owner-only follow-ups

1. **Fix or gate `scraper.hadoku.me`** so the resume's Live link stops 404ing (route through the friend-gate like the others, or serve a landing/gate card). This is the worst new finding.
2. **Re-pin GitHub repos** to mirror the resume: hadoku-tenhands, hadoku-task, plus 2–4 of pygmalion/conjure/dataplatform/watchparty as they go public. Unpin TTRPGSessionSummarizer and seaborn-ranked-animated.
3. **Consider a `WolffM/WolffM` profile README** and decide whether "i LOVE burning tokens" is the bio a recruiter should meet first.
4. **LinkedIn refresh** — public URL works; content polish needs an authed session, owner task.
5. (Tracked elsewhere) Gate-card UX for the four 401 Live links — already in the repo fan-out issues; no new action here.
