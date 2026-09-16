# Handoff: resume-api's Gemini provider is bound but every call fails

**To:** hadoku_site operator · **From:** hadoku-jobplatform side · **2026-09-15**

**Not an outage.** Groq still serves every request; Gemini was added as overflow
and is contributing nothing. The cost is throughput, not availability.

**What I need from you is one thing:** three curls with the Gemini key. Nobody
but the operator can run them (see §5), and every remaining hypothesis dies on
the first one.

---

## 1. Symptom

`POST /jobs/:id/resume` → `502` whenever the request actually reaches Gemini,
i.e. whenever Groq is rate-limited. The body:

```
resume-api 500: {"error":"Failed to generate tailored resume",
                 "message":"400 status code (no body)"}
```

Reproduce — two cold generations inside one minute, because Groq's 8k TPM
cannot serve two ~7.6k passes and the second is forced onto Gemini:

```sh
cd ~/repos/hadoku-scraper
node ../hadoku_site/scripts/secrets/dev-vault.mjs -- bash -c '
B=https://hadoku.me/jobplatform/api; H="X-User-Key: $HADOKU_SERVICE_KEY"
for j in <two job ids never generated before>; do
  curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" -X POST \
    "$B/jobs/$j/resume?ownerName=hadoku" -H "$H" -H "Content-Type: application/json" -d "{}"
done'
```

Expect `200 ~5s` then `502 ~0.6s`. **Use jobs that have never been generated** —
a cached hit returns `200` in ~0.3s and looks like success. That false positive
cost me two wrong "it works" calls.

---

## 2. What has been ruled out

| checked              | result                                                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wrong key bound      | **was true, now fixed.** The worker held watchparty's `GEMINI_API_KEY`; the `env_mapping` to `GOOGLE_GEMINI_AGENT_API_KEY_MATTHAEUS` had never been pushed from a checkout containing it (local tree was 6 commits behind). After pull + re-push the error moved **403 → 400** |
| Model id             | `gemini-3.8-flash` confirmed current default on ai.google.dev                                                                                                                                                                                                                  |
| Base URL             | no double slash — SDK builds `…/v1beta/openai/chat/completions` correctly                                                                                                                                                                                                      |
| Request body         | only `model`, `messages`, `temperature`, `max_tokens` — all standard                                                                                                                                                                                                           |
| Code deployed        | resume-bot 3.10.3 in `pnpm-lock.yaml`, CF deployment `03:38:28Z` — after the site deploy                                                                                                                                                                                       |
| Chain reaches Gemini | yes: the error changed the moment the key changed                                                                                                                                                                                                                              |

## 3. What is NOT known

**Whether this key works on Google's OpenAI-compatible surface at all.** It has
never been tested directly, with either auth header, because reading it requires
an ACL that neither jobplatform's nor hadoku_site's caller key has.

Everything above is inference from a bare status code. That is the actual
problem with this investigation.

## 4. The controlled comparison (this is the useful part)

Same key, same request body, one variable — the auth header. Measured in
production on 2026-09-15:

| header                        | result                                            |
| ----------------------------- | ------------------------------------------------- |
| `Authorization: Bearer <key>` | **403**, no body — never got past auth            |
| `x-goog-api-key: <key>`       | **400**, no body — auth accepted, request refused |

**403 versus 400 is the whole signal.** Google moved AI Studio keys from `AIza…`
to `AQ.Ab…`, and the newer form is not accepted as a Bearer token on this
surface. So `x-goog-api-key` is correct, and the remaining 400 is a different
fault further along.

The most likely candidate for that 400 is the documented "Multiple
authentication credentials received": the endpoint reads its own header AND
still sees an `Authorization`, so the SDK's header has to be genuinely removed.
`defaultHeaders: {Authorization: null}` drops it under openai 6.32 on Node —
which is how it was verified — but the 400 persisted on workerd, so it was still
reaching the wire there. **3.10.6 deletes it from the outgoing `Headers` in a
fetch wrapper**, which cannot be runtime-dependent.

