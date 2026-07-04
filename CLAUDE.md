# MovieGuesser — guide agent

Site en production : **https://movieguesser.fr** · Repo : `illanseghir0/movieguesser` (GitHub Pages via Actions)

## Objectif général

MovieGuesser est une collection de mini-jeux de devinettes ciné, pilotée par un développeur
solo avec assistance IA. Le premier mode, « Guess the Rank », est un duel hot-seat : un film
s'affiche, deux joueurs devinent en secret son rang dans un classement Letterboxd, le plus
proche gagne. Roadmap validée : mode solo, autres types de devinettes (titres, réalisateurs…),
achievements, multijoueur en ligne (Supabase Realtime).

## Stack et architecture

Vue 3 (Composition API) + TypeScript strict + Pinia + vue-router + Vite. **pnpm** (pas npm).
Backend : Supabase (auth OTP, Postgres, RLS). Tests : Vitest 2 + happy-dom 15. Déploiement :
push sur `main` → GitHub Actions (typecheck + tests + build) → Pages sur movieguesser.fr.

```
src/router.ts         /, /seance, /profil, /jeu, /fin — guards : /jeu et /fin exigent round > 0
src/stores/game.ts    boucle de jeu ; navigue via router.push (pas d'enum screen)
src/stores/list.ts    catalogue (table lists), sélection, cache localStorage 7j, ensureMeta
src/stores/settings.ts réglages persistés (clé localStorage héritée : gtrCfg — ne pas renommer)
src/stores/profile.ts auth OTP email + profil + stats via RPC record_game
src/lib/letterboxd.ts fetch via proxys CORS + parsing (fallback seulement, voir Fragilités)
src/lib/telemetry.ts  reportError() → console + table error_events (max 10/session)
scripts/ingest_lists.py alimente le catalogue (voir skill add-ranking)
supabase/*.sql        schema, hardening (RPC + policies), seed_lists (généré)
```

## Décisions structurantes (ne pas re-litiger sans raison)

- **Données de jeu 100 % en DB** : la table `lists` contient les films en JSONB **enrichi**
  (rank/title/year/slug/poster/director). Aucun proxy CORS pendant une partie normale.
  Les proxys (allorigins → codetabs → corsproxy) ne restent que pour d'anciens caches.
- **Le profil connecté = Joueur 1** des parties locales ; ses stats s'écrivent uniquement
  via la RPC `record_game` (security definer, incréments bornés). Pas d'update direct.
- **Auth par code OTP email** (signInWithOtp/verifyOtp), pas de mot de passe.
- **`scoreShown` ≠ `score`** : le score affiché ne rattrape le réel qu'au temps 3 de la
  révélation (1100 ms / 2450 ms). C'est un choix de game design testé — ne pas « simplifier ».
- **Ordre de passage** alterné ou aléatoire ; l'écran Entracte s'affiche avant CHAQUE joueur
  (secret des devinettes). Ancienne option « Toujours J1 » supprimée, migrée vers alterné.
- Base Vite `/` (domaine racine). L'ancienne URL github.io/movieguesser redirige.
- `404.html` = copie d'index.html (fallback SPA GitHub Pages) — généré par `pnpm build`.

## Direction artistique — règle dure

Le propriétaire refuse la « vibe IA » : pas de cartes vitrées arrondies, pas de dégradés
animés sur le texte, pas de grilles de features. Le style est **éditorial cinéma**
(Criterion/A24) : Bebas Neue pour les titres, Georgia italique pour les textes culturels,
crème `--cream:#f2ead6`,
filets fins, menu-sommaire, boutons « ticket » crantés, grain de pellicule. Copy en
français, ton cinéphile (Séance, Entracte, Générique, Carte de membre, Le club).
Respecter `prefers-reduced-motion` partout (constante `REDUCE`).

## État actuel et chantier en cours

- ⚠️ **La connexion OTP est déployée côté code mais PAS fonctionnelle** : Supabase
  n'envoie encore que le lien magique par défaut (template non éditable sans SMTP custom).
  Étape en cours : l'utilisateur configure Resend (domaine movieguesser.fr à vérifier
  chez Resend + entrées DNS chez OVH), puis SMTP dans Supabase, puis template avec
  `{{ .Token }}`. Tant que ce n'est pas fait, tester la connexion échoue naturellement.
- Reste à faire (validé) : favicon + og:image + disclaimer « non affilié à Letterboxd »,
  mode solo, achievements, multijoueur.
- Le champ `packageManager` pointe pnpm ; Node ≥ 22 requis (CI sur Node 24).

## Fragilités et pièges connus

- **Supabase SMTP par défaut ≈ 2 emails/heure** — cause d'échecs silencieux d'envoi de code.
- Les vieux tops évolutifs (July Report) se rafraîchissent en relançant l'ingestion (manuel).
- `deploy-pages` échoue parfois « try again later » : le workflow a un retry intégré ;
  si les deux tentatives échouent, `gh run rerun <id> --failed` suffit.
- Vitest est **épinglé en v2** (Vitest 4 exige Vite 6 ; on est en Vite 5). Monter les deux
  ensemble le jour venu. `tests/setup.ts` stubbe localStorage (celui de happy-dom/Node 25
  est incomplet). Les tests neutralisent les env Supabase (vite.config `test.env`).
- Clés localStorage héritées : `gtrCfg`, `duelList:<url>`, `duelLast` — les renommer
  perdrait les réglages/caches des joueurs.
- `.env.local` (non versionné) contient les clés Supabase du projet réel — s'en servir
  pour les vérifications REST, ne jamais l'afficher ni le committer.
- L'ingestion Python a un cache disque `scripts/.meta_cache.json` (gitignoré).

## Approche à adopter (consignes au futur agent)

1. **Jamais de push sans** `pnpm typecheck && pnpm test` verts. La CI bloque de toute
   façon, mais ne gaspille pas un cycle.
2. Toute modification de la logique de jeu (stores game/settings/list) **doit ajuster ou
   ajouter des tests** — c'est le filet posé exprès avant les futurs modes.
3. Déployer = pousser sur main, puis **vérifier réellement** (voir skill `deploy-verify`) :
   run vert + curl sur movieguesser.fr. Ne jamais annoncer « déployé » sans preuve.
4. Les actions dashboard Supabase (SQL Editor, templates email, SMTP) **ne sont pas
   scriptables avec la clé anon** : préparer les fichiers SQL/instructions, demander à
   l'utilisateur de coller, puis vérifier via REST (skill `supabase-ops`).
5. L'utilisateur est le directeur artistique : sur un changement visuel, livrer puis
   itérer sur son retour. Sur la logique, être force de proposition argumentée.
6. Communiquer en français. Petites phrases de statut pendant le travail, résumé
   orienté résultat à la fin.
7. Nouveaux modes de jeu : un composant écran + une route + réutiliser les stores ;
   ne pas dupliquer la logique de `game.ts`, l'étendre ou l'extraire.

## Commandes

```bash
pnpm dev / typecheck / test / build      # build inclut la copie 404.html
python3 scripts/ingest_lists.py          # ré-génère supabase/seed_lists.sql
gh run list -R illanseghir0/movieguesser # état CI (gh est authentifié)
```
