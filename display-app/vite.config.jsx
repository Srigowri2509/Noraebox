import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 61', 'android >= 5'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
    }),
  ],
  base: "./",
  build: {
    target: "es2015",
    cssTarget: "chrome61",
  },
  server: {
    port: 5176,
    open: false, // Don't auto-open, we'll use script
    host: true,
  },
})
