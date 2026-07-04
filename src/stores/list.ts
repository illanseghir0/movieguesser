/* ============================================================
   stores/list.ts — la liste de films chargée + cache localStorage
   ============================================================ */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { CatalogEntry, Film } from "../types";
import { fetchHTML, normListUrl, parseFilmPage, parseListPage } from "../lib/letterboxd";
import { FALLBACK_CATALOG } from "../lib/catalog";
import { supabase } from "../lib/supabase";
import { reportError } from "../lib/telemetry";

export type StatusType = "ok" | "err" | "info";

export const useListStore = defineStore("list", () => {
  const films = ref<Film[] | null>(null);
  const listTitle = ref<string | null>(null);
  const listKey = ref<string | null>(null); // URL normalisée -> clé de cache
  const status = ref<{ type: StatusType; msg: string } | null>(null);
  const loading = ref(false);
  /** catalogue curaté (table `lists`, sinon catalogue de secours embarqué) */
  const catalog = ref<CatalogEntry[]>([]);
  const selectedSlug = ref<string | null>(null);

  const ready = computed(() => !!films.value?.length);
  const maxRank = computed(() =>
    films.value?.length ? films.value[films.value.length - 1].rank : 500);

  function setStatus(type: StatusType, msg: string) { status.value = { type, msg }; }

  function applyList(list: Film[], title: string | null, key: string | null) {
    films.value = list;
    listTitle.value = title || "Liste Letterboxd";
    listKey.value = key;
    const m = key?.match(/\/list\/([^/]+)/);
    if (m) selectedSlug.value = m[1];
  }

  function saveCache() {
    if (!listKey.value) return;
    try {
      localStorage.setItem("duelList:" + listKey.value,
        JSON.stringify({ t: Date.now(), title: listTitle.value, films: films.value }));
    } catch { /* stockage plein : tant pis */ }
  }

  function loadFromCache(base: string): boolean {
    try {
      const c = JSON.parse(localStorage.getItem("duelList:" + base) || "null");
      if (c && Date.now() - c.t < 7 * 864e5 && Array.isArray(c.films) && c.films.length) {
        applyList(c.films, c.title, base);
        localStorage.setItem("duelLast", base);
        setStatus("ok", `${c.title} · ${c.films.length} films`);
        return true;
      }
    } catch { /* cache corrompu */ }
    return false;
  }

  async function loadList(url: string) {
    const base = normListUrl(url);
    if (!base) { setStatus("err", "URL invalide — attendu : letterboxd.com/…/list/…"); return; }
    if (loadFromCache(base)) return; // liste déjà récupérée il y a moins de 7 jours

    loading.value = true;
    try {
      let page = 1, out: Film[] = [], title: string | null = null, totalPages: number | null = null;
      const seen = new Set<string>();
      while (page <= 20) {
        setStatus("info", `Récupération — page ${page}${totalPages ? ` / ${totalPages}` : ""}…`);
        const html = await fetchHTML(page === 1 ? base : `${base}page/${page}/`);
        const parsed = parseListPage(html, out.length);
        if (page === 1) { title = parsed.title; totalPages = parsed.totalPages; }
        if (!parsed.entries.length) break;
        for (const f of parsed.entries) {
          if (f.slug && seen.has(f.slug)) continue;
          if (f.slug) seen.add(f.slug);
          out.push(f);
        }
        if (totalPages && page >= totalPages) break;
        page++;
        await new Promise((r) => setTimeout(r, 250)); // politesse
      }
      if (!out.length) throw new Error("liste vide");
      out.sort((a, b) => a.rank - b.rank);
      applyList(out, title, base);
      saveCache();
      localStorage.setItem("duelLast", base);
      setStatus("ok", `${title} · ${out.length} films`);
    } catch {
      setStatus("err", "Liste inaccessible (proxys indisponibles ou liste privée) — réessaie dans un instant");
    } finally {
      loading.value = false;
    }
  }

  /* ---- films.json pré-scrapé, servi à côté de la page (liste par défaut) ---- */
  function normFilms(data: any[]): Film[] {
    return data
      .map((d) => ({
        rank: +d.rank, title: String(d.title ?? ""),
        poster: d.poster || null, year: d.year || null,
        slug: d.slug || null, url: d.url || null,
      }))
      .filter((d) => d.rank && d.title)
      .sort((a, b) => a.rank - b.rank);
  }

  /* ---- boot : dernière liste jouée, sinon le Top 500 par défaut ---- */
  async function boot(): Promise<string | null> {
    const savedLast = localStorage.getItem("duelLast");
    if (savedLast && loadFromCache(savedLast)) return savedLast;
    try {
      const r = await fetch(import.meta.env.BASE_URL + "films.json");
      const d = r.ok ? await r.json() : null;
      if (d && Array.isArray(d) && d.length) {
        applyList(normFilms(d), "Letterboxd's Top 500 Films", null);
        selectedSlug.value = "letterboxds-top-500-films";
        setStatus("ok", `Letterboxd's Top 500 Films · ${films.value!.length} films`);
        return null;
      }
    } catch { /* pas de films.json servi */ }
    return null;
  }

  /* ---- catalogue curaté : table `lists` côté Supabase, sinon secours ---- */
  let catalogLoaded = false;
  async function loadCatalog() {
    if (catalogLoaded) return;
    catalogLoaded = true;
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("lists")
          .select("slug,url,title,cover_url,film_count,films")
          .order("position");
        if (!error && data?.length) {
          catalog.value = data.map((r: any): CatalogEntry => ({
            slug: r.slug, url: r.url, title: r.title,
            cover: r.cover_url ?? null, count: r.film_count,
            films: (r.films as any[]).map((f): Film => ({
              rank: +f.rank, title: String(f.title), year: f.year ?? null,
              slug: f.slug ?? null,
              url: f.slug ? `https://letterboxd.com/film/${f.slug}/` : null,
              // affiche + réalisateur enrichis à l'ingestion : si présents,
              // aucun proxy n'est appelé pendant la partie ; si la clé est
              // absente (anciennes données), on garde le chemin paresseux
              ...("poster" in f ? { poster: f.poster ?? null } : {}),
              ...("director" in f ? { director: f.director ?? null } : {}),
            })),
          }));
          return;
        }
        if (error) reportError("catalog_db", error.message);
      } catch (e) {
        reportError("catalog_db", e instanceof Error ? e.message : "inconnu");
      }
    }
    catalog.value = FALLBACK_CATALOG;
  }

  /** sélection d'un classement du carrousel */
  async function selectList(e: CatalogEntry) {
    selectedSlug.value = e.slug;
    if (loadFromCache(e.url)) return; // version locale enrichie d'affiches
    if (e.films) {
      applyList(e.films, e.title, e.url);
      saveCache();
      localStorage.setItem("duelLast", e.url);
      setStatus("ok", `${e.title} · ${e.films.length} films`);
    } else {
      await loadList(e.url); // catalogue de secours : via proxys
    }
  }

  /* ---- affiche, année, réalisateur : récupérés à la demande (page film) ---- */
  const metaQ = new Map<string, Promise<void>>();
  function ensureMeta(f: Film | null | undefined): Promise<void> {
    if (!f || !f.slug || (f.poster !== undefined && f.director !== undefined)) return Promise.resolve();
    const slug = f.slug;
    if (metaQ.has(slug)) return metaQ.get(slug)!;
    const p = (async () => {
      try {
        const meta = parseFilmPage(await fetchHTML(f.url!));
        f.poster = meta.poster || f.poster || null;
        f.director = meta.director;
        if (!f.year && meta.year) f.year = meta.year;
      } catch {
        if (f.poster === undefined) f.poster = null;
        if (f.director === undefined) f.director = null;
      }
      saveCache();
    })();
    metaQ.set(slug, p);
    return p;
  }

  return {
    films, listTitle, listKey, status, loading, ready, maxRank,
    catalog, selectedSlug,
    setStatus, loadList, boot, ensureMeta, loadCatalog, selectList,
  };
});
