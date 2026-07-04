#!/usr/bin/env python3
"""
ingest_lists.py — génère supabase/seed_lists.sql à partir des listes Letterboxd
du catalogue du jeu.

Usage (équipe du jeu, pour ajouter/mettre à jour des classements) :
    1. Ajouter l'URL dans LISTS ci-dessous
    2. python3 scripts/ingest_lists.py
    3. Coller supabase/seed_lists.sql dans le SQL Editor du dashboard Supabase

Les films sont stockés en JSONB enrichi (rank/title/year/slug/poster/director) :
l'affiche portrait et le réalisateur viennent de la page de chaque film
(JSON-LD), si bien que le client n'a AUCUN proxy à appeler pendant les parties.
Un cache disque (.meta_cache.json) rend les ré-exécutions quasi instantanées.
La cover du carrousel est l'og:image de la page de la liste.
"""

import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from bs4 import BeautifulSoup

LISTS = [
    "https://letterboxd.com/official/list/letterboxds-top-500-films/",
    "https://letterboxd.com/official/list/top-250-films-with-the-most-fans/",
    "https://letterboxd.com/official/list/july-report-2026-top-25-films-of-the-year/",
    "https://letterboxd.com/official/list/top-250-films-by-women-directors/",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "en;q=0.9",
}
DELAY = 0.4
WORKERS = 3            # enrichissement des pages film : parallélisme poli
OUT = Path(__file__).resolve().parent.parent / "supabase" / "seed_lists.sql"
META_CACHE = Path(__file__).resolve().parent / ".meta_cache.json"

LD_RE = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)


def film_meta(slug: str) -> dict:
    """Affiche portrait (JSON-LD), réalisateur (2 max) et année d'un film."""
    html = get(f"https://letterboxd.com/film/{slug}/")
    poster = director = None
    year = None
    m = LD_RE.search(html)
    if m:
        try:
            ld = json.loads(re.sub(r"/\*.*?\*/", "", m.group(1), flags=re.S))
            img = ld.get("image")
            poster = img if isinstance(img, str) else None
            d = ld.get("director") or []
            if isinstance(d, dict):
                d = [d]
            names = [x.get("name") for x in d if isinstance(x, dict) and x.get("name")]
            director = " & ".join(names[:2]) or None
        except (ValueError, TypeError):
            pass
    if not poster:  # secours : og:image (crop paysage, mieux que rien)
        m2 = re.search(r'<meta property="og:image" content="([^"]+)"', html)
        poster = m2.group(1) if m2 else None
    m3 = re.search(r'<meta property="og:title" content="[^"(]*\((\d{4})\)', html)
    if m3:
        year = int(m3.group(1))
    return {"poster": poster, "director": director, "year": year}


def enrich(entries: list) -> None:
    """Complète tous les films de toutes les listes (cache disque par slug)."""
    cache: dict = {}
    if META_CACHE.exists():
        cache = json.loads(META_CACHE.read_text(encoding="utf-8"))
    by_slug: dict = {}
    for e in entries:
        for f in e["films"]:
            by_slug.setdefault(f["slug"], f)
    todo = [s for s in by_slug if s not in cache]
    print(f"  {len(by_slug)} films uniques, {len(todo)} à récupérer "
          f"({len(by_slug) - len(todo)} en cache)")

    lock = threading.Lock()
    done = 0

    def work(slug: str) -> None:
        nonlocal done
        try:
            meta = film_meta(slug)
        except Exception:
            meta = {"poster": None, "director": None, "year": None}
        with lock:
            cache[slug] = meta
            done += 1
            if done % 50 == 0:
                print(f"    {done} / {len(todo)}", flush=True)
                META_CACHE.write_text(json.dumps(cache, ensure_ascii=False),
                                      encoding="utf-8")
        time.sleep(DELAY)

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        list(ex.map(work, todo))
    META_CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    for e in entries:
        for f in e["films"]:
            meta = cache.get(f["slug"]) or {}
            f["poster"] = meta.get("poster")
            f["director"] = meta.get("director")
            if not f.get("year") and meta.get("year"):
                f["year"] = meta["year"]


def get(url: str) -> str:
    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    return r.text


def scrape_list(base: str):
    slug = base.rstrip("/").split("/")[-1]
    films, seen = [], set()
    title = cover = None
    page = 1
    while page <= 20:
        html = get(base if page == 1 else f"{base}page/{page}/")
        soup = BeautifulSoup(html, "html.parser")
        if page == 1:
            og_t = soup.find("meta", property="og:title")
            raw = og_t["content"] if og_t and og_t.get("content") else slug
            title = raw.split("•")[0].split(", a list")[0].strip()
            og_i = soup.find("meta", property="og:image")
            cover = og_i["content"] if og_i and og_i.get("content") else None
        nodes = soup.select("[data-item-slug]")
        if not nodes:
            break
        for node in nodes:
            fslug = node.get("data-item-slug")
            if not fslug or fslug in seen:
                continue
            seen.add(fslug)
            name = (node.get("data-item-name") or fslug.replace("-", " ")).strip()
            m = re.match(r"^(.+?)\s+\((\d{4})\)\s*$", name)
            idx = node.get("data-list-index")
            films.append({
                "rank": int(idx) + 1 if idx is not None else len(films) + 1,
                "title": m.group(1) if m else name,
                "year": int(m.group(2)) if m else None,
                "slug": fslug,
            })
        page += 1
        time.sleep(DELAY)
    films.sort(key=lambda f: f["rank"])
    return {"slug": slug, "url": base, "title": title, "cover": cover, "films": films}


def sql_str(s):
    return "NULL" if s is None else "'" + s.replace("'", "''") + "'"


def main():
    entries = []
    print("1/2 Lecture des listes…")
    for url in LISTS:
        print(f"  {url}")
        entries.append(scrape_list(url))
        print(f"    -> {entries[-1]['title']} : {len(entries[-1]['films'])} films")

    print("2/2 Enrichissement (affiches portrait + réalisateurs)…")
    enrich(entries)

    parts = ["""-- généré par scripts/ingest_lists.py — à coller dans le SQL Editor Supabase
-- (idempotent : crée la table au besoin, met à jour les listes existantes)

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  url text not null,
  title text not null,
  cover_url text,
  film_count integer not null,
  films jsonb not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.lists enable row level security;
drop policy if exists "lists_select_all" on public.lists;
create policy "lists_select_all" on public.lists for select using (true);
-- pas de policy insert/update : le catalogue s'édite via ce script + SQL Editor
"""]
    for pos, e in enumerate(entries):
        films_json = json.dumps(e["films"], ensure_ascii=False, separators=(",", ":"))
        parts.append(f"""insert into public.lists (slug, url, title, cover_url, film_count, films, position)
values ({sql_str(e['slug'])}, {sql_str(e['url'])}, {sql_str(e['title'])}, {sql_str(e['cover'])},
        {len(e['films'])}, $films${films_json}$films$::jsonb, {pos})
on conflict (slug) do update set
  url = excluded.url, title = excluded.title, cover_url = excluded.cover_url,
  film_count = excluded.film_count, films = excluded.films, position = excluded.position;
""")
    OUT.write_text("\n".join(parts), encoding="utf-8")
    print(f"\n✓ {OUT} ({OUT.stat().st_size // 1024} Ko)")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(1)
