import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ["chrome >= 49", "android >= 5"],
      additionalLegacyPolyfills: ["core-js/stable", "regenerator-runtime/runtime"],
      renderModernChunks: false,
      modernPolyfills: false,
    }),
  ],
  base: "./",
  build: {
    target: "es5",
    cssTarget: "chrome49",
    minify: "terser",
    terserOptions: {
      ecma: 5,
      compress: {
        ecma: 5,
      },
      format: {
        ecma: 5,
      },
    },
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es5",
      supported: {
        arrow: false,
        "const-and-let": false,
        "async-await": false,
        "optional-chaining": false,
        "nullish-coalescing": false,
      },
    },
  },
  server: {
    port: 5176,
    open: false, // Don't auto-open, we'll use script
    host: true,
  },
})
