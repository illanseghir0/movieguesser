import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Film } from "../src/types";

vi.mock("../src/lib/supabase", () => ({ supabase: null }));

// le VRAI router (pas de mock) : reproduit guards + navigation
import router from "../src/router";
import { useGameStore } from "../src/stores/game";
import { useListStore } from "../src/stores/list";

const seed = (n: number): Film[] =>
  Array.from({ length: n }, (_, i) => ({
    rank: i + 1, title: `F${i + 1}`, year: 2000,
    slug: null, url: null, poster: null, director: null,
  }));

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe("lancement de partie (flux réel avec router)", () => {
  it("Lancer la séance depuis /seance arrive bien sur /jeu", async () => {
    await router.push("/seance");
    const list = useListStore();
    list.films = seed(20);
    const game = useGameStore();
    game.start("Alice", "Bob");
    // la navigation du store n'est pas awaitable d'ici : on laisse les
    // guards asynchrones se résoudre (jusqu'à 300 ms)
    for (let i = 0; i < 30 && router.currentRoute.value.name !== "jeu"; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(game.round).toBe(1);
    expect(router.currentRoute.value.name).toBe("jeu");
  });

  it("accès direct à /jeu sans partie -> renvoyé à l'accueil", async () => {
    // le router est un singleton : on repart de l'accueil (sinon /jeu -> /jeu
    // serait une navigation dupliquée qui court-circuite le guard)
    await router.push("/");
    await router.push("/jeu");
    await new Promise((r) => setTimeout(r, 20));
    expect(router.currentRoute.value.name).toBe("accueil");
  });
});
