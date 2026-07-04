# MovieGuesser

*A Letterboxd game* — jeux de devinettes pour cinéphiles. Premier mode : le duel
hot-seat « Guess the Rank » — un film s'affiche, chacun devine en secret son rang
dans un classement Letterboxd, le plus proche gagne. D'autres mini-jeux suivront
(deviner des titres, des réalisateurs…).

**Jouer :** ouvrir le site, coller l'URL de n'importe quelle liste Letterboxd classée
(ex. [Top 250 Films with the Most Fans](https://letterboxd.com/official/list/top-250-films-with-the-most-fans/)),
entrer les noms, lancer.

## Fonctionnalités

- **Catalogue curaté de classements** (table Supabase `lists`, films en JSONB) :
  l'utilisateur choisit dans un carrousel, aucune URL à saisir. Le catalogue
  s'alimente avec `scripts/ingest_lists.py` (génère `supabase/seed_lists.sql`
  à coller dans le SQL Editor). Sans DB, catalogue de secours embarqué chargé
  via proxys CORS publics
- Affiches portrait, année et réalisateur récupérés à la demande, film par film
- Cache localStorage par liste (7 jours) ; la dernière liste jouée est restaurée au retour
- Deux modes : nombre de manches (1 pt/manche) ou course aux points
  (le vainqueur d'une manche marque l'écart entre les deux estimations)
- Ordre de passage alterné, aléatoire ou fixe ; écran « Entracte » pour passer le téléphone
- Révélation animée en trois temps sur la ligne 1 → N, générique de fin avec stats et récap
- **Profils joueurs** (Supabase) : compte email/mot de passe, pseudo, stats persistées
  (parties, victoires, meilleur écart) — le profil connecté joue en Joueur 1

## Stack

Vue 3 (Composition API) + TypeScript + Pinia + Vite. Backend : Supabase (auth + Postgres),
optionnel — sans configuration Supabase, le jeu fonctionne intégralement en local,
le code profils est même exclu du bundle par tree-shaking.

```
src/
  App.vue                  racine : backdrop, router-view
  router.ts                routes (/seance, /profil, /jeu, /fin) + guards
  types.ts                 Film, RoundResult, Profile
  lib/
    letterboxd.ts          fonctions pures : proxys CORS, parsing listes/films
    telemetry.ts           compteurs d'erreurs + report vers error_events
    supabase.ts            client Supabase (null si non configuré)
    env.ts                 prefers-reduced-motion
  stores/                  Pinia
    list.ts                liste chargée, cache localStorage, métadonnées film
    settings.ts            réglages persistants (mode, manches, objectif, ordre)
    game.ts                boucle de jeu : manches, révélation, scores, fin
    profile.ts             session Supabase + profil + stats
  components/
    TheHeader.vue          titre + chip profil/connexion
    HomeScreen.vue         accueil : liste, joueurs, citation
    SettingsScreen.vue     paramètres + films.json local
    PlayScreen.vue         scoreboard, affiche, devinette, verdict
    RevealLine.vue         la ligne de révélation 1 -> N (chorégraphie)
    EndScreen.vue          générique de fin, stats, récap, confetti
    HandoffOverlay.vue     entracte (passage de l'écran)
    AuthModal.vue          connexion / création de profil
supabase/schema.sql        table profiles + RLS (à exécuter une fois)
supabase/hardening.sql     RPC record_game + télémétrie (à exécuter une fois)
supabase/seed_lists.sql    catalogue enrichi, généré par ingest_lists.py
scrape.py                  scraper Python optionnel -> films.json
public/films.json          Top 500 pré-scrapé (liste par défaut)
```

## Développement

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm typecheck  # vue-tsc
pnpm test       # vitest (logique de jeu, stores, parsing)
pnpm build      # -> dist/
```

## Configurer les profils (Supabase)

1. Créer un projet sur [supabase.com](https://supabase.com) (gratuit).
2. Dans le **SQL Editor**, exécuter `supabase/schema.sql`.
3. Copier `.env.example` vers `.env.local` et remplir `VITE_SUPABASE_URL` et
   `VITE_SUPABASE_ANON_KEY` (Dashboard → Settings → API).
4. Pour le site déployé : ajouter ces deux valeurs comme **secrets Actions** du repo
   GitHub (`Settings → Secrets and variables → Actions`), mêmes noms.

Sans ces étapes, le bouton « Connexion » n'apparaît pas et tout le reste fonctionne.

## Déploiement

GitHub Actions (`.github/workflows/deploy.yml`) : typecheck + build + publication sur
GitHub Pages à chaque push sur `main`. La source Pages du repo doit être réglée sur
« GitHub Actions ».

## Limites connues

Le contournement CORS repose sur des proxys publics (allorigins, codetabs, corsproxy) —
gratuits mais sans garantie. Pour fiabiliser : une Supabase Edge Function ou une
Cloudflare Worker en proxy dédié, à brancher dans `PROXIES` (`src/lib/letterboxd.ts`).
