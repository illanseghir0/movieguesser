import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  // le site vit à la racine du domaine movieguesser.fr
  base: "/",
  test: {
    environment: "happy-dom",
    setupFiles: ["tests/setup.ts"],
    // jamais de vrai client Supabase dans les tests (même avec un .env.local)
    env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "" },
  },
});
