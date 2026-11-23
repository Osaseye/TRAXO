import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const VENDOR_CHUNK_RULES: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['vendor-firebase', ['node_modules/firebase', 'node_modules/@firebase']],
  ['vendor-charts', ['node_modules/lightweight-charts']],
  ['vendor-icons', ['node_modules/react-icons']],
  ['vendor-motion', ['node_modules/framer-motion', 'node_modules/motion']],
]

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          const normalizedId = id.replace(/\\/g, '/')
          for (const [chunkName, patterns] of VENDOR_CHUNK_RULES) {
            if (patterns.some((pattern) => normalizedId.includes(pattern))) {
              return chunkName
            }
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
