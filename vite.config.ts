import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  // le site est servi sous /guess-the-rank/ sur GitHub Pages
  base: "/guess-the-rank/",
  test: {
    environment: "happy-dom",
    setupFiles: ["tests/setup.ts"],
    // jamais de vrai client Supabase dans les tests (même avec un .env.local)
    env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "" },
  },
});
