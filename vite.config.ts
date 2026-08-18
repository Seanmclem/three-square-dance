import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { resolve } from "path";

export default defineConfig({
  // Build stamp — settles "which bundle is this window running?" (the recurring
  // stale-bundle ambiguity when testing after code changes). Shown in the
  // TopBar ↻ tooltip; also on window.__buildStamp.
  define: {
    __BUILD_STAMP__: JSON.stringify(new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"),
  },
  // Pinned so `npm run dev` is deterministic and matches TESTING.md / test-plans.
  // strictPort: fail loudly instead of silently bumping to 7374 if 7373 is taken.
  server: { port: 7373, strictPort: true },
  plugins: [
    react(),
    checker({ typescript: true }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main:    resolve(__dirname, "index.html"),
        runtime: resolve(__dirname, "runtime.html"),
      },
    },
  },
});
