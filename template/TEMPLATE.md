# Child App Template Guide

Template for building React-based child apps that integrate with the hadoku parent site.

---

## Quick Start

1. Copy this template folder to your new repo
2. Replace all instances:
   - `@wolffm/your-app` → `@wolffm/resume-bot`
   - `your-app` → `resume-bot`
   - `YourApp` → `ResumeBot`
3. Run setup:
   ```bash
   pnpm install
   pnpm exec husky init
   chmod +x .husky/pre-commit
   ```
4. Add GitHub secret: `HADOKU_SITE_TOKEN` (get from hadoku_site admin)
5. Start developing: `pnpm dev`
6. Push to `main` to auto-deploy

---

## Required Exports (`src/entry.tsx`)

```typescript
import { createRoot } from 'react-dom/client';
import '@wolffm/themes/themes.css'; // REQUIRED

export function mount(el: HTMLElement, props = {}) {
  const root = createRoot(el);
  root.render(<App {...props} />);
  (el as any).__root = root;
}

export function unmount(el: HTMLElement) {
  ((el as any).__root)?.unmount();
}
```

---

## Theme Integration (MANDATORY)

### 1. Import in `entry.tsx`
```typescript
import '@wolffm/themes/themes.css'; // REQUIRED
```

### 2. Apply attributes in component
```typescript
useEffect(() => {
  containerRef.current?.setAttribute('data-theme', theme);
  containerRef.current?.setAttribute('data-dark-theme', isDarkTheme ? 'true' : 'false');
}, [theme, isDarkTheme]);
```

### 3. Use CSS variables only
```css
/* ✅ Correct */
background-color: var(--theme-background);
color: var(--theme-text);

/* ❌ Wrong */
background-color: #ffffff; /* NO hardcoded colors! */
```

**Variables**: `--theme-background`, `--theme-text`, `--theme-primary`, `--theme-border`, etc.

---

## Build Config

### `package.json` exports
```json
{
  "exports": {
    ".": "./dist/index.js",
    "./style.css": "./dist/style.css"
  },
  "peerDependencies": {
    "@wolffm/themes": ">=1.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

### `vite.config.ts` externals
```typescript
rollupOptions: {
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', '@wolffm/themes']
}
```

**Critical**: Parent provides React and themes, don't bundle them.

---

## Development

```bash
pnpm dev          # Dev server (localhost:5173)
pnpm build        # Production build
pnpm lint:fix     # Auto-fix linting
pnpm format       # Format files
```

### Pre-Commit Hook
Auto-runs on commit:
1. ESLint auto-fix
2. Prettier format
3. Version bump (only if `src/` or `package.json` changed)

**Versioning**: `1.0.0` → `1.0.1` → ... → `1.0.20` → `1.1.0`

Skip with: `git commit --no-verify`

---

## Deployment

Push to `main` triggers:
1. Build package
2. Publish to GitHub Packages
3. Notify parent site
4. Parent updates and redeploys

---

## Troubleshooting

**Build fails?**
- Check externals in `vite.config.ts`

**Version not bumping?**
- `chmod +x .husky/pre-commit`
- Only bumps on `src/` or `package.json` changes

**Theme not working?**
- Import `@wolffm/themes/themes.css` in `entry.tsx`
- Set `data-theme` attributes
- Use CSS variables only

**Parent not loading?**
- Export `mount()` from `entry.tsx`
- Build outputs `dist/index.js` and `dist/style.css`

---

## Replacement Checklist

- [ ] `@wolffm/your-app` → actual package name
- [ ] `your-app` → app name in CSS classes
- [ ] `YourAppProps` → actual props interface name
- [ ] Repository URL in `package.json`
- [ ] Description in `package.json` and `README.md`
- [ ] `HADOKU_SITE_TOKEN` in GitHub secrets
- [ ] Test: `pnpm build` succeeds

---

*For project-specific details, see [RESUME_BOT_PROJECT.md](../RESUME_BOT_PROJECT.md)*
