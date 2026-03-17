import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    dts({
      rollupTypes: true,
      outDir: '../dist',
      tsconfigPath: './tsconfig.json'
    })
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'worker.js'
    },
    outDir: '../dist',
    emptyOutDir: false,
    rollupOptions: {},
    target: 'es2022',
    minify: false
  }
})
