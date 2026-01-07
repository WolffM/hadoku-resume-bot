# @wolffm/resume-bot

AI-powered conversational interface for interactive resume exploration.

## Overview

Brief description of what this child app does and how it integrates with the hadoku parent site.

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
  apiBaseUrl: string // Required: Backend API path or URL (e.g., '/resume' or 'https://api.yourapp.com')
}
```

### Mounting

```typescript
import { mount, unmount } from '@wolffm/resume-bot'

// Mount the app
const element = document.getElementById('app-root')
mount(element, {
  theme: 'ocean', // optional
  apiBaseUrl: '/resume' // required - path to backend API
})

// Unmount when done
unmount(element)
```

**Important:** The `apiBaseUrl` can be either:

- A **path** (e.g., `/resume`) if the backend is hosted on the same domain
- A **full URL** (e.g., `https://api.yourapp.com`) if the backend is on a different domain

The backend must handle these endpoints:

- `${apiBaseUrl}/api/chat` - POST - Chat with the bot
- `${apiBaseUrl}/api/resume` - GET - Fetch resume content
- `${apiBaseUrl}/api/system-prompt` - GET - Fetch system prompt

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

## Documentation

See [TEMPLATE.md](./TEMPLATE.md) for complete setup and integration instructions.
