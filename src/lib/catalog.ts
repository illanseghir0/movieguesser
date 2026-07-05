/* ============================================================
   catalog.ts — catalogue de secours embarqué
   Utilisé quand Supabase est absent ou que la table `lists`
   n'est pas encore alimentée : mêmes classements, films chargés
   via les proxys CORS au lieu de la DB.
   (source de vérité : supabase/seed_lists.sql, généré par
   scripts/ingest_lists.py)
   ============================================================ */

import type { CatalogEntry } from "../types";

export const FALLBACK_CATALOG: CatalogEntry[] = [
  {
    slug: "letterboxds-top-500-films",
    url: "https://letterboxd.com/official/list/letterboxds-top-500-films/",
    title: "Letterboxd's Top 500 Films",
    cover: "https://a.ltrbxd.com/resized/sm/upload/7g/p5/0v/14/harakiri-1200-1200-675-675-crop-000000.jpg?v=9e264a0309",
    count: 500,
  },
  {
    slug: "top-250-films-with-the-most-fans",
    url: "https://letterboxd.com/official/list/top-250-films-with-the-most-fans/",
    title: "Top 250 Films with the Most Fans",
    cover: "https://a.ltrbxd.com/resized/sm/upload/r4/0u/oq/0i/interstellar-1200-1200-675-675-crop-000000.jpg?v=fc649141b5",
    count: 250,
  },
  {
    slug: "july-report-2026-top-25-films-of-the-year",
    url: "https://letterboxd.com/official/list/july-report-2026-top-25-films-of-the-year/",
    title: "July Report 2026: Top 25 films of the year so far",
    cover: "https://a.ltrbxd.com/resized/alternative-backdrop/6/1/1/2/8/8/tmdb/o2xLxY1LdwBMsrGD9hjIaOrIQm6-1200-1200-675-675-crop-000000.jpg?v=70f2fabccc",
    count: 25,
  },
  {
    slug: "top-250-films-by-women-directors",
    url: "https://letterboxd.com/official/list/top-250-films-by-women-directors/",
    title: "Top 250 Films by Women Directors",
    cover: "https://a.ltrbxd.com/resized/sm/upload/pn/lo/pe/jr/city-of-god-1200-1200-675-675-crop-000000.jpg?v=b03d621f8a",
    count: 250,
  },
];
