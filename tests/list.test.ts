import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { CatalogEntry, Film } from "../src/types";
import { FALLBACK_CATALOG } from "../src/lib/catalog";

// pas de Supabase dans les tests : chemin « catalogue de secours »
vi.mock("../src/lib/supabase", () => ({ supabase: null }));

import { useListStore } from "../src/stores/list";

const URL_LISTE = "https://letterboxd.com/dave/list/ma-liste/";
const entry = (): CatalogEntry => ({
  slug: "ma-liste", url: URL_LISTE, title: "Ma Liste", cover: null, count: 3,
});

const seed = (n: number): Film[] =>
  Array.from({ length: n }, (_, i) => ({
    rank: i + 1, title: `Film ${i + 1}`, year: 2000 + i,
    slug: `film-${i + 1}`, url: `https://letterboxd.com/film/film-${i + 1}/`,
  }));

/** simule une liste déjà jouée : cache localStorage frais */
function primeCache(films: Film[], title = "Ma Liste") {
  localStorage.setItem("duelList:" + URL_LISTE,
    JSON.stringify({ t: Date.now(), title, films }));
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe("list store — catalogue et sélection (sans Supabase)", () => {
  it("retombe sur le catalogue embarqué sans Supabase", async () => {
    const list = useListStore();
    await list.loadCatalog();
    expect(list.catalog).toHaveLength(FALLBACK_CATALOG.length);
    expect(list.catalog[0].slug).toBe("letterboxds-top-500-films");
  });

  it("sert le cache local frais (enrichi d'affiches) sans aucune requête", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const enriched = seed(3).map((f) => ({ ...f, poster: "https://a.ltrbxd.com/p.jpg" }));
    primeCache(enriched);
    const list = useListStore();
    await list.selectList(entry());
    expect(list.ready).toBe(true);
    expect(list.films![0].poster).toBe("https://a.ltrbxd.com/p.jpg");
    expect(list.selectedSlug).toBe("ma-liste");
    expect(localStorage.getItem("duelLast")).toBe(URL_LISTE);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("remember=false : ne devient pas la « dernière liste jouée » (défi)", async () => {
    primeCache(seed(3));
    const list = useListStore();
    await list.selectList(entry(), false);
    expect(list.ready).toBe(true);
    expect(localStorage.getItem("duelLast")).toBeNull();
  });

  it("récupère affiche et réalisateur à la demande (ensureMeta)", async () => {
    const filmHtml = `<html><head>
      <meta property="og:title" content="Film 1 (2000)">
      <script type="application/ld+json">{"image":"https://a.ltrbxd.com/resized/film-poster/x.jpg",
        "@type":"Movie","director":[{"@type":"Person","name":"Une Réalisatrice"}]}</script>
      </head><body>${"x".repeat(600)}</body></html>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => filmHtml }));

    primeCache(seed(3));
    const list = useListStore();
    await list.selectList(entry());
    const f = list.films![0];
    expect(f.poster).toBeUndefined();
    await list.ensureMeta(f);
    expect(f.poster).toBe("https://a.ltrbxd.com/resized/film-poster/x.jpg");
    expect(f.director).toBe("Une Réalisatrice");
    // le cache localStorage est enrichi au passage
    const cache = JSON.parse(localStorage.getItem("duelList:" + URL_LISTE)!);
    expect(cache.films[0].poster).toContain("film-poster");
    vi.unstubAllGlobals();
  });

  it("n'appelle aucun proxy pour les films déjà enrichis", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    primeCache(seed(2).map((f) => ({
      ...f, poster: "https://a.ltrbxd.com/resized/film-poster/x.jpg", director: "Quelqu'un",
    })));
    const list = useListStore();
    await list.selectList(entry());
    await list.ensureMeta(list.films![0]);
    await list.ensureMeta(list.films![1]);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("marque affiche/réalisateur comme absents si tous les proxys échouent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    primeCache(seed(1));
    const list = useListStore();
    await list.selectList(entry());
    const f = list.films![0];
    await list.ensureMeta(f);
    expect(f.poster).toBeNull();     // plus jamais retenté pendant la partie
    expect(f.director).toBeNull();
    vi.unstubAllGlobals();
  });
});
