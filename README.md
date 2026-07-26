# @wolffm/resume-bot

AI-powered conversational interface for interactive resume exploration.

## Overview

Two-panel UI: a markdown resume viewer on the left, an AI chat interface on the right. The chat uses Groq's LLM to answer questions about the resume. Also exposes a worker API for generating tailored resumes and cover letters.

## Development

### Local Development Setup

This package includes a development environment for testing the component locally:

```bash
# Install dependencies
pnpm install

# Start dev server (opens http://localhost:5173)
pnpm dev

# Build for production
# pnpm build

# # Lint and format
# pnpm lint:fix
# pnpm format
```

The dev server uses `index.html` which imports and mounts the component directly. You can pass different configurations via URL parameters:

**Example URLs:**

```bash
# Default configuration
http://localhost:5173

# Custom theme
http://localhost:5173?theme=ocean

# Admin user
http://localhost:5173?userType=admin&sessionId=test-123

# Full configuration
http://localhost:5173?theme=ocean&userType=admin&sessionId=dev-session
```

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
ecosystem (`/oss/api`, `/jobplatform/api`). It can be either:

- A **path** (e.g., `/resume/api`) if the backend is hosted on the same domain
- A **full URL** (e.g., `https://api.yourapp.com/api`) if the backend is on a different domain

For backwards compatibility the legacy app-root form (`/resume`) is still accepted:
a trailing `/api` is stripped before endpoints are appended, so both spellings
resolve to the same URLs. That shim goes away in the next major.

The backend handles these endpoints (public unless noted; non-public routes are
gated in-worker via `@wolffm/worker-utils` edge-auth — see `worker/src/index.ts`):

- `${apiBaseUrl}/chat` - POST - Chat with the bot (public, rate-limited)
- `${apiBaseUrl}/resume` - GET - Fetch resume content, incl. `?v={slug}` variants (public)
- `${apiBaseUrl}/system-prompt` - GET - Fetch system prompt (admin/friend)
- `${apiBaseUrl}/tailored-resume` - POST - Per-job tailored resume (admin/friend/service)
- `${apiBaseUrl}/cover-letter` - POST - Per-job cover letter (admin/friend/service)
- `${apiBaseUrl}/variants` - POST/GET/DELETE - Variant management (admin/friend)

## Deployment

Pushes to `main` automatically:

1. Build and publish to GitHub Packages
2. Notify parent site to update
3. Parent pulls new version and redeploys

### Versioning

Version bumps are handled automatically through two mechanisms:

1. **Pre-commit hook** (primary): The `.husky/pre-commit` hook automatically bumps the version for every commit
2. **Workflow fallback**: The publish workflow checks if the current version already exists in the registry and bumps it if needed

This dual approach ensures versions are always incremented, even if commits bypass the pre-commit hook (e.g., web UI edits, `--no-verify` commits).

Version bumping follows this pattern:

- Patch version increments on each commit (1.1.8 → 1.1.9)
- At patch 20, rolls over to next minor (1.1.20 → 1.2.0)

## Architecture

This package has two exports:

- **UI component** (`.` export): `mount(el, props)` / `unmount(el)` — React app from `src/entry.tsx`
- **Worker API** (`./api` export): `createResumeHandler(basePath, options)` — Hono router from `worker/src/index.ts` (`options.ownerName` sets the chat owner)

Both are built and published together as `@wolffm/resume-bot`.
