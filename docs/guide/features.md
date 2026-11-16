# Resume Bot: features

What Resume Bot does and how to use it. How it works inside is in
[contributing.md](contributing.md). "Friend" and "admin" are hadoku.me
tiers: an account the owner has vouched for, and the owner's own accounts.

## The résumé

**What it does.** Shows the résumé as a formatted document rather than a
flat markdown dump: headings, job titles and skill rows are each styled for
what they are, because the same markdown construct (`###`, `**bold**`)
means something different depending on which section it is in. A **Download**
toolbar offers the same content as a server-rendered PDF, plain markdown or
JSON.

**How to use it.** Open [hadoku.me/resume](https://hadoku.me/resume) — no
sign-in needed. Use the download buttons for a copy to attach elsewhere.

**What it does not do.** There is no way to edit the résumé from this view;
editing is the [content builder](#the-content-builder), and it is
admin-only.

## Chat

**What it does.** An AI chat panel beside the résumé answers questions about
the background it describes, grounded in the résumé's own content.

**How to use it.** Type a question in the chat panel. No sign-in is needed.

**What it does not do.** Requests are rate-limited per visitor (30 per
minute); past that, the chat asks you to wait. The chat answers from the
résumé's content — it is not a general-purpose assistant.

## Link-tailored variants

**What it does.** A résumé and (optionally) a cover letter built for one
specific job, published behind its own short, unguessable link. Opening the
link without being signed in shows the tailored content directly; if a link
expires or is revoked, it falls back to the full résumé rather than showing
an error, so a link someone already has never breaks.

**How to use it.** Minting a variant (from markdown, specific content
blocks, or straight from a job posting) and listing or revoking existing
ones needs an account at friend tier or above, through the worker API.

**What it does not do.** There is no browser UI in this repo for minting a
variant by hand; that is done by the apps that call this one (see
[Tailored résumés and cover letters](#tailored-résumés-and-cover-letters)),
or directly against the API.

## Tailored résumés and cover letters

**What it does.** Given a job title, company and description, generates a
résumé (two LLM passes: picking which content blocks fit, then a light
rewrite) and a cover letter (one pass) in markdown, cached for 30 days per
job (content-addressed by job title, company and description, so a changed
posting gets a fresh key on its own) so the same posting does not
regenerate work every night (`f3f3f18`). This is the API that
[Job Platform](https://github.com/WolffM/hadoku-jobplatform)'s **Generate
packet** button calls.

**How to use it.** Friend tier and up, through the worker API
(`/tailored-resume`, `/cover-letter`, `/application-extras`). Another
hadoku.me app can call it too, authenticated as a service.

**What it does not do.** It does not submit anything anywhere — it only
produces text, the same way [Job Platform](https://github.com/WolffM/hadoku-jobplatform)'s
own packet generation does.

## The content builder

**What it does.** An admin page that edits the résumé's content blocks —
experience, projects, skills, education, summary, header — directly, each
tagged for the tailoring LLM to prefer, with search, tag and type filters, a
manual sort order, and a feedback note per block.

**How to use it.** Admin tier only, at the builder's own page. It writes
straight to the same content store the résumé and the tailoring API read
from, so a change is live immediately, with an **Export** button for a
backup copy.

**What it does not do.** It replaced a local Python review tool that only
ran on the owner's own machine; there is no equivalent self-service tool for
anyone below admin.

## Trivia

The free LLM tier this app runs on caps requests at 8,000 tokens a minute,
and one tailored résumé alone spends about 15,200 tokens across its two
passes — enough that a single generation can only ever finish by straddling
the boundary between one minute and the next.
