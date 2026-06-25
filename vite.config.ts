import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { resolve } from "path";

export default defineConfig({
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
});
