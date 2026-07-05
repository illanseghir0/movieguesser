import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Film } from "../src/types";

// pas de Supabase dans les tests : partie jouable, score non inscrit
vi.mock("../src/lib/supabase", () => ({ supabase: null }));

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("../src/router", () => ({ default: { push } }));

import { competPoints, useGameStore } from "../src/stores/game";
import { useCompetStore } from "../src/stores/compet";
import { useListStore } from "../src/stores/list";

const seed = (n: number): Film[] =>
  Array.from({ length: n }, (_, i) => ({
    rank: i + 1, title: `Film ${i + 1}`, year: 2000,
    slug: null, url: null, poster: null, director: null,
  }));

function freshCompet(opts: { films?: number; rounds?: number } = {}) {
  const list = useListStore();
  const films = seed(opts.films ?? 250);
  list.films = films;
  const game = useGameStore();
  game.startCompet({ challengeId: 1, rounds: opts.rounds ?? 10, timer: 15 });
  // deck déterministe : manches au rang du milieu (devinettes toujours en bornes)
  const mid = Math.floor(films.length / 2);
  game.deck = [...films.slice(mid), ...films.slice(0, mid)];
  return game;
}

/** joue une manche solo : une devinette à `gap` du vrai rang + révélation */
function playRound(game: ReturnType<typeof useGameStore>, gap: number) {
  expect(game.submitGuess(game.current!.rank + gap)).toBe(true);
  vi.advanceTimersByTime(2500);
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.useFakeTimers();
  push.mockClear();
});
afterEach(() => { vi.useRealTimers(); });

describe("barème compétitif — (500 - écart)/10, entier supérieur", () => {
  it("suit la formule aux points remarquables", () => {
    expect(competPoints(0)).toBe(50);    // rang exact
    expect(competPoints(10)).toBe(49);
    expect(competPoints(123)).toBe(38);  // ceil(37.7)
    expect(competPoints(499)).toBe(1);   // ceil(0.1)
    expect(competPoints(500)).toBe(0);
  });

  it("ne descend jamais sous zéro", () => {
    expect(competPoints(600)).toBe(0);
  });
});

describe("boucle solo du défi", () => {
  it("démarre sans entracte, avec les règles du défi", () => {
    const game = freshCompet({ rounds: 10 });
    expect(push).toHaveBeenCalledWith("/competitif/jeu");
    expect(game.kind).toBe("compet");
    expect(game.round).toBe(1);
    expect(game.handoffOpen).toBe(false);
    expect(game.playRounds).toBe(10);
  });

  it("une seule devinette déclenche la révélation et marque le barème", () => {
    const game = freshCompet();
    playRound(game, 20);                       // écart 20 -> 48 pts
    expect(game.score[0]).toBe(48);
    expect(game.history[0]).toMatchObject({ win: 1, pts: 48, d: [20, 20] });
    expect(game.phase).toBe(0);                // jamais de second joueur
  });

  it("n'affiche le score qu'au verdict (temps 3)", () => {
    const game = freshCompet();
    game.submitGuess(game.current!.rank);      // exact : +50
    expect(game.score[0]).toBe(50);
    expect(game.scoreShown[0]).toBe(0);
    vi.advanceTimersByTime(2500);
    expect(game.scoreShown[0]).toBe(50);
  });

  it("ignore les réglages locaux : le défi fixe le nombre de manches", () => {
    const game = freshCompet({ rounds: 2 });
    playRound(game, 0);
    game.nextRound();
    playRound(game, 5);
    game.nextRound();
    expect(push).toHaveBeenCalledWith("/competitif/fin");
    expect(game.history).toHaveLength(2);
  });

  it("partie complète sans session -> hors classement (anon)", async () => {
    const game = freshCompet({ rounds: 1 });
    playRound(game, 10);
    game.nextRound();
    await vi.waitFor(() => {
      expect(useCompetStore().submitState).toBe("anon");
    });
    expect(useCompetStore().submittedScore).toBe(game.score[0]);
  });

  it("abandon -> score non soumis (participation préservée)", async () => {
    const game = freshCompet({ rounds: 10 });
    playRound(game, 10);
    game.quit();
    expect(push).toHaveBeenCalledWith("/competitif/fin");
    await vi.waitFor(() => {
      expect(useCompetStore().submitState).toBe("partial");
    });
  });

  it("une partie locale après un défi repart en mode duel", () => {
    const game = freshCompet({ rounds: 1 });
    playRound(game, 0);
    game.nextRound();
    push.mockClear();
    game.start("Alice", "Bob");
    expect(game.kind).toBe("local");
    expect(push).toHaveBeenCalledWith("/jeu");
    expect(game.handoffOpen).toBe(true);       // l'entracte est de retour
  });
});