If 3.10.6 still returns 400, the header is not the remaining cause and §5 is the
way forward.

### Wrong turns, recorded so they are not repeated

1. **The original 403 was blamed on the header.** It was the wrong key — the
   worker held watchparty's. Fixed by pull + re-push, not by code.
2. **3.10.4 reverted to Bearer** on the theory that the header workaround had
   become the fault. The comparison above shows Bearer is strictly worse.
3. **Three conclusions were reached by reasoning from a bare status code and two
   were wrong.** The experiment that settled it — hold the key constant, change
   one header — was available from the first hour.
4. **A runtime behaviour was verified on Node and shipped to workerd.** The null
   defaultHeader genuinely works where it was tested and evidently not where it
   runs.

## 5. The three curls

Run these with the key. They are the entire ask.

```sh
K=<the value of GOOGLE_GEMINI_AGENT_API_KEY_MATTHAEUS>

# A — can the key see the API at all?
curl -s "https://generativelanguage.googleapis.com/v1beta/models" \
  -H "x-goog-api-key: $K" | head -c 600

# B — OpenAI surface, Google's header (what 3.10.3 sent)
curl -s -w "\nHTTP %{http_code}\n" \
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" \
  -H "x-goog-api-key: $K" -H "Content-Type: application/json" \
  -d '{"model":"gemini-3.8-flash","messages":[{"role":"user","content":"hi"}],"max_tokens":16}'

# C — OpenAI surface, Bearer (what 3.10.4 sends)
curl -s -w "\nHTTP %{http_code}\n" \
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" \
  -H "Authorization: Bearer $K" -H "Content-Type: application/json" \
  -d '{"model":"gemini-3.8-flash","messages":[{"role":"user","content":"hi"}],"max_tokens":16}'
```

Unlike our path these return a **JSON error body** with a named reason, which is
what has been missing all along.

| outcome                                  | meaning                                                           | fix                                                |
| ---------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| A errors `SERVICE_DISABLED`              | Generative Language API not enabled on that Cloud project         | enable it; nothing in our code changes             |
| A errors on referrer/IP restriction      | key has application restrictions; a Worker sends no referrer      | remove the restriction or mint an unrestricted key |
| A errors `ACCESS_TOKEN_TYPE_UNSUPPORTED` | the account's `AQ.` keys are not accepted by this REST surface    | see §6                                             |
| A OK, B OK, C fails                      | `authHeader: 'x-goog-api-key'` was right → revert 23af8f1         |
| A OK, C OK, B fails                      | Bearer is right → 3.10.4 is already the fix, just needs deploying |
| A OK, both B and C fail                  | the OpenAI surface will not serve this key → §6                   |
| all three OK                             | our worker is at fault, not the key → comes back to me            |

## 6. If the OpenAI-compatible surface cannot serve this key

Then the chain's core assumption — _"every entry must serve an OpenAI-compatible
API"_ — does not hold for Gemini, and the options are:

1. **An `AIza`-format key**, if the account can still mint one. Cheapest by far:
   no code change. Google now issues `AQ.` by default and some accounts cannot
   get `AIza` at all, so check before planning around it.
2. **A native-endpoint adapter** in `llm.ts` — `:generateContent` with
   `x-goog-api-key`, translating messages in and text out. Contained (one
   provider shape, ~40 lines) but it is the first non-OpenAI client in the chain
   and needs its own error/429 handling.
3. **A different second provider.** OpenRouter's `:free` ids rotate and a wrong
   one 400s on every call invisibly — which is exactly how Cerebras sat dead
   here for three days — so pick a model deliberately.

## 7. The thing worth fixing regardless

**No one but the operator can diagnose a secret this repo consumes.** That is
correct for values, but it meant every hypothesis here had to be tested by
publishing a package, waiting for the deploy chain, and reading a status code —
roughly ten minutes per bit of information, and three of those bits were wrong.

Worth considering: a read grant on this one key for one repo key, or a broker
endpoint that proxies a health-check call to a provider without disclosing the
secret. Either turns this class of problem from hours into one command.
