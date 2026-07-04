/* ============================================================
   stores/list.ts — la liste de films chargée + cache localStorage
   ============================================================ */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { Film } from "../types";
import { fetchHTML, normListUrl, parseFilmPage, parseListPage } from "../lib/letterboxd";

export type StatusType = "ok" | "err" | "info";

export const useListStore = defineStore("list", () => {
  const films = ref<Film[] | null>(null);
  const listTitle = ref<string | null>(null);
  const listKey = ref<string | null>(null); // URL normalisée -> clé de cache
  const status = ref<{ type: StatusType; msg: string } | null>(null);
  const loading = ref(false);

  const ready = computed(() => !!films.value?.length);
  const maxRank = computed(() =>
    films.value?.length ? films.value[films.value.length - 1].rank : 500);
  const headerTag = computed(() =>
    films.value ? `${listTitle.value} · ${films.value.length} films` : "aucune liste chargée");

  function setStatus(type: StatusType, msg: string) { status.value = { type, msg }; }

  function applyList(list: Film[], title: string | null, key: string | null) {
    films.value = list;
    listTitle.value = title || "Liste Letterboxd";
    listKey.value = key;
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

  /* ---- films.json (secours local, produit par scrape.py) ---- */
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

  function loadJSONFile(f: File) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const data = JSON.parse(String(fr.result));
        if (!Array.isArray(data) || !data.length) throw 0;
        applyList(normFilms(data), "films.json", null);
        setStatus("ok", `films.json · ${data.length} films`);
      } catch {
        setStatus("err", "Fichier illisible — attendu : le films.json de scrape.py");
      }
    };
    fr.readAsText(f);
  }

  /* ---- boot : films.json à côté de la page, sinon dernière liste jouée ---- */
  async function boot(): Promise<string | null> {
    try {
      const r = await fetch(import.meta.env.BASE_URL + "films.json");
      const d = r.ok ? await r.json() : null;
      if (d && Array.isArray(d) && d.length) {
        applyList(normFilms(d), "films.json", null);
        return null;
      }
    } catch { /* pas de films.json servi */ }
    const last = localStorage.getItem("duelLast");
    if (last && loadFromCache(last)) return last;
    return null;
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
    films, listTitle, listKey, status, loading, ready, maxRank, headerTag,
    setStatus, loadList, loadJSONFile, boot, ensureMeta,
  };
});
