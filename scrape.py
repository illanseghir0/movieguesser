#!/usr/bin/env python3
"""
scrape.py — Extrait "Letterboxd's Top 500 Films" vers films.json

Produit un fichier films.json :
    [{ "rank": 1, "title": "Harakiri", "year": 1962,
       "slug": "harakiri", "poster": "https://...", "url": "https://..." }, ...]

Usage :
    pip install requests beautifulsoup4
    python scrape.py                # -> films.json (affiches en URL distante)
    python scrape.py --download     # -> télécharge aussi les affiches dans ./posters
    python scrape.py --limit 20     # pour tester rapidement sur 20 films

Notes :
- Pas d'API ni de credentials : on lit les pages publiques de la liste.
- Politesse : ~0,3 s entre les requêtes + un User-Agent explicite.
- Cache : les pages film déjà visitées sont mémorisées dans films_cache.json,
  donc une 2e exécution est quasi instantanée (utile si ça coupe en route).
"""

import argparse
import json
import os
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

LIST_URL = "https://letterboxd.com/official/list/letterboxds-top-500-films/"
BASE = "https://letterboxd.com"
HEADERS = {
    # Un UA réaliste évite les réponses tronquées.
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/124.0 Safari/537.36",
    "Accept-Language": "en;q=0.9",
}
DELAY = 0.3            # secondes entre deux requêtes
CACHE_FILE = "films_cache.json"
OUT_FILE = "films.json"
POSTER_DIR = "posters"


def get(url):
    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    return r.text


def scrape_list():
    """Parcourt les pages de la liste et renvoie [(rank, slug, title), ...]."""
    entries = []
    seen = set()
    page = 1
    while True:
        url = LIST_URL if page == 1 else f"{LIST_URL}page/{page}/"
        print(f"  page {page} …", flush=True)
        soup = BeautifulSoup(get(url), "html.parser")

        # Chaque film = un div.react-component portant data-item-slug.
        nodes = soup.select("[data-item-slug]")
        if not nodes:
            break

        for node in nodes:
            slug = node.get("data-item-slug")
            if not slug or slug in seen:
                continue
            seen.add(slug)
            # data-item-name contient "Titre (Année)" — on sépare le titre de l'année.
            item_name = node.get("data-item-name") or slug.replace("-", " ").title()
            m = re.match(r'^(.+?)\s+\((\d{4})\)\s*$', item_name.strip())
            title = m.group(1) if m else item_name.strip()
            # Rang explicite dans data-list-index (0-based).
            idx = node.get("data-list-index")
            rank = int(idx) + 1 if idx is not None else len(entries) + 1
            entries.append((rank, slug, title.strip()))

        page += 1
        if page > 10:  # garde-fou
            break
        time.sleep(DELAY)
    return entries


def film_details(slug, cache):
    """Renvoie (poster_url, year) pour un film, en utilisant un cache disque."""
    if slug in cache:
        c = cache[slug]
        return c.get("poster"), c.get("year")

    url = f"{BASE}/film/{slug}/"
    soup = BeautifulSoup(get(url), "html.parser")

    poster = None
    og_img = soup.find("meta", property="og:image")
    if og_img and og_img.get("content"):
        poster = og_img["content"]

    year = None
    og_title = soup.find("meta", property="og:title")
    if og_title and og_title.get("content"):
        m = re.search(r"\((\d{4})\)", og_title["content"])
        if m:
            year = int(m.group(1))

    cache[slug] = {"poster": poster, "year": year}
    time.sleep(DELAY)
    return poster, year


def download_poster(url, slug):
    """Télécharge une affiche en local et renvoie le chemin relatif."""
    if not url:
        return None
    os.makedirs(POSTER_DIR, exist_ok=True)
    ext = os.path.splitext(url.split("?")[0])[1] or ".jpg"
    path = os.path.join(POSTER_DIR, f"{slug}{ext}")
    if not os.path.exists(path):
        r = requests.get(url, headers=HEADERS, timeout=30)
        r.raise_for_status()
        with open(path, "wb") as f:
            f.write(r.content)
        time.sleep(DELAY)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true",
                    help="télécharge les affiches dans ./posters")
    ap.add_argument("--limit", type=int, default=0,
                    help="ne traite que les N premiers films (test)")
    args = ap.parse_args()

    # Cache des pages film déjà visitées.
    cache = {}
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, encoding="utf-8") as f:
            cache = json.load(f)

    print("1/2 Lecture de la liste…")
    entries = scrape_list()
    if args.limit:
        entries = entries[: args.limit]
    print(f"    {len(entries)} films trouvés.")

    print("2/2 Récupération des affiches + années…")
    films = []
    try:
        for rank, slug, title in entries:
            poster, year = film_details(slug, cache)
            if args.download:
                poster = download_poster(poster, slug)
            films.append({
                "rank": rank,
                "title": title,
                "year": year,
                "slug": slug,
                "poster": poster,
                "url": f"{BASE}/film/{slug}/",
            })
            if rank % 25 == 0:
                print(f"    {rank} / {len(entries)}", flush=True)
    finally:
        # Toujours sauver le cache, même en cas d'interruption.
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=0)

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(films, f, ensure_ascii=False, indent=2)
    print(f"\n✓ {len(films)} films écrits dans {OUT_FILE}")
    if args.download:
        print(f"✓ affiches téléchargées dans ./{POSTER_DIR}/")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrompu. Relance la commande : le cache reprend où ça s'est arrêté.")
        sys.exit(1)
