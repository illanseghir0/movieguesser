import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

/* Supabase factice : catalogue léger (sans JSONB) + films par slug.
   Les films mêlent enrichis (nouvelles données) et non enrichis
   (anciennes données, clés absentes). */
const TOP500_URL = "https://letterboxd.com/official/list/letterboxds-top-500-films/";
const MA_LISTE_URL = "https://letterboxd.com/x/list/ma-liste/";
const FILMS = [
  { rank: 1, title: "Enrichi", year: 2000, slug: "enrichi",
    poster: "https://a.ltrbxd.com/resized/film-poster/p.jpg",
    director: "Une Réalisatrice" },
  { rank: 2, title: "Ancien", year: 2001, slug: "ancien" },
];
const DB_LISTS: Record<string, { url: string; title: string; films: unknown[] }> = {
  "ma-liste": { url: MA_LISTE_URL, title: "Ma Liste", films: FILMS },
  "letterboxds-top-500-films": { url: TOP500_URL, title: "Letterboxd's Top 500 Films", films: FILMS },
};

const { selectSpy } = vi.hoisted(() => ({ selectSpy: vi.fn() }));
vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: (cols: string) => {
        selectSpy(cols);
        return {
          order: async () => ({
            error: null,
            data: [{ slug: "ma-liste", url: MA_LISTE_URL, title: "Ma Liste",
                     cover_url: "https://a.ltrbxd.com/cover.jpg", film_count: 2 }],
          }),
          eq: (_col: string, slug: string) => ({
            maybeSingle: async () => ({ error: null, data: DB_LISTS[slug] ?? null }),
          }),
        };
      },
    }),
  },
}));

import { useListStore } from "../src/stores/list";

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  selectSpy.mockClear();
});

describe("catalogue DB — léger au boot, films à la demande", () => {
  it("charge le catalogue sans le JSONB films", async () => {
    const list = useListStore();
    await list.loadCatalog();
    expect(list.catalog).toHaveLength(1);
    expect(list.catalog[0]).toMatchObject({
      slug: "ma-liste", count: 2, cover: "https://a.ltrbxd.com/cover.jpg",
    });
    // la colonne films (des centaines de Ko) n'est jamais demandée en masse
    expect(selectSpy).toHaveBeenCalledWith("slug,url,title,cover_url,film_count");
  });

  it("récupère et mappe les films à la sélection (enrichi / paresseux)", async () => {
    const list = useListStore();
    await list.loadCatalog();
    await list.selectList(list.catalog[0]);
    expect(list.ready).toBe(true);
    expect(list.listTitle).toBe("Ma Liste");

    const [enrichi, ancien] = list.films!;
    // enrichi : tout est là, aucun proxy ne sera appelé pendant la partie
    expect(enrichi.poster).toBe("https://a.ltrbxd.com/resized/film-poster/p.jpg");
    expect(enrichi.director).toBe("Une Réalisatrice");
    expect(enrichi.url).toBe("https://letterboxd.com/film/enrichi/");
    // ancien format : clés absentes -> undefined -> chemin paresseux conservé
    expect(ancien.poster).toBeUndefined();
    expect(ancien.director).toBeUndefined();

    // mémorisée pour la prochaine visite + cache localStorage
    expect(localStorage.getItem("duelLast")).toBe(MA_LISTE_URL);
    const cache = JSON.parse(localStorage.getItem("duelList:" + MA_LISTE_URL)!);
    expect(cache.films).toHaveLength(2);
  });

  it("ignore un cache périmé (plus de 7 jours) au profit de la DB", async () => {
    localStorage.setItem("duelList:" + MA_LISTE_URL,
      JSON.stringify({ t: Date.now() - 8 * 864e5, title: "Vieille", films: [FILMS[0]] }));
    const list = useListStore();
    await list.loadCatalog();
    await list.selectList(list.catalog[0]);
    expect(list.films).toHaveLength(2); // la DB, pas le vieux cache
    expect(list.listTitle).toBe("Ma Liste");
  });

  it("boot : liste par défaut depuis la DB, enrichie et mise en cache", async () => {
    const list = useListStore();
    await list.boot();
    expect(list.ready).toBe(true);
    expect(list.listTitle).toBe("Letterboxd's Top 500 Films");
    expect(list.selectedSlug).toBe("letterboxds-top-500-films");
    expect(list.films![0].director).toBe("Une Réalisatrice"); // pas films.json
    // prochaine visite : servie par le cache local, zéro requête
    const cache = JSON.parse(localStorage.getItem("duelList:" + TOP500_URL)!);
    expect(cache.films).toHaveLength(2);
  });
});
