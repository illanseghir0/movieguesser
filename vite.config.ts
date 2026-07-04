import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  // le site est servi sous /guess-the-rank/ sur GitHub Pages
  base: "/guess-the-rank/",
});
