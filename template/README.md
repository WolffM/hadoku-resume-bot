# @wolffm/your-app

Your app description goes here.

## Overview

Brief description of what this child app does and how it integrates with the hadoku parent site.

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build for production
pnpm build

# Lint and format
pnpm lint:fix
pnpm format
```

## Integration

This app is a child component of the [hadoku_site](https://github.com/WolffM/hadoku_site) parent application.

### Props

```typescript
interface YourAppProps {
  theme?: string;              // 'default', 'ocean', 'forest', etc.
  environment?: 'development' | 'production';
  serverOrigin?: string;       // API endpoint
  sessionId?: string;          // Session identifier
}
```

### Mounting

```typescript
import { mount, unmount } from '@wolffm/your-app';

// Mount the app
mount(document.getElementById('app-root'), {
  theme: 'ocean',
  environment: 'production'
});

// Unmount when done
unmount(document.getElementById('app-root'));
```

## Deployment

Pushes to `main` automatically:
1. Build and publish to GitHub Packages
2. Notify parent site to update
3. Parent pulls new version and redeploys

## Documentation

See [TEMPLATE.md](./TEMPLATE.md) for complete setup and integration instructions.
