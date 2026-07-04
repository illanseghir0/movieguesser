/* ============================================================
   letterboxd.ts — fonctions pures d'accès aux pages Letterboxd
   letterboxd.com n'autorise pas le cross-origin : on passe par des
   proxys CORS publics (avec fallback). Le parsing reprend scrape.py :
   - pages de liste : [data-item-slug] + data-item-name + data-list-index
   - page film (à la demande) : JSON-LD -> affiche portrait, réalisateur
   ============================================================ */

import type { Film } from "../types";
import { reportError } from "./telemetry";

const PROXIES: Array<(u: string) => string> = [
  (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
  (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
];
let proxyIdx = 0; // on retient le premier proxy qui marche

export async function fetchHTML(url: string): Promise<string> {
  for (let k = 0; k < PROXIES.length; k++) {
    const i = (proxyIdx + k) % PROXIES.length;
    try {
      const r = await fetch(PROXIES[i](url));
      if (r.ok) {
        const t = await r.text();
        if (t && t.length > 500) { proxyIdx = i; return t; }
      }
    } catch { /* proxy suivant */ }
  }
  reportError("proxy_failure", url);
  throw new Error("aucun proxy CORS disponible");
}

export function normListUrl(u: string): string | null {
  const m = String(u).trim().match(/letterboxd\.com\/([^/]+)\/list\/([^/?#]+)/i);
  return m ? `https://letterboxd.com/${m[1]}/list/${m[2]}/` : null;
}

export interface ListPage {
  title: string | null;
  totalPages: number | null;
  entries: Film[];
}

export function parseListPage(html: string, startIndex: number): ListPage {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const og = doc.querySelector('meta[property="og:title"]');
  const title = (og?.getAttribute("content") || doc.querySelector("h1")?.textContent || "")
    .split("•")[0].split(", a list")[0].trim() || null;
  const pg = [...doc.querySelectorAll(".paginate-page")]
    .map((e) => parseInt(e.textContent || "", 10)).filter((n) => n > 0);
  const totalPages = pg.length ? Math.max(...pg) : null;

  const entries: Film[] = [];
  doc.querySelectorAll("[data-item-slug]").forEach((n) => {
    const slug = n.getAttribute("data-item-slug");
    if (!slug) return;
    const nm = (n.getAttribute("data-item-name") || slug.replace(/-/g, " ")).trim();
    const m = nm.match(/^(.+?)\s+\((\d{4})\)\s*$/);
    const idx = n.getAttribute("data-list-index");
    entries.push({
      rank: idx != null ? +idx + 1 : startIndex + entries.length + 1,
      title: m ? m[1] : nm,
      year: m ? +m[2] : null,
      slug,
      url: `https://letterboxd.com/film/${slug}/`,
    });
  });
  return { title, totalPages, entries };
}

export interface FilmMeta {
  poster: string | null;
  director: string | null;
  year: number | null;
}

export function parseFilmPage(html: string): FilmMeta {
  const doc = new DOMParser().parseFromString(html, "text/html");
  // le JSON-LD contient l'affiche portrait (og:image n'est qu'un crop paysage)
  let ld: any = null;
  const sc = doc.querySelector('script[type="application/ld+json"]');
  if (sc) { try { ld = JSON.parse((sc.textContent || "").replace(/\/\*[\s\S]*?\*\//g, "")); } catch { /* ignore */ } }

  const poster: string | null =
    (ld && typeof ld.image === "string" && ld.image) ||
    doc.querySelector('meta[property="og:image"]')?.getAttribute("content") || null;

  const dirs: any[] = ld?.director ? (Array.isArray(ld.director) ? ld.director : [ld.director]) : [];
  const director = dirs.map((d) => d?.name).filter(Boolean).slice(0, 2).join(" & ") || null;

  const ym = (doc.querySelector('meta[property="og:title"]')?.getAttribute("content") || "").match(/\((\d{4})\)/);
  const year = ym ? +ym[1] : null;

  return { poster, director, year };
}
