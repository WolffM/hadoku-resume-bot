Run the full build and verify all outputs are correct.

Steps:

1. Run `pnpm run build`
2. Verify these files exist in dist/:
   - `dist/index.js` (UI entry point)
   - `dist/style.css` (CSS bundle)
   - `dist/worker.js` (worker API bundle)
   - `dist/entry.d.ts` (UI type declarations)
3. Check that package.json exports map to real files
4. If build fails on types: check `tsconfig.build.json` paths
5. If chunks are unexpectedly large: check `vite.config.ts` manualChunks and externals
