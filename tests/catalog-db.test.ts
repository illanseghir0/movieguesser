import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

/* Supabase factice : renvoie un catalogue avec films enrichis (nouvelles
   données) et non enrichis (anciennes données, clés absentes) */
vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: async () => ({
          error: null,
          data: [{
            slug: "ma-liste", url: "https://letterboxd.com/x/list/ma-liste/",
            title: "Ma Liste", cover_url: "https://a.ltrbxd.com/cover.jpg", film_count: 2,
            films: [
              { rank: 1, title: "Enrichi", year: 2000, slug: "enrichi",
                poster: "https://a.ltrbxd.com/resized/film-poster/p.jpg",
                director: "Une Réalisatrice" },
              { rank: 2, title: "Ancien", year: 2001, slug: "ancien" },
            ],
          }],
        }),
      }),
    }),
  },
}));

import { useListStore } from "../src/stores/list";

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe("loadCatalog — mapping depuis la DB", () => {
  it("mappe les films enrichis (poster/director) et laisse les anciens en paresseux", async () => {
    const list = useListStore();
    await list.loadCatalog();
    expect(list.catalog).toHaveLength(1);
    const e = list.catalog[0];
    expect(e.cover).toBe("https://a.ltrbxd.com/cover.jpg");

    const [enrichi, ancien] = e.films!;
    // enrichi : tout est là, aucun proxy ne sera appelé pendant la partie
    expect(enrichi.poster).toBe("https://a.ltrbxd.com/resized/film-poster/p.jpg");
    expect(enrichi.director).toBe("Une Réalisatrice");
    expect(enrichi.url).toBe("https://letterboxd.com/film/enrichi/");
    // ancien format : clés absentes -> undefined -> chemin paresseux conservé
    expect(ancien.poster).toBeUndefined();
    expect(ancien.director).toBeUndefined();
  });
});
