import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Film } from "../src/types";

// pas de Supabase dans les tests (profil désactivé, stats non enregistrées)
vi.mock("../src/lib/supabase", () => ({ supabase: null }));

import { useGameStore } from "../src/stores/game";
import { useListStore } from "../src/stores/list";
import { useSettingsStore } from "../src/stores/settings";

/* films sans slug : ensureMeta ne déclenche aucun fetch */
const seed = (n: number): Film[] =>
  Array.from({ length: n }, (_, i) => ({
    rank: i + 1, title: `Film ${i + 1}`, year: 2000,
    slug: null, url: null, poster: null, director: null,
  }));

function freshGame(opts: { films?: number; mode?: "rounds" | "points";
                           rounds?: number; target?: number; start?: "alt" | "random" } = {}) {
  const settings = useSettingsStore();
  settings.mode = opts.mode ?? "rounds";
  settings.rounds = opts.rounds ?? 3;
  settings.target = opts.target ?? 100;
  settings.start = opts.start ?? "alt";
  const list = useListStore();
  const films = seed(opts.films ?? 20);
  list.films = films;
  const game = useGameStore();
  game.start("Alice", "Bob");
  // deck déterministe : les manches commencent au rang du milieu, les
  // devinettes rank ± gap restent donc toujours dans [1, maxRank]
  const mid = Math.floor(films.length / 2);
  game.deck = [...films.slice(mid), ...films.slice(0, mid)];
  return game;
}

/** joue une manche : devinettes des deux joueurs + fin de la séquence de révélation */
function playRound(game: ReturnType<typeof useGameStore>, gap1: number, gap2: number) {
  const rank = game.current!.rank;
  game.closeHandoff();
  // premier à deviner selon l'ordre de la manche : on vise par joueur
  const first = game.order[0], second = game.order[1];
  const target = (p: number) => rank + (p === 0 ? gap1 : gap2);
  expect(game.submitGuess(target(first))).toBe(true);
  game.closeHandoff();
  expect(game.submitGuess(target(second))).toBe(true);
  vi.advanceTimersByTime(2500); // séquence de révélation complète
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); });

describe("démarrage et ordre de passage", () => {
  it("démarre une partie propre", () => {
    const game = freshGame();
    expect(game.screen).toBe("play");
    expect(game.round).toBe(1);
    expect(game.score).toEqual([0, 0]);
    expect(game.handoffOpen).toBe(true); // entracte annonce le premier joueur
    expect(game.playRounds).toBe(3);
  });

  it("refuse de démarrer sans liste chargée", () => {
    const game = useGameStore();
    game.start("Alice", "Bob");
    expect(game.screen).toBe("home");
  });

  it("alterne le premier joueur à chaque manche (mode alterné)", () => {
    const game = freshGame();
    expect(game.order).toEqual([0, 1]);      // manche 1 : J1 commence
    playRound(game, 0, 5);
    game.nextRound();
    expect(game.order).toEqual([1, 0]);      // manche 2 : J2 commence
  });

  it("tire le premier joueur au hasard (mode aléatoire)", () => {
    const game = freshGame({ start: "random" });
    const rnd = vi.spyOn(Math, "random").mockReturnValue(0.9);
    playRound(game, 0, 5);
    game.nextRound();
    expect(game.order).toEqual([1, 0]);      // 0.9 >= 0.5
    rnd.mockReturnValue(0.1);
    playRound(game, 0, 5);
    game.nextRound();
    expect(game.order).toEqual([0, 1]);
    rnd.mockRestore();
  });

  it("stocke la devinette du bon joueur quand J2 commence", () => {
    const game = freshGame();
    playRound(game, 0, 5);
    game.nextRound();                        // manche 2 : ordre [1,0]
    game.closeHandoff();
    game.submitGuess(7);                     // premier à jouer = J2
    expect(game.guesses[1]).toBe(7);
    expect(game.guesses[0]).toBeNull();
  });
});

describe("validation des devinettes", () => {
  it("rejette les valeurs hors bornes sans avancer", () => {
    const game = freshGame();                // maxRank = 20
    game.closeHandoff();
    expect(game.submitGuess(0)).toBe(false);
    expect(game.submitGuess(21)).toBe(false);
    expect(game.submitGuess(NaN)).toBe(false);
    expect(game.phase).toBe(0);
    expect(game.guesses).toEqual([null, null]);
    expect(game.submitGuess(20)).toBe(true); // borne incluse
  });

  it("ouvre l'entracte avant le second joueur", () => {
    const game = freshGame();
    game.closeHandoff();
    expect(game.handoffOpen).toBe(false);
    game.submitGuess(5);
    expect(game.handoffOpen).toBe(true);     // secret : J2 ne voit rien
    expect(game.phase).toBe(1);
  });
});

