import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'

const root = fileURLToPath(new URL('..', import.meta.url))

// Builds the admin resume-builder as its own bundle (dist/builder.js), so the
// public resume widget (dist/index.js) never ships the block-editing code.
export default defineConfig({
  root,
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/builder/entry.tsx',
      formats: ['es']
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        '@wolffm/themes',
        '@wolffm/logger/client'
      ],
      output: {
        entryFileNames: 'builder.js',
        chunkFileNames: 'builder-[name]-[hash].js',
        assetFileNames: 'builder-style.css'
      }
    },
    target: 'es2022',
    cssCodeSplit: false,
    minify: 'esbuild',
    sourcemap: true
  }
})
