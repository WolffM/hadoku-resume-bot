# @wolffm/resume-bot

resume bot description goes here.

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
  apiBaseUrl: string // Required: Backend API URL (e.g., 'https://api.yourapp.com')
}
```

### Mounting

```typescript
import { mount, unmount } from '@wolffm/resume-bot'

// Mount the app
const element = document.getElementById('app-root')
mount(element, {
  theme: 'ocean', // optional
  apiBaseUrl: 'https://your-backend-api.com' // required
})

// Unmount when done
unmount(element)
```

**Important:** The backend API must be deployed separately. The `apiBaseUrl` should point to your deployed backend server that handles the resume bot API endpoints (`/api/chat`, `/api/resume`, `/api/system-prompt`).

## Deployment

Pushes to `main` automatically:

1. Build and publish to GitHub Packages
2. Notify parent site to update
3. Parent pulls new version and redeploys

## Documentation

See [TEMPLATE.md](./TEMPLATE.md) for complete setup and integration instructions.