describe("scoring — mode manches", () => {
  it("donne le point au plus proche", () => {
    const game = freshGame();
    playRound(game, 0, 5);                   // J1 exact, J2 à 5
    expect(game.score).toEqual([1, 0]);
    expect(game.history[0]).toMatchObject({ win: 1, d: [0, 5] });
  });

  it("donne un point à chacun en cas d'égalité d'écart", () => {
    const game = freshGame({ films: 30 });
    const rank = game.current!.rank;       // rang 16 (milieu du deck)
    game.closeHandoff();
    game.submitGuess(rank + 3);
    game.closeHandoff();
    game.submitGuess(rank - 3);
    vi.advanceTimersByTime(2500);
    expect(game.score).toEqual([1, 1]);
    expect(game.history[0].win).toBe(0);
  });

  it("n'affiche le score qu'au verdict (temps 3 de la révélation)", () => {
    const game = freshGame();
    const rank = game.current!.rank;
    game.closeHandoff();
    game.submitGuess(rank);
    game.closeHandoff();
    game.submitGuess(rank + 2);
    expect(game.score[0]).toBe(1);           // le vrai score est déjà à jour
    expect(game.scoreShown[0]).toBe(0);      // mais pas celui affiché
    expect(game.reveal!.stage).toBe(0);
    vi.advanceTimersByTime(1100);
    expect(game.reveal!.stage).toBe(1);
    expect(game.scoreShown[0]).toBe(0);
    vi.advanceTimersByTime(1400);
    expect(game.reveal!.stage).toBe(2);
    expect(game.scoreShown[0]).toBe(1);
  });

  it("termine après le nombre de manches et enregistre l'historique", () => {
    const game = freshGame({ rounds: 2 });
    playRound(game, 0, 5);
    game.nextRound();
    playRound(game, 4, 1);
    game.nextRound();
    expect(game.screen).toBe("end");
    expect(game.history).toHaveLength(2);
    expect(game.score).toEqual([1, 1]);      // une manche chacun
  });
});

describe("scoring — course aux points", () => {
  it("le vainqueur marque l'écart entre les deux estimations", () => {
    const game = freshGame({ mode: "points", films: 100 });
    playRound(game, 2, 30);                  // |2-30| = 28 pts pour J1
    expect(game.score).toEqual([28, 0]);
    expect(game.history[0]).toMatchObject({ win: 1, pts: 28 });
  });

  it("personne ne marque sur une égalité d'écart", () => {
    const game = freshGame({ mode: "points", films: 100 });
    const rank = game.current!.rank;
    game.closeHandoff();
    game.submitGuess(rank + 4);
    game.closeHandoff();
    game.submitGuess(rank + 4);              // même devinette
    vi.advanceTimersByTime(2500);
    expect(game.score).toEqual([0, 0]);
    expect(game.history[0]).toMatchObject({ win: 0, pts: 0 });
  });

  it("s'arrête quand l'objectif est atteint", () => {
    const game = freshGame({ mode: "points", target: 25, films: 100 });
    playRound(game, 0, 30);                  // 30 pts >= objectif 25
    game.nextRound();
    expect(game.screen).toBe("end");
    expect(game.score[0]).toBeGreaterThanOrEqual(25);
  });

  it("continue tant que l'objectif n'est pas atteint", () => {
    const game = freshGame({ mode: "points", target: 1000, films: 100 });
    playRound(game, 0, 10);
    game.nextRound();
    expect(game.screen).toBe("play");
    expect(game.round).toBe(2);
  });
});

describe("fins de partie", () => {
  it("abandon -> générique immédiat", () => {
    const game = freshGame();
    game.quit();
    expect(game.screen).toBe("end");
  });

  it("revanche : repartie propre avec les mêmes joueurs", () => {
    const game = freshGame({ rounds: 1 });
    playRound(game, 0, 5);
    game.nextRound();
    expect(game.screen).toBe("end");
    game.rematch();
    expect(game.screen).toBe("play");
    expect(game.round).toBe(1);
    expect(game.score).toEqual([0, 0]);
    expect(game.history).toHaveLength(0);
    expect(game.names).toEqual(["Alice", "Bob"]);
  });
});
