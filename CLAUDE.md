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
Backend : Supabase (auth OTP, Postgres, RLS). Tests : Vitest 3 + happy-dom 20. Déploiement :
push sur `main` → GitHub Actions (typecheck + tests + build) → Pages sur movieguesser.fr.

```
src/router.ts         /, /nouvelle-seance (choix du mode), /seance, /profil, /jeu, /fin,
                      /competitif (+ /jeu, /fin) — guards : routes de jeu si round > 0
src/stores/game.ts    boucle de jeu ; kind "local" (duel) ou "compet" (solo) ; router.push
src/stores/compet.ts  défi actif + classement + envoi du score (RPC submit_challenge_score)
src/stores/list.ts    catalogue léger (table lists SANS le JSONB films) ; les films d'une
                      liste sont fetchés par slug à la sélection ; cache localStorage 24 h
                      (purgé au boot) ; films.json = secours sans DB (pas de réalisateur)
src/lib/playKit.ts    mécanique partagée des écrans de jeu (saisie, compteur de rang) ;
                      + useTurnTimer.ts (chrono) et PosterZone.vue (affiche + tilt)
src/lib/legacyScrape.ts scraping via proxys — SECOURS uniquement, à supprimer un jour
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
  Le JSONB n'est **jamais téléchargé en masse** : catalogue léger au boot (~1 Ko), films
  d'une seule liste par `eq.slug` à la sélection (puis cache localStorage 24 h). Le chrono
  de tour (`src/lib/useTurnTimer.ts`) est basé sur l'horloge réelle, pas sur des ticks
  — ne pas revenir à un décompte setInterval (contournable en gelant l'onglet).
- **Le profil connecté = Joueur 1** des parties locales ; ses stats s'écrivent uniquement
  via la RPC `record_game` (security definer, incréments bornés, rate-limit 20 s via
  `profiles.last_game_at`). Pas d'update direct.
- **Auth par code OTP email** (signInWithOtp/verifyOtp), pas de mot de passe.
- **`scoreShown` ≠ `score`** : le score affiché ne rattrape le réel qu'au temps 3 de la
  révélation (1100 ms / 2450 ms). C'est un choix de game design testé — ne pas « simplifier ».
- **Ordre de passage** alterné ou aléatoire ; l'écran Entracte s'affiche avant CHAQUE joueur
  (secret des devinettes). Ancienne option « Toujours J1 » supprimée, migrée vers alterné.
- **Mode compétitif** : solo, règles fixées par l'équipe dans la table `challenges`
  (liste, manches, chrono) — jamais modifiables par le joueur. Barème par manche :
  `ceil((taille de la liste - écart)/10)` (helper `competPoints`, normalisé pour que
  petites et grandes listes restent comparables). Une seule participation par joueur
  et par défi, appliquée par la RPC `submit_challenge_score` (security definer, bornes,
  fenêtre temporelle) ; l'abandon ne consomme pas la participation. Jouable sans compte
  mais hors classement. SQL : `supabase/competitif.sql` (idempotent ; relancer son
  dernier bloc pour créer les défis suivants).
- **Mode en ligne « entre amis » (chantier en cours, décisions validées)** : duel strict
  à 2 joueurs ; les deux barèmes du duel local au choix de l'hôte ; devinettes
  simultanées (pas d'entracte en ligne) ; amis dans Le club (pas de nouvelle entrée de
  menu) ; architecture hybride — amis/invitations/salons en DB (RLS + RPC), déroulé de
  partie sur canal Realtime éphémère avec l'hôte arbitre ; quitter dissout le salon,
  rien de persistant. Présence en ligne via Realtime Presence (zéro écriture DB).
  Étapes : A amis (fait en premier) → B salons+invitations → C partie → D audit.
- Base Vite `/` (domaine racine). L'ancienne URL github.io/movieguesser redirige.
- `404.html` = copie d'index.html (fallback SPA GitHub Pages) — généré par `pnpm build`.

## Direction artistique — règle dure

Le propriétaire refuse la « vibe IA » : pas de cartes vitrées arrondies, pas de dégradés
animés sur le texte, pas de grilles de features. Le style est **éditorial cinéma**
(Criterion/A24) : Bebas Neue pour les titres, Georgia italique pour les textes culturels,
filets fins, menu-sommaire, boutons et cartes « ticket » crantés, grain de pellicule.
**Palette : monochrome crème/blanc** (`--cream:#f2ead6`, muted `#8b9aa7`) — les couleurs
« Letterboxd » (vert `--p1`, bleu `--p2`, orange `--true`) ne sont PLUS décoratives :
elles subsistent uniquement comme marqueurs fonctionnels PENDANT la partie (scoreboard,
marqueurs de la ligne, verdict, états d'erreur) — plus une exception festive validée :
les confettis du générique de fin. Accueil, séance, profil et générique
de fin sont neutres. Copy en français, ton cinéphile (Séance, Entracte, Générique,
Carte de membre, Le club, Admit One). Respecter `prefers-reduced-motion` (`REDUCE`).

## État actuel et chantier en cours

- ✅ **La connexion OTP est pleinement fonctionnelle** (vérifié le 06/07/2026) :
  Resend configuré (DNS OVH : DKIM/SPF/MX/DMARC en place), SMTP custom dans Supabase,
  emails envoyés par `noreply@movieguesser.fr` avec le code à 6 chiffres
  (template de référence : `supabase/email-otp-template.html`).
- Reste à faire (validé) : favicon + og:image + disclaimer « non affilié à Letterboxd »,
  mode solo, achievements, multijoueur.
- Le champ `packageManager` pointe pnpm ; Node ≥ 22 requis (CI sur Node 24).

## Fragilités et pièges connus

- **Supabase SMTP par défaut ≈ 2 emails/heure** — cause d'échecs silencieux d'envoi de code.
- Les listes se rafraîchissent **automatiquement chaque lundi** (workflow `refresh-lists` :
  ingestion + upsert direct en DB avec la clé service_role en secret GitHub Actions ;
  relançable à la main via `gh workflow run refresh-lists.yml`). Les listes officielles
  Letterboxd bougent ~chaque semaine ; le cache client de 24 h fait le reste.
  ⚠️ Un défi compétitif joue sur la liste **courante** : elle peut bouger en cours de défi
  (léger biais assumé ; snapshotter la liste dans `challenges` si ça devient un problème).
- `deploy-pages` échoue parfois « try again later » : le workflow a un retry intégré ;
  si les deux tentatives échouent, `gh run rerun <id> --failed` suffit.
- Vitest est **en v3** (Vitest 4 exige Vite 6 ; on est en Vite 5). Monter Vite 6 + Vitest 4
  ensemble le jour venu. `tests/setup.ts` stubbe localStorage (celui de happy-dom/Node 25
  est incomplet). Les tests neutralisent les env Supabase (vite.config `test.env`).
- Clés localStorage héritées : `gtrCfg`, `duelList:<url>`, `duelLast` — les renommer
  perdrait les réglages/caches des joueurs.
- `.env.local` (non versionné) contient les clés Supabase du projet réel — s'en servir
  pour les vérifications REST, ne jamais l'afficher ni le committer.
- L'ingestion Python a un cache disque `scripts/.meta_cache.json` (gitignoré).
- Sécurité : audit dans `docs/SECURITY.md`, rejouable via le skill `security-audit`
  (à relancer après quelques MEP). La clé anon est publique — la sécurité repose sur
  les policies RLS + la RPC `record_game`. 4 vulns dev résiduelles (vite/esbuild,
  serveur de dev only) attendent le passage Vite 6.

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
