---
name: add-ranking
description: Ajouter ou rafraîchir un classement Letterboxd dans le catalogue du jeu (table lists). À utiliser quand l'utilisateur donne une URL de liste à ajouter, ou pour mettre à jour un top évolutif (ex. July Report).
---

# Ajouter un classement au catalogue

Le catalogue vit dans la table Supabase `lists` (films en JSONB enrichi : affiche portrait
+ réalisateur + année par film). Il s'alimente hors-ligne par script — jamais depuis le client.

## Étapes

1. Ajouter l'URL dans la constante `LISTS` de `scripts/ingest_lists.py`
   (format `https://letterboxd.com/<user>/list/<slug>/`).
2. Lancer `python3 scripts/ingest_lists.py` — **en arrière-plan si > ~100 nouveaux films**
   (l'enrichissement tourne à ~40 films/min ; cache disque `scripts/.meta_cache.json`,
   les relances sont incrémentales).
3. Contrôler le résultat : le script écrit `supabase/seed_lists.sql` (idempotent, contient
   le DDL). Vérifier qu'un échantillon a bien `poster` (idéalement `film-poster` = portrait)
   et `director`.
4. **Demander à l'utilisateur** de coller `seed_lists.sql` dans le SQL Editor Supabase
   (non scriptable avec la clé anon).
5. Vérifier via REST après son retour :
   ```bash
   set -a; source .env.local; set +a
   curl -s "$VITE_SUPABASE_URL/rest/v1/lists?select=slug,title,film_count&order=position" \
     -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
   ```
6. Optionnel : ajouter l'entrée (avec cover) dans `FALLBACK_CATALOG` (`src/lib/catalog.ts`)
   pour le mode dégradé sans DB.

## Notes

- Le rang à deviner = position dans la liste : ne prendre que des listes **classées**.
- Scraper poliment : le script gère délais et workers, ne pas les augmenter.
- Les caches localStorage des joueurs expirent en 7 jours — une mise à jour de liste
  met donc jusqu'à 7 jours à atteindre ceux qui l'ont déjà jouée.
