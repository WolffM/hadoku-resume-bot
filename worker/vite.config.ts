import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [
    dts({
      rollupTypes: true,
      outDir: resolve(__dirname, '../dist'),
      tsconfigPath: resolve(__dirname, './tsconfig.json')
    })
  ],
  build: {
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
