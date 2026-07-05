/* ============================================================
   stores/game.ts — boucle de jeu
   manches, ordre de passage, entracte, révélation en 3 temps,
   scores (manches ou course aux points), fin de partie.
   Deux genres de partie : "local" (duel hot-seat) et "compet"
   (solo, règles fixées par le défi, barème (500-écart)/10).
   ============================================================ */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import router from "../router";
import type { Film, RoundResult } from "../types";
import { REDUCE } from "../lib/env";
import { useListStore } from "./list";
import { useSettingsStore } from "./settings";
import { useProfileStore } from "./profile";
import { useCompetStore } from "./compet";

export type GameKind = "local" | "compet";

/** barème compétitif : partie entière supérieure de (taille de la liste - écart) / 10
    — normalisé sur la liste du défi pour que les scores restent comparables
    (une liste de 250 films plafonne à 25 pts la manche, pas 50) */
export function competPoints(gap: number, listSize: number): number {
  return Math.max(0, Math.ceil((listSize - gap) / 10));
}

export interface RevealState {
  stage: 0 | 1 | 2;      // 0: paris posés, 1: vrai rang, 2: verdict
  win: 0 | 1 | 2;
  pts: number;
  d: [number, number];
}

export const useGameStore = defineStore("game", () => {
  const list = useListStore();
  const settings = useSettingsStore();

  const names = ref<[string, string]>(["Joueur 1", "Joueur 2"]);
  const score = ref<[number, number]>([0, 0]);
  /** score affiché : ne rattrape score qu'au temps 3 de la révélation (drama) */
  const scoreShown = ref<[number, number]>([0, 0]);
  const round = ref(0);
  const playRounds = ref(10);
  const deck = ref<Film[]>([]);
  const guesses = ref<[number | null, number | null]>([null, null]);
  const phase = ref<0 | 1>(0);
  const order = ref<[number, number]>([0, 1]);
  const handoffOpen = ref(false);
  const reveal = ref<RevealState | null>(null);
  const history = ref<RoundResult[]>([]);
  const statsRecorded = ref(false);
  /** genre de la partie en cours + règles fixes du défi compétitif */
  const kind = ref<GameKind>("local");
  const competCfg = ref<{ challengeId: number; rounds: number; timer: number } | null>(null);

  const current = computed<Film | null>(() => deck.value[round.value - 1] ?? null);
  const currentPlayer = computed(() => order.value[phase.value]);

  let timers: number[] = [];
  const later = (fn: () => void, ms: number) => { if (REDUCE) fn(); else timers.push(window.setTimeout(fn, ms)); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  function start(n1: string, n2: string) {
    if (!list.films?.length) return;
    kind.value = "local"; competCfg.value = null;
    names.value = [n1.trim() || "Joueur 1", n2.trim() || "Joueur 2"];
    startGame();
  }

  /** partie compétitive : solo, règles imposées par le défi (la liste du
      défi doit avoir été chargée dans le store list au préalable) */
  function startCompet(cfg: { challengeId: number; rounds: number; timer: number }) {
    if (!list.films?.length) return;
    kind.value = "compet"; competCfg.value = cfg;
    const profile = useProfileStore();
    names.value = [profile.username ?? "Toi", "—"];
    startGame();
  }

  function startGame() {
    if (!list.films?.length) return;
    score.value = [0, 0]; scoreShown.value = [0, 0];
    round.value = 0; history.value = []; statsRecorded.value = false;
    // tirage sans répétition
    const d = list.films.slice();
    for (let i = d.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [d[i], d[j]] = [d[j], d[i]]; }
    deck.value = d;
    playRounds.value = kind.value === "compet"
      ? Math.min(competCfg.value!.rounds, d.length)
      : Math.min(settings.rounds, d.length);
    router.push(kind.value === "compet" ? "/competitif/jeu" : "/jeu");
    nextRound();
  }

  function nextRound() {
    clearTimers();
    round.value++;
    if (kind.value === "compet") {
      // nombre de manches fixé par le défi, quels que soient les réglages locaux
      if (round.value > playRounds.value) return endGame();
    } else if (settings.mode === "points") {
      if (Math.max(...score.value) >= settings.target || round.value > deck.value.length) return endGame();
    } else if (round.value > playRounds.value) {
      return endGame();
    }
    guesses.value = [null, null];
    phase.value = 0;
    reveal.value = null;
    scoreShown.value = [...score.value] as [number, number];
    if (kind.value === "compet") {
      // solo : pas d'ordre de passage, pas d'entracte
      order.value = [0, 1];
      handoffOpen.value = false;
      list.ensureMeta(current.value);
      return;
    }
    // ordre de passage de la manche
    order.value = settings.start === "random"
      ? (Math.random() < 0.5 ? [0, 1] : [1, 0])
      : (round.value % 2 ? [0, 1] : [1, 0]); // alterné
    list.ensureMeta(current.value);
    // entracte : l'ordre varie à chaque manche, on annonce toujours qui commence
    handoffOpen.value = true;
  }

  function closeHandoff() { handoffOpen.value = false; }

  /** renvoie false si la valeur est hors bornes (le composant secoue le champ) */
  function submitGuess(v: number): boolean {
    if (!(v >= 1 && v <= list.maxRank)) return false;
    if (kind.value === "compet") {
      guesses.value[0] = v;
      doRevealCompet();
      return true;
    }
    guesses.value[order.value[phase.value]] = v;
    if (phase.value === 0) {
      phase.value = 1;
      handoffOpen.value = true; // toujours avant le 2e joueur : secret
    } else {
      doReveal();
    }
    return true;
  }

  /** révélation solo : le barème du défi remplace le duel */
  function doRevealCompet() {
    clearTimers();
    const f = current.value!;
    const g = guesses.value[0]!;
    const gap = Math.abs(g - f.rank);
    const pts = competPoints(gap, list.films?.length ?? list.maxRank);
    score.value[0] += pts;
    history.value.push({ title: f.title, year: f.year, rank: f.rank, g: [g, g], d: [gap, gap], win: 1, pts });

    reveal.value = { stage: 0, win: 1, pts, d: [gap, gap] };
    later(() => { if (reveal.value) reveal.value.stage = 1; }, 1100);
    later(() => {
      if (!reveal.value) return;
      reveal.value.stage = 2;
      scoreShown.value = [...score.value] as [number, number];
    }, 2450);

    const nf = deck.value[round.value];
    if (nf) list.ensureMeta(nf).then(() => { if (nf.poster) new Image().src = nf.poster; });
  }

  function doReveal() {
    clearTimers();
    const f = current.value!;
    const [g1, g2] = guesses.value as [number, number];
    const d1 = Math.abs(g1 - f.rank), d2 = Math.abs(g2 - f.rank);
    let win: 0 | 1 | 2, pts = 0;
    if (settings.mode === "points") {
      // le vainqueur marque l'écart entre les deux estimations
      pts = Math.abs(d1 - d2);
      if (d1 < d2) { score.value[0] += pts; win = 1; }
      else if (d2 < d1) { score.value[1] += pts; win = 2; }
      else win = 0;
    } else {
      if (d1 < d2) { score.value[0]++; win = 1; }
      else if (d2 < d1) { score.value[1]++; win = 2; }
      else { score.value[0]++; score.value[1]++; win = 0; }
    }
    history.value.push({ title: f.title, year: f.year, rank: f.rank, g: [g1, g2], d: [d1, d2], win, pts });

    reveal.value = { stage: 0, win, pts, d: [d1, d2] };
    later(() => { if (reveal.value) reveal.value.stage = 1; }, 1100);
    later(() => {
      if (!reveal.value) return;
      reveal.value.stage = 2;
      scoreShown.value = [...score.value] as [number, number];
    }, 2450);

    // précharge l'affiche de la manche suivante pendant qu'on regarde le verdict
    const nf = deck.value[round.value];
    if (nf) list.ensureMeta(nf).then(() => { if (nf.poster) new Image().src = nf.poster; });
  }

  function endGame() {
    clearTimers();
    handoffOpen.value = false;
    scoreShown.value = [...score.value] as [number, number];
    if (kind.value === "compet") {
      router.push("/competitif/fin");
      // le score n'est inscrit au classement que si le défi a été joué en entier
      const compet = useCompetStore();
      const complete = history.value.length >= playRounds.value;
      const bestGap = history.value.length ? Math.min(...history.value.map((h) => h.d[0])) : null;
      compet.submit(score.value[0], bestGap, complete);
      return;
    }
    router.push("/fin");
    // profil connecté = Joueur 1 : on enregistre ses stats
    const profile = useProfileStore();
    if (profile.profile && history.value.length) {
      const won = score.value[0] > score.value[1];
      const bestGap = Math.min(...history.value.map((h) => h.d[0]));
      profile.recordGame(won, bestGap).then((ok) => { statsRecorded.value = ok; });
    }
  }

  function quit() { endGame(); }
  function rematch() { startGame(); }
  function goHome() { router.push("/"); }
  function goModes() { router.push("/nouvelle-seance"); }
  function goSetup() { router.push("/seance"); }
  function goProfile() { router.push("/profil"); }

  return {
    names, score, scoreShown, round, playRounds, deck, guesses, phase, order,
    handoffOpen, reveal, history, statsRecorded, kind, competCfg, current, currentPlayer,
    start, startCompet, nextRound, closeHandoff, submitGuess, quit, rematch,
    goHome, goModes, goSetup, goProfile,
  };
});
