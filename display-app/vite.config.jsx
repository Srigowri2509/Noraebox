import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import babel from 'vite-plugin-babel'

function stripModulePreloadPolyfill() {
  const modulePreloadRuntimePattern =
    /^\(function\(\)\{[\s\S]*?fetch\(u\.href,n\)\}\}\)\(\);/;

  return {
    name: "strip-modulepreload-runtime",
    enforce: "post",
    renderChunk(code) {
      if (!code.includes("modulepreload")) return null;
      const next = code.replace(modulePreloadRuntimePattern, "");
      if (next === code) return null;
      return { code: next, map: null };
    },
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        if (!chunk.code.includes("link[rel=\"modulepreload\"]") && !chunk.code.includes("link[rel='modulepreload']")) {
          continue;
        }
        chunk.code = chunk.code.replace(modulePreloadRuntimePattern, "");
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ["Android >= 4.4", "ie >= 11"],
      additionalLegacyPolyfills: ["core-js/stable", "regenerator-runtime/runtime"],
      renderModernChunks: false,
      modernPolyfills: false,
    }),
    babel({
      babelConfig: {
        presets: [
          ["@babel/preset-env", { targets: "android >= 5" }],
        ],
      },
    }),
    stripModulePreloadPolyfill(),
  ],
  base: "./",
  build: {
    target: "es5",
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
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
  esbuild: {
    target: "es5",
  },
  server: {
    port: 5176,
    open: false, // Don't auto-open, we'll use script
    host: true,
  },
})
