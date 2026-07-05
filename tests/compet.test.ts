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

describe("barème compétitif — (taille de la liste - écart)/10, entier supérieur", () => {
  it("suit la formule aux points remarquables (liste de 250)", () => {
    expect(competPoints(0, 250)).toBe(25);    // rang exact
    expect(competPoints(10, 250)).toBe(24);
    expect(competPoints(123, 250)).toBe(13);  // ceil(12.7)
    expect(competPoints(249, 250)).toBe(1);   // ceil(0.1)
    expect(competPoints(250, 250)).toBe(0);
  });

  it("se normalise sur la taille de la liste", () => {
    expect(competPoints(0, 500)).toBe(50);    // grande liste : plafond plus haut
    expect(competPoints(0, 25)).toBe(3);      // petite liste : barème serré
    expect(competPoints(20, 25)).toBe(1);
  });

  it("ne descend jamais sous zéro", () => {
    expect(competPoints(600, 250)).toBe(0);
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
    const game = freshCompet();                // liste de 250 films
    playRound(game, 20);                       // écart 20 -> ceil(230/10) = 23 pts
    expect(game.score[0]).toBe(23);
    expect(game.history[0]).toMatchObject({ win: 1, pts: 23, d: [20, 20] });
    expect(game.phase).toBe(0);                // jamais de second joueur
  });

  it("n'affiche le score qu'au verdict (temps 3)", () => {
    const game = freshCompet();
    game.submitGuess(game.current!.rank);      // exact sur 250 films : +25
    expect(game.score[0]).toBe(25);
    expect(game.scoreShown[0]).toBe(0);
    vi.advanceTimersByTime(2500);
    expect(game.scoreShown[0]).toBe(25);
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

  it("sortie par le header : rien n'est soumis, la participation reste à jouer", () => {
    const game = freshCompet({ rounds: 10 });
    playRound(game, 10);
    game.abandon();
    expect(game.round).toBe(0);
    expect(useCompetStore().submitState).toBe("none"); // pas même « partial »
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
