---
title: Resume Bot
summary: >-
  A two-panel résumé at [hadoku.me/resume](https://hadoku.me/resume): the
  résumé itself on the left, and an AI chat that answers questions about it
  on the right. The same content and the same AI tailoring also power
  per-job résumés and cover letters for other apps on hadoku.me, through its
  worker API. Chat and the résumé are open to anyone; tailoring and content
  management need an account.
features:
  - name: The résumé
    summary: A document-formatted résumé, with a PDF download, instead of a raw markdown dump.
    anchor: the-résumé
  - name: Chat
    summary: Ask an AI questions about the background behind the résumé; it answers from the résumé's own content.
    anchor: chat
  - name: Link-tailored variants
    summary: A résumé built for one posting, behind its own shareable link, falling back to the full résumé if the link expires.
    anchor: link-tailored-variants
    tier: friend
  - name: Tailored résumés and cover letters
    summary: Generate a résumé and cover letter tailored to one job description, for this app or another on hadoku.me.
    anchor: tailored-résumés-and-cover-letters
    tier: friend
  - name: The content builder
    summary: An admin UI to edit the résumé's content blocks directly, without redeploying code.
    anchor: the-content-builder
    tier: admin
trivia:
  - 'The first commit held 1,514 lines and 17 files; the very next one, labelled "first test", touched 18 files and added 3,427 lines (`6ca5525`, `79a0017`).'
  - "A shared link's slug is 72 bits of random, URL-safe base64 — unguessable by design, so revoking it is the only way to kill it (`602066f`)."
  - 'The free LLM tier this app runs on caps 8,000 tokens a minute, and one tailored résumé alone spends about 15,200 across its two passes — so a single generation can only ever succeed by straddling the boundary between two minutes (`d193250`).'
  - "Versioning used to be a pre-commit hook bumping the patch on every commit, including ones that changed nothing shippable; it is CI's job now, computed once at publish time (`4cbbe5b`)."
---

# Resume Bot

Resume Bot is a dual-purpose package: a browser widget that shows a résumé
and lets a visitor chat with an AI about the background behind it, and a
worker API that turns a job description into a tailored résumé and cover
letter on demand. It lives at
[hadoku.me/resume](https://hadoku.me/resume), and the same worker API backs
per-job tailoring for other apps in the hadoku.me family, including
[Job Platform](https://github.com/WolffM/hadoku-jobplatform).

Chatting and reading the résumé need no account. Minting a tailored link,
generating a résumé or cover letter for a specific job, and editing the
résumé's own content all need to be signed in — friend tier and up for
tailoring, admin for editing content.

## Where to read next

| You want to                     | Read                               |
| ------------------------------- | ---------------------------------- |
| use it                          | [features.md](features.md)         |
| run it, change it, or deploy it | [contributing.md](contributing.md) |
| how it got here                 | [history.md](history.md)           |
| the odd facts                   | [trivia.md](trivia.md)             |

## How it fits together

The résumé is not markdown checked into this repo: it is a set of tagged
content blocks held in a Cloudflare KV store, assembled into either the full
résumé or a per-job variant. An LLM picks and lightly rewrites blocks for a
tailored résumé; a deterministic assembler does the rest, so the same
content never has to be retyped for a new job application.

## Trivia

The full list, each with its source, is in [trivia.md](trivia.md).
