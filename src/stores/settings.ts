/* ============================================================
   stores/settings.ts — réglages persistants (localStorage)
   ============================================================ */

import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

export type GameMode = "rounds" | "points";
export type StartMode = "alt" | "random" | "fixed";

export const useSettingsStore = defineStore("settings", () => {
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem("gtrCfg") || "{}"); }
    catch { return {}; }
  })();

  const mode = ref<GameMode>(saved.mode === "points" ? "points" : "rounds");
  const rounds = ref<number>(Number.isInteger(saved.rounds) && saved.rounds >= 1 ? saved.rounds : 10);
  const target = ref<number>(Number.isInteger(saved.target) && saved.target >= 50 ? saved.target : 1000);
  const start = ref<StartMode>(["alt", "random", "fixed"].includes(saved.start) ? saved.start : "alt");

  watch([mode, rounds, target, start], () => {
    localStorage.setItem("gtrCfg", JSON.stringify({
      mode: mode.value, rounds: rounds.value, target: target.value, start: start.value,
    }));
  });

  const modeNote = computed(() => mode.value === "rounds"
    ? `La partie dure ${rounds.value} manches — 1 point par manche gagnée.`
    : `Le vainqueur d'une manche marque l'écart entre les deux estimations. Premier à ${target.value} points.`);

  return { mode, rounds, target, start, modeNote };
});
