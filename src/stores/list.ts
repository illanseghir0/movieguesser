/* ============================================================
   stores/list.ts — la liste de films chargée + cache localStorage
   ============================================================ */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { CatalogEntry, DbFilmJson, DbListFull, DbListLight, Film } from "../types";
import { fetchHTML, normListUrl, parseFilmPage } from "../lib/letterboxd";
import { scrapeListPages } from "../lib/legacyScrape";
import { FALLBACK_CATALOG } from "../lib/catalog";
import { supabase } from "../lib/supabase";
import { reportError } from "../lib/telemetry";

/** fraîcheur du cache local d'une liste : les classements officiels
    Letterboxd bougent ~chaque semaine et l'ingestion tourne le lundi —
    24 h de cache = jamais plus d'un jour de retard sur la DB */
const CACHE_TTL = 24 * 3600e3;

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

  /** retire les caches de liste périmés ou corrompus (sinon chaque liste
      jouée laisse ~50-100 Ko pour toujours, jusqu'au quota) */
  function purgeExpiredCaches() {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (!k?.startsWith("duelList:")) continue;
        try {
          const c = JSON.parse(localStorage.getItem(k) || "null");
          if (!c || typeof c.t !== "number" || Date.now() - c.t >= CACHE_TTL) {
            localStorage.removeItem(k);
          }
        } catch { localStorage.removeItem(k); }
      }
    } catch { /* localStorage indisponible */ }
  }

  function saveCache() {
    if (!listKey.value) return;
    const payload = JSON.stringify({ t: Date.now(), title: listTitle.value, films: films.value });
    try {
      localStorage.setItem("duelList:" + listKey.value, payload);
    } catch {
      // quota atteint : on fait de la place et on retente une fois
      purgeExpiredCaches();
      try { localStorage.setItem("duelList:" + listKey.value, payload); }
      catch { /* toujours plein : tant pis */ }
    }
  }

  /** remember=false : ne pas retenir comme « dernière liste jouée »
      (le mode compétitif ne doit pas écraser le choix du mode local) */
  function loadFromCache(base: string, remember = true): boolean {
    try {
      const c = JSON.parse(localStorage.getItem("duelList:" + base) || "null");
      if (c && Date.now() - c.t < CACHE_TTL && Array.isArray(c.films) && c.films.length) {
        applyList(c.films, c.title, base);
        if (remember) localStorage.setItem("duelLast", base);
        setStatus("ok", `${c.title} · ${c.films.length} films`);
        return true;
      }
    } catch { /* cache corrompu */ }
    return false;
  }

  /** LEGACY : aspiration via proxys (voir lib/legacyScrape) — secours
      uniquement, quand ni le cache ni la DB n'ont la liste */
  async function loadList(url: string, remember = true) {
    const base = normListUrl(url);
    if (!base) { setStatus("err", "URL invalide — attendu : letterboxd.com/…/list/…"); return; }
    if (loadFromCache(base, remember)) return;

    loading.value = true;
    try {
      const scraped = await scrapeListPages(base, (page, totalPages) =>
        setStatus("info", `Récupération — page ${page}${totalPages ? ` / ${totalPages}` : ""}…`));
      applyList(scraped.films, scraped.title, base);
      saveCache();
      if (remember) localStorage.setItem("duelLast", base);
      setStatus("ok", `${scraped.title} · ${scraped.films.length} films`);
    } catch {
      setStatus("err", "Liste inaccessible (proxys indisponibles ou liste privée) — réessaie dans un instant");
    } finally {
      loading.value = false;
    }
  }

  /* ---- films.json pré-scrapé, servi à côté de la page (secours sans DB :
          affiches paysage, pas de réalisateur -> ensureMeta complètera) ---- */
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

  /** mapping d'un film JSONB de la table `lists` (enrichi à l'ingestion) :
      si affiche + réalisateur sont présents, aucun proxy pendant la partie ;
      clés absentes (anciennes données) -> chemin paresseux conservé */
  function mapDbFilm(f: DbFilmJson): Film {
    return {
      rank: +f.rank, title: String(f.title), year: f.year ?? null,
      slug: f.slug ?? null,
      url: f.slug ? `https://letterboxd.com/film/${f.slug}/` : null,
      ...("poster" in f ? { poster: f.poster ?? null } : {}),
      ...("director" in f ? { director: f.director ?? null } : {}),
    };
  }

  /** les films d'une seule liste, à la demande (le catalogue est léger :
      le JSONB n'est jamais téléchargé en masse au démarrage) */
  async function fetchDbList(slug: string): Promise<{ url: string; title: string; films: Film[] } | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from("lists").select("url,title,films").eq("slug", slug).maybeSingle();
      if (error) { reportError("list_films_db", error.message); return null; }
      const row = data as DbListFull | null;
      if (!row || !Array.isArray(row.films) || !row.films.length) return null;
      return { url: row.url, title: row.title, films: row.films.map(mapDbFilm) };
    } catch (e) {
      reportError("list_films_db", e instanceof Error ? e.message : "inconnu");
      return null;
    }
  }

  const DEFAULT_SLUG = "letterboxds-top-500-films";

  /* ---- boot : dernière liste jouée, sinon le Top 500 par défaut
          (depuis la DB — enrichi et mis en cache — sinon films.json) ---- */
  async function boot(): Promise<string | null> {
    purgeExpiredCaches();
    const savedLast = localStorage.getItem("duelLast");
    if (savedLast && loadFromCache(savedLast)) return savedLast;
    const def = await fetchDbList(DEFAULT_SLUG);
    if (def) {
      applyList(def.films, def.title, def.url);
      saveCache(); // prochaine visite : zéro requête
      setStatus("ok", `${def.title} · ${def.films.length} films`);
      return null;
    }
    try {
      const r = await fetch(import.meta.env.BASE_URL + "films.json");
      const d = r.ok ? await r.json() : null;
      if (d && Array.isArray(d) && d.length) {
        applyList(normFilms(d), "Letterboxd's Top 500 Films", null);
        selectedSlug.value = DEFAULT_SLUG;
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
          .select("slug,url,title,cover_url,film_count")
          .order("position");
        if (!error && data?.length) {
          catalog.value = (data as DbListLight[]).map((r): CatalogEntry => ({
            slug: r.slug, url: r.url, title: r.title,
            cover: r.cover_url ?? null, count: r.film_count,
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

  /** sélection d'un classement du carrousel : cache local, sinon les films
      de cette seule liste depuis la DB, sinon les proxys (secours).
      remember=false pour une sélection hors mode local (défi compétitif). */
  async function selectList(e: CatalogEntry, remember = true) {
    selectedSlug.value = e.slug;
    if (loadFromCache(e.url, remember)) return; // version locale enrichie d'affiches
    const db = await fetchDbList(e.slug);
    if (db) {
      applyList(db.films, e.title, e.url);
      saveCache();
      if (remember) localStorage.setItem("duelLast", e.url);
      setStatus("ok", `${e.title} · ${db.films.length} films`);
    } else {
      await loadList(e.url, remember); // catalogue de secours : via proxys
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
