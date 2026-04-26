import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
