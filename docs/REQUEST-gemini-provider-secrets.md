# Secret request: Gemini as an overflow inference provider for resume-api

**To:** hadoku_site operator · **From:** hadoku-resume-bot · **Date:** 2026-09-15
**Code is already merged and inert.** resume-bot `3.10.0` declares the provider
entries; `createLLMClient` skips any provider whose key binding is absent, so
nothing changes until the secrets land. Nothing here is urgent-by-breakage —
it is throughput.

---

## 1. Why (the `--why` string, in one sentence a reviewer can check)

> Groq's free tier caps 8,000 tokens per minute and one `/tailored-resume`
> spends ~15.2k across its two passes, so bursts cannot be served at all;
> Gemini's free tier is bounded by requests per minute instead, so it absorbs
> exactly the failure Groq cannot.

The longer version, with the evidence:

- **One generation never fits in a minute.** Already documented in
  `workers/resume-api/wrangler.toml`: ~15.2k tokens across two passes against an
  8k TPM ceiling. Generations get through only by crossing the minute boundary.
- **Draining an apply queue is nothing but bursts.** On **2026-09-14** a
  33-application drain exhausted the org-wide 200k/day budget mid-run. The
  symptom was `502` from the service binding, because resume-api turns the
  provider's `429` into a `500` and the binding reports that as `502`; the real
  message was only in the body:
  `429 ... on tokens per minute (TPM): Limit 8000, Used 3924, Requested 7087`.
  Three applications parked at `needs_manual`.
- **The 200k/day is org-wide, not per key**, so a neighbour can starve this
  account — watchparty's subtitle recaps did on 2026-09-01.
- **The chain already falls over to the NEXT provider on a 429 rather than
  waiting** (`sendChatCompletion`, `worker/src/llm.ts`). A second entry turns a
  dead request into one wasted round-trip. That is the entire fix.

Groq stays **first**. Every prompt, every token budget and the block-selection
JSON contract were measured against `gpt-oss-120b`. Gemini is overflow, not a
replacement; reordering it would be a quality decision, not a throughput one.

---

## 2. What is requested

Two secrets delivered to the **`resume-api`** Cloudflare worker. The second is
optional — see §5 before granting it.

| worker env binding (what the code reads) | suggested vault key       | required? |
| ---------------------------------------- | ------------------------- | --------- |
| `GEMINI_API_KEY`                         | `RESUME_GEMINI_API_KEY`   | yes       |
| `GEMINI_API_KEY_2`                       | `RESUME_GEMINI_API_KEY_2` | optional  |

**Values are owner-supplied, not generated.** The owner already holds both keys,
so this is `set-many` + `provision-secret`, not `provision-secret --generate`.
The values have not passed through this repo or an agent transcript.

### A naming decision for you, not me

`SECRETS.md` says to scope-prefix an app-specific key and reserve top-level
names for ecosystem-wide values. By that rule these should be
`RESUME_GEMINI_API_KEY`, mapped to the `GEMINI_API_KEY` binding via
`env_mapping` — which is what the table above assumes.

The counter-argument is `GROQ_API_KEY`'s precedent: it is top-level, and
correctly so, because the Groq **organisation** is shared (watchparty spent this
account's budget). If Gemini is expected to stay resume-api's alone, scope-prefix
it. If another app will want it, take the top-level name now and skip the
mapping. **I have assumed app-specific; overrule freely** — the only hard
constraint is that the worker binding is named `GEMINI_API_KEY` /
`GEMINI_API_KEY_2`, because that is what `LLM_PROVIDERS` reads.

---

## 3. The change needed in hadoku_site

`scripts/admin/update_cloudflare_secrets.py`, `WORKER_CONFIGS['resume-api']`
(currently around line 212):

```python
'resume-api': {
    'path': 'workers/resume-api',
    'secrets': ['GROQ_API_KEY', 'GEMINI_API_KEY', 'EDGE_AUTH_SECRET'],
    'description': 'Resume chatbot inference keys (Groq primary, Gemini overflow) + edge-auth provenance token',
    'env_mapping': {
        'GEMINI_API_KEY': 'RESUME_GEMINI_API_KEY',
    },
},
```

Add `'GEMINI_API_KEY_2'` to `secrets` and the mapping only if §5 applies.

`workers/resume-api/wrangler.toml` already carries the explanatory comment for
`GEMINI_API_KEY` (hadoku_site `99ac7fc8`) — it will need a one-line amend if you
choose a different vault key name than the one it records.

---

## 4. Suggested sequence

1. Owner writes the values (`set-many`, idempotent, value-only — no catalogue,
   no ACL, no push).
2. `provision-secret RESUME_GEMINI_API_KEY --why "<the sentence in §1>" --confirm`
   — catalogue entry, ACL grants, CF push to every worker whose `WORKER_CONFIGS`
   consumes it, GitHub refresh, and a delivery verification against Cloudflare.
3. Confirm resume-api actually holds it (step 2 refuses to report success while
   a declared surface is unserved, so this is belt-and-braces).

**No new service key is needed**, and **no local-dev grant is needed**:
`hadoku-resume-bot/.devvault.json` declares only `RESUME_FRIEND_KEY`, and
nothing in this request adds a `process.env` read for local dev. This is
worker-runtime only.

---

## 5. Before granting the second key

**Gemini free quota is metered per project, not per key.**

- Two keys from **different** Google accounts → two independent allowances, and
  the second slot genuinely doubles headroom.
- Two keys from the **same** account → one shared allowance, and the second entry
  buys nothing but a wasted round-trip once the first is spent.

That second case is precisely how `CEREBRAS_API_KEY` failed here (2026-09-06 to
2026-09-09): a provider that errored 100% of the time was invisible, because the
chain treats a failure as a fallthrough. If the two keys share an account, bind
only `GEMINI_API_KEY` and leave the other unprovisioned — the slot is inert
without it.

Also worth stating plainly, because it shaped the owner's thinking: a consumer
**Gemini Advanced / Google One AI Premium subscription grants no API quota**.
Consumer subscriptions and API tiers are separate systems; the paid API tier is
activated per Cloud project at `aistudio.google.com/api-keys`. Unless that has
been done, both keys are free-tier — which is still the right fix here, because
the failure being solved is a per-minute _token_ ceiling, not a volume problem.

---

## 6. How to tell it worked

A cold generation that previously 502'd should return 200. From a repo with a
service-tier grant:

```sh
curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' -X POST \
  "https://hadoku.me/jobplatform/api/jobs/<a-job-with-no-packet>/resume?ownerName=hadoku" \
  -H "X-User-Key: $HADOKU_SERVICE_KEY" -H 'Content-Type: application/json' -d '{}'
```

Two back-to-back cold generations inside one minute is the real test: that is
the case Groq alone cannot serve, and the case this request exists to fix.

Negative check worth doing once, given the Cerebras history: if Gemini is bound
but the model name or endpoint is wrong, every Gemini call 4xxs and the chain
silently falls back to Groq — behaviour identical to not having added it. The
endpoint (`https://generativelanguage.googleapis.com/v1beta/openai/`) and model
(`gemini-3.8-flash`) were taken from ai.google.dev's OpenAI-compatibility page
rather than recalled, but they should be confirmed against a real 200 before
this is considered done.
