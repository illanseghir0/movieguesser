import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { CatalogEntry, Film } from "../src/types";
import { FALLBACK_CATALOG } from "../src/lib/catalog";

// pas de Supabase dans les tests : chemin « catalogue de secours »
vi.mock("../src/lib/supabase", () => ({ supabase: null }));

import { useListStore } from "../src/stores/list";

const entry = (films: Film[] | null): CatalogEntry => ({
  slug: "ma-liste",
  url: "https://letterboxd.com/dave/list/ma-liste/",
  title: "Ma Liste",
  cover: null,
  count: films?.length ?? 3,
  films,
});

const seed = (n: number): Film[] =>
  Array.from({ length: n }, (_, i) => ({
    rank: i + 1, title: `Film ${i + 1}`, year: 2000 + i,
    slug: `film-${i + 1}`, url: `https://letterboxd.com/film/film-${i + 1}/`,
  }));

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe("list store — catalogue et sélection", () => {
  it("retombe sur le catalogue embarqué sans Supabase", async () => {
    const list = useListStore();
    await list.loadCatalog();
    expect(list.catalog).toHaveLength(FALLBACK_CATALOG.length);
    expect(list.catalog[0].slug).toBe("letterboxds-top-500-films");
  });

  it("sélectionne une liste du catalogue (films en DB)", async () => {
    const list = useListStore();
    await list.selectList(entry(seed(250)));
    expect(list.ready).toBe(true);
    expect(list.films).toHaveLength(250);
    expect(list.maxRank).toBe(250);
    expect(list.listTitle).toBe("Ma Liste");
    expect(list.selectedSlug).toBe("ma-liste");
    expect(list.status?.type).toBe("ok");
    // mémorisée pour la prochaine visite + cache localStorage
    expect(localStorage.getItem("duelLast")).toBe(entry(null).url);
    const cache = JSON.parse(localStorage.getItem("duelList:" + entry(null).url)!);
    expect(cache.films).toHaveLength(250);
  });

  it("préfère le cache local frais (enrichi d'affiches) aux films de la DB", async () => {
    const e = entry(seed(3));
    const enriched = seed(3).map((f) => ({ ...f, poster: "https://a.ltrbxd.com/p.jpg" }));
    localStorage.setItem("duelList:" + e.url,
      JSON.stringify({ t: Date.now(), title: "Ma Liste", films: enriched }));
    const list = useListStore();
    await list.selectList(e);
    expect(list.films![0].poster).toBe("https://a.ltrbxd.com/p.jpg");
  });

  it("ignore un cache périmé (plus de 7 jours) au profit de la DB", async () => {
    const e = entry(seed(3));
    localStorage.setItem("duelList:" + e.url,
      JSON.stringify({ t: Date.now() - 8 * 864e5, title: "Vieille", films: seed(2) }));
    const list = useListStore();
    await list.selectList(e);
    expect(list.films).toHaveLength(3); // la DB, pas le vieux cache
    expect(list.listTitle).toBe("Ma Liste");
  });

  it("récupère affiche et réalisateur à la demande (ensureMeta)", async () => {
    const filmHtml = `<html><head>
      <meta property="og:title" content="Film 1 (2000)">
      <script type="application/ld+json">{"image":"https://a.ltrbxd.com/resized/film-poster/x.jpg",
        "@type":"Movie","director":[{"@type":"Person","name":"Une Réalisatrice"}]}</script>
      </head><body>${"x".repeat(600)}</body></html>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => filmHtml }));

    const list = useListStore();
    await list.selectList(entry(seed(3)));
    const f = list.films![0];
    expect(f.poster).toBeUndefined();
    await list.ensureMeta(f);
    expect(f.poster).toBe("https://a.ltrbxd.com/resized/film-poster/x.jpg");
    expect(f.director).toBe("Une Réalisatrice");
    // le cache localStorage est enrichi au passage
    const cache = JSON.parse(localStorage.getItem("duelList:" + entry(null).url)!);
    expect(cache.films[0].poster).toContain("film-poster");
    vi.unstubAllGlobals();
  });

  it("marque affiche/réalisateur comme absents si tous les proxys échouent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const list = useListStore();
    await list.selectList(entry(seed(1)));
    const f = list.films![0];
    await list.ensureMeta(f);
    expect(f.poster).toBeNull();     // plus jamais retenté pendant la partie
    expect(f.director).toBeNull();
    vi.unstubAllGlobals();
  });
});
