# @wolffm/resume-bot

**Guide:** [overview](docs/guide/index.md) · [features](docs/guide/features.md) · [contributing](docs/guide/contributing.md) · [history](docs/guide/history.md) · [trivia](docs/guide/trivia.md)

AI-powered conversational interface for interactive resume exploration — chat with an AI about my background, skills, and experience while browsing the resume itself.

**See it live:** [hadoku.me/resume](https://hadoku.me/resume)

This repo is the npm package that powers that widget. The rest of this README is for contributors working on the package itself; what it does and how it's built are in the [guide](docs/guide/index.md) above.

## Development

### Getting access

`pnpm install` and the friend-only API routes need your own credential; `pnpm dev`
needs none. Getting one is the same for every hadoku repo, so the steps live on one page:
**[hadoku.me/docs/contributing/#resume-bot](https://hadoku.me/docs/contributing/#resume-bot)**.
The identity to ask for is `resume-bot-service-key`.

### Local Development Setup

```bash
pnpm install   # outside the fleet: npx @hadoku/dev-vault -- pnpm install
pnpm dev       # opens http://localhost:5173, mounting the component directly
```

The rest of the commands, and the dev harness's URL parameters for trying
different states, are in [contributing.md](docs/guide/contributing.md#run-it).

## Integration

This app is a child component of the [hadoku_site](https://github.com/WolffM/hadoku_site) parent application.

### Props

```typescript
interface ResumeBotAppProps {
  theme?: string // Optional: 'default', 'ocean', 'forest', etc.
  apiBaseUrl: string // Required: API root path or URL (e.g., '/resume/api' or 'https://api.yourapp.com/api')
  ownerName?: string // Optional: name shown in the chat welcome message (default: 'the candidate')
}
```

### Mounting

```typescript
import { mount, unmount } from '@wolffm/resume-bot'

// Mount the app
const element = document.getElementById('app-root')
mount(element, {
  theme: 'ocean', // optional
  apiBaseUrl: '/resume/api' // required - path to the API root
})

// Unmount when done
unmount(element)
```

**Important:** `apiBaseUrl` is the **API root**, matching the rest of the hadoku
ecosystem (`/oss/api`, `/jobplatform/api`). Endpoints are appended to it directly.
It can be either:

- A **path** (e.g., `/resume/api`) if the backend is hosted on the same domain
- A **full URL** (e.g., `https://api.yourapp.com/api`) if the backend is on a different domain

> **Breaking change in 2.0.0.** Through 1.x this prop was the _app_ root (`/resume`)
> and the package appended `/api/...` itself; 1.3.14 accepted both spellings. 2.0.0
> removes that shim — pass the API root. Passing `/resume` now requests `/resume/chat`
> and 404s. Migration is a one-line change at the mount site: `/resume` -> `/resume/api`.
> This does not affect the `./api` worker export — `createResumeHandler(basePath)` is
> unchanged.

The backend handles these endpoints (public unless noted; non-public routes are
gated in-worker via `@wolffm/worker-utils` edge-auth — see `worker/src/index.ts`):

- `${apiBaseUrl}/chat` - POST - Chat with the bot (public, rate-limited)
- `${apiBaseUrl}/resume` - GET - Fetch resume content, incl. `?v={slug}` variants (public)
- `${apiBaseUrl}/resume.pdf` - GET - Server-rendered PDF download (public)
- `${apiBaseUrl}/system-prompt` - GET - Fetch system prompt (admin/friend)
- `${apiBaseUrl}/tailored-resume` - POST - Per-job tailored resume (admin/friend/service)
- `${apiBaseUrl}/cover-letter` - POST - Per-job cover letter (admin/friend/service)
- `${apiBaseUrl}/variants` - POST/GET/DELETE - Variant management (admin/friend)

## Deployment

Pushes to `main` build, publish and notify the parent site automatically, with
the version computed by CI at publish time — never by a commit or a hook. See
[contributing.md#how-it-deploys](docs/guide/contributing.md#how-it-deploys).

## Architecture

This package has two exports, built and published together as
`@wolffm/resume-bot`; the full architecture — content model, gating, the LLM
provider chain — is in [contributing.md#architecture](docs/guide/contributing.md#architecture).

- **UI component** (`.` export): `mount(el, props)` / `unmount(el)` — React app from `src/entry.tsx`
- **Worker API** (`./api` export): `createResumeHandler(basePath, options)` — Hono router from `worker/src/index.ts` (`options.ownerName` sets the chat owner)
