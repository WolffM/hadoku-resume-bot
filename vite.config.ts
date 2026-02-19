import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      ignored: ['**/template/**']
    }
  },
  optimizeDeps: {
    exclude: ['template']
  },
  build: {
    lib: {
      entry: 'src/entry.tsx',
      formats: ['es']
    },
    rollupOptions: {
      // Externalize peer dependencies (parent provides them)
      external: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        '@wolffm/themes',
        '@wolffm/task-ui-components'
      ],
      output: {
        entryFileNames: 'index.js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: 'style.css',
        manualChunks(id) {
          // Group markdown rendering deps into a shared chunk
          if (
            id.includes('node_modules/react-markdown') ||
            id.includes('node_modules/remark-') ||
            id.includes('node_modules/mdast-') ||
            id.includes('node_modules/micromark') ||
            id.includes('node_modules/unified') ||
            id.includes('node_modules/unist-') ||
            id.includes('node_modules/hast-') ||
            id.includes('node_modules/vfile') ||
            id.includes('node_modules/devlop') ||
            id.includes('node_modules/property-information') ||
            id.includes('node_modules/style-to-object') ||
            id.includes('node_modules/html-void-elements') ||
            id.includes('node_modules/comma-separated-tokens') ||
            id.includes('node_modules/space-separated-tokens') ||
            id.includes('node_modules/decode-named-character-reference') ||
            id.includes('node_modules/character-entities') ||
            id.includes('node_modules/ccount') ||
            id.includes('node_modules/markdown-table') ||
            id.includes('node_modules/zwitch') ||
            id.includes('node_modules/longest-streak') ||
            id.includes('node_modules/bail') ||
            id.includes('node_modules/is-plain-obj') ||
            id.includes('node_modules/trough')
          ) {
            return 'markdown-vendor'
          }
          // rehype-raw only needed by ChatInterface
          if (
            id.includes('node_modules/rehype-raw') ||
            id.includes('node_modules/hast-util-raw') ||
            id.includes('node_modules/parse5')
          ) {
            return 'rehype-vendor'
          }
        }
      }
    },
    target: 'es2022',
    cssCodeSplit: false,
    minify: 'esbuild',
    sourcemap: true
  }
})
