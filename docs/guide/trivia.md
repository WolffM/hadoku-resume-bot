# Resume Bot: trivia

The best facts about Resume Bot, each with its source.

## Beginnings

- The first commit held 1,514 lines across 17 files; the very next, labelled
  "first test", touched 18 files and added 3,427 lines — both on the same day
  (`6ca5525`, `79a0017`).
- A working Express server, chat endpoint and résumé viewer existed within a
  week of that first commit (`610e727`), and the server itself was gone 115
  days later, removed in the very same commit that published its
  replacement as a worker package (`961ff4a`).

## The same day, twice

- 2026-08-05 is this repo's busiest day on record, 32 commits (fact sheet,
  2026-11-16), and the headline change that day — dropping its own local
  copies of the theme system for a shared theme root (`e16eb19`) — landed on
  the exact same day as the equivalent refactor in Job Platform
  (`WolffM/hadoku-jobplatform@3a0e440`, also 2026-08-05). Neither repo's
  theme code had to be invented twice.
- 2026-07-14 is the day both halves of one cross-app feature shipped: this
  repo opened its tailoring routes to service callers (`06d42f1`), and
  [Job Platform](https://github.com/WolffM/hadoku-jobplatform) shipped the
  button that calls them, the same day
  (`WolffM/hadoku-jobplatform@a6595c0`).

## Decisions

- A link-tailored résumé's slug is 72 bits of random, URL-safe base64 —
  unguessable by design, so revoking it is the only way to kill a link
  (`602066f`).
- The free LLM tier this app runs on caps requests at 8,000 tokens a minute.
  One tailored résumé spends about 15,200 tokens across its two passes, so a
  single generation can only ever finish by straddling the boundary between
  one minute and the next, never by fitting inside one (`d193250`).
- A pull-request check added to protect `main` (`42641b0`, 2026-08-03) broke
  the very next morning's automated dependency-update push, which had
  always pushed straight to `main` with no special token. Ten
  protected-branch rejections failed in a row on 2026-08-04 before the
  workflow was given a token that could get past the rule, taught to fail
  fast on that exact rejection instead of retrying it, and given a status
  report so a red streak no longer waits for the next day's digest
  (`9c3250f`).

## Scale and shape

- 484 commits have landed on 118 distinct days over this repo's life (fact
  sheet, 2026-11-16).
- The most-rewritten file is `.github/workflows/publish.yml` at 29 commits —
  more than any application code (fact sheet, 2026-11-16).
- Versioning was a pre-commit hook bumping the patch on every commit,
  shippable or not, until 2026-11-01, when that job moved to a single CI
  step computed once at publish time (`4cbbe5b`).

## Trivia

Four of these are on the wiki's own page for this repo, from the front
matter of [index.md](index.md).
