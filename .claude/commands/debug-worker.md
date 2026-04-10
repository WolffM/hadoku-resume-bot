Debug the worker API. Context:

- Worker source: `worker/src/`
- Entry point: `worker/src/index.ts` exports `createResumeHandler(basePath, options)`
- Router: Hono, routes prefixed with basePath (typically `/resume/api`)
- Endpoints: `/chat` (POST), `/resume` (GET), `/system-prompt` (GET), `/tailored-resume` (POST), `/cover-letter` (POST)
- Rate limiting: `worker/src/rate-limit.ts` -- per-IP via RATE_LIMIT_KV
- LLM client: `worker/src/llm.ts` -- Groq via OpenAI SDK, key from GROQ_API_KEY binding
- Resume content: `worker/src/resume.ts` -- fetched from CONTENT_KV
- Resume blocks: `worker/src/blocks.ts` -- modular resume sections for tailored output
- Bindings: GROQ_API_KEY, RESUME_SYSTEM_PROMPT, RATE_LIMIT_KV, CONTENT_KV
- This worker has no wrangler.toml -- it's deployed by hadoku_site's wrangler config
- To test locally, use miniflare or deploy via hadoku_site
