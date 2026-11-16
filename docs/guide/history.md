# Resume Bot: history

How Resume Bot grew from a chat demo into the tailoring engine behind
several apps' job applications.

## A chat widget and a résumé viewer (November 2025)

The first commit held 1,514 lines across 17 files (`6ca5525`); the very
next, labelled "first test", touched 18 files and added 3,427 lines
(`79a0017`), both the same day. Within a week there was a working Express
server with a chat endpoint and a résumé viewer component (`610e727`,
2025-11-22).

## Becoming a package (March 2026)

On 2026-03-17 the Express server was removed outright and the worker logic
extracted into its own published export, with the owner's display name
pulled out as a parameter rather than hard-coded (`961ff4a`). From here the
package has shipped two things from one build: a UI component and a worker
API.

## Tailoring arrives (April 2026)

`POST /tailored-resume` and `POST /cover-letter` landed together on
2026-04-02, built on a new content-block model: each piece of résumé
content — a job, a project, a skill group — stored as its own tagged block,
so an LLM could select a relevant subset per job rather than rewriting the
whole document (`6011f58`).

## Shared tiers and link-tailored variants (July 2026)

Tier enforcement moved in-worker rather than trusting the edge alone
(`3ae1e5c`, 2026-07-13), and the next day the tailoring routes opened to
service callers as well as signed-in people (`06d42f1`, 2026-07-14) — the
same day [Job Platform](https://github.com/WolffM/hadoku-jobplatform) shipped
the feature that calls them (`WolffM/hadoku-jobplatform@a6595c0`, also
2026-07-14). A day later, a link-tailored résumé became its
own durable object: an unguessable short link that serves a job-specific
résumé and cover letter, falling back to the full résumé if the link is
ever revoked (`602066f`, 2026-07-15).

## The content builder (July 2026)

The afternoon of 2026-07-15 also shipped an admin-only API for editing
content blocks directly in the KV store (`11c4788`), followed within
minutes by the React admin UI that drives it, replacing a local
Python tool that only ever ran on the owner's own machine (`7d32d08`).

## A protected branch, briefly unpushable (August 2026)

A pull-request check added on 2026-08-03 (`42641b0`) made `main` a
protected branch. The automated weekly `@wolffm/*` update bot had always
pushed straight to `main` with the default token, which cannot satisfy a
required check, but the gap stayed invisible until a publish storm finally
gave it something to commit: ten protected-branch rejections in a row on
2026-08-04, each buried under the push-retry loop's own rebase attempts,
before the workflow was given a token that could bypass the rule, the
retry loop was taught to fail fast on this exact rejection instead of
retrying it, and a red streak started reporting itself instead of waiting
for the next day's digest (`9c3250f`).

## The résumé becomes a document (August 2026)

Until 2026-08-24 the résumé rendered as one undifferentiated markdown pass:
every heading level collapsed to the same couple of font sizes, so a `###`
job title was, by pixel size, smaller than the body text under it. A
section-aware renderer fixed that by splitting on the assembler's own
heading boundaries and styling each section for what it actually is
(`2ff1b64`).

## The system prompt moves into content (September 2026)

Every other piece of résumé content lived in the KV content store except
one: the chat's system prompt, which came from a Worker secret. On
2026-09-03 it moved into the same store as everything else, with the secret
kept only as a fallback (`0cb6129`); the next day's docs confirmed nothing
still required the secret to be set at all (`2bfa8d9`).

## Versions become CI's (November 2026)

Through most of this repo's life, a pre-commit hook bumped the package
version on every commit, shippable or not. On 2026-11-01 that hook was
retired in favour of a CI step that computes one version, once, at publish
time (`4cbbe5b`).

## Trivia

The worker API and the UI component were extracted and parameterized in the
same commit that removed the old Express server, which is why there is no
era in this history called "removing the local dev server" — by the time it
was gone, its replacement already existed (`961ff4a`).
