import { defineConfig } from 'vite'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Declarations for this entry are NOT emitted here — see
// tsconfig.worker-types.json, run as its own step in `build`.
//
// vite-plugin-dts used to run here with `rollupTypes: true`, and it was
// actively harmful: with no `types`/`main` field in package.json the plugin
// resolves its output path from `exports["."].types`, so it wrote the WORKER's
// rolled-up types to dist/entry.d.ts — the MAIN entry's declaration file. The
// later `tsc -p tsconfig.build.json` then regenerated dist/entry.d.ts from
// src/, so the damage was invisible; the net effect was simply that
// dist/worker.d.ts never existed and `@wolffm/resume-bot/api` shipped untyped.
export default defineConfig({
  build: {
    // Same reason as the root config: public/ is dev-harness only, and this
    // build writes into the same dist/ (emptyOutDir: false), so without the
    // guard it re-copies the favicon the root build deliberately skipped.
    copyPublicDir: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'worker.js'
    },
    outDir: resolve(__dirname, '../dist'),
    emptyOutDir: false,
    rollupOptions: {},
    target: 'es2022',
    minify: false
  }
})
