# Audit de sécurité — MovieGuesser

Dernier audit : **2026-07-06**. À rejouer via le skill `security-audit` après quelques MEP.

Delta 2026-07-06 (après le mode compétitif + consolidations) : toutes les probes
re-tiennent (profiles/lists/error_events + challenges/challenge_scores/RPC compétitive) ;
`consolidation.sql` vérifié appliqué (colonne `profiles.last_game_at` présente) —
record_game rate-limitée, FK challenges→lists posée. `pnpm audit --prod` : 0 vuln
(les 4 résiduelles restent dev-only, Vite 5). Nouveau depuis le 05/07 : la clé
service_role vit dans les secrets Actions (workflow refresh-lists, voir plus bas).

Delta 2026-07-06 bis (étape D — audit du mode « entre amis ») : les tables `friendships`,
`rooms`, `game_invites` et leurs RPC tiennent sous l'attaque, anonyme ET authentifiée
(deux sessions de test). Détail plus bas. Reste ouvert : le canal de jeu Realtime
(broadcast) n'est pas encore un canal privé — sa protection est l'UUID non devinable du
salon (voir « Accepté / à surveiller »).

## Score de validité (06/07/2026) : 7,5 / 10

Pondéré par ce que le site est — un jeu public sans données sensibles au-delà d'un pseudo
et d'un email chez Supabase. Sécurité des données **9** (RLS/RPC uniformes, zéro écriture
directe, tout vérifié par l'attaque, y compris la surface en ligne). Intégrité du jeu **6**
(scores compétitifs et parties en ligne restent déclaratifs / à confiance-hôte — plafond
tant qu'il n'y a pas de deck serveur). Le mode « entre amis » ne fait pas bouger le score
global : sa seule faiblesse (canal non privé) est bornée par le cercle d'invitation et
documentée. Prochain gain de note = deck tiré côté serveur (règle compétitif + en ligne)
et canaux Realtime privés.

## Modèle de menace (rappel)

Front statique public (Vue SPA sur GitHub Pages) + Supabase (auth OTP, Postgres RLS).
La **clé anon Supabase est publique par design** — elle finit dans le bundle JS. Toute la
sécurité des données repose sur les **policies RLS** et la **RPC** : l'audit consiste donc
surtout à *attaquer avec la clé anon* et vérifier que rien ne cède. Pas de secret côté
client, pas de backend applicatif à compromettre.

## Résultats du dernier audit

### ✅ Sain
- **Aucun secret dans l'historique git** (seul `.env.example` vide est versionné ;
  `.env.local` est gitignoré ; les clés CI vivent dans les secrets GitHub Actions).
- **Aucun sink XSS** : pas de `v-html`/`innerHTML`/`document.write`. Vue échappe tout.
  Les bindings `:src`/`:href` ne portent que des URLs `a.ltrbxd.com` / `letterboxd.com`
  issues de la DB curée, et le lien externe a `rel="noopener"`.
- **localStorage** ne contient que des données non sensibles (réglages, cache de listes).
- **RLS/RPC tiennent sous l'attaque** (probes avec la clé anon) :
  - update arbitraire d'un profil → `[]` (0 ligne)
  - insert dans le catalogue `lists` → `401`
  - `record_game` anonyme → `401`
  - lecture de `error_events` → `[]` (insert-only)
  - `profiles` : lecture publique de `username`/stats **assumée** (classements futurs) —
    pas d'email ni de donnée privée exposée.
- **CI** : permissions minimales (`contents:read`, `pages:write`, `id-token:write`).
- **Mode compétitif** (tables `challenges` / `challenge_scores`, probes du 05/07/2026) :
  - insert direct dans `challenges` → `42501` (RLS)
  - insert direct dans `challenge_scores` → `42501` (RLS)
  - update du défi (`rounds=50`) → `[]` (0 ligne)
  - `submit_challenge_score` anonyme → `permission denied` (execute réservé à
    `authenticated`)
  - côté fonction : session exigée, fenêtre temporelle vérifiée, score borné à
    `rounds × ceil(film_count/10)` (taille réelle de la liste du défi),
    une seule participation (PK + unique_violation).
- **Mode « entre amis »** (tables `friendships` / `rooms` / `game_invites`, probes du
  06/07/2026 — anonymes et **authentifiées à deux comptes de test**) :
  - anonyme : lecture `rooms`/`game_invites` → `[]` ; insert direct → `401` ;
    `create_room`/`invite_friend`/`join_room`/`add_friend` → `401`.
  - authentifié, garde-fous des RPC vérifiés par l'attaque :
    - inviter un joueur **non-ami** → « vous n'êtes pas amis » (amitié acceptée exigée) ;
    - lire le salon d'autrui (ni membre ni invité) → `[]` (RLS) ;
    - rejoindre un salon **sans invitation** → « invitation introuvable » ;
    - modifier la config d'un salon qu'on ne possède pas → « salon introuvable » ;
    - injecter une invitation en table directement → `403` (aucune policy d'insert).
  - `add_friend` : auto-ajout et pseudo inexistant refusés (déjà vérifié le 06/07).

### ⚠️ Accepté / à surveiller
- **Dépendances de dev** : 4 vulnérabilités résiduelles (vite/esbuild), toutes limitées
  au **serveur de dev local** — jamais dans le bundle de production. Leur correctif exige
  Vite 6 (montée majeure : Vitest 4 + plugin-vue). Reporté ; à refaire lors du passage Vite 6.
  Les 2 critiques + 1 haute de happy-dom/vitest ont été corrigées (montée vitest 3 / happy-dom 20).
- **Aucun en-tête de sécurité HTTP** (CSP, HSTS, X-Frame-Options) : GitHub Pages n'en
  pose pas et ne permet pas de les configurer. Impact réel faible (pas de cookie de
  session — l'auth Supabase est en localStorage, le clickjacking n'a pas d'action
  sensible à voler). Vraie solution le jour venu : passer le domaine derrière Cloudflare
  (proxy orange) et poser les en-têtes via une Transform Rule / Worker.
- **Proxys CORS tiers** (`allorigins`, `codetabs`, `corsproxy`) : ils voient les URLs
  Letterboxd requêtées (données publiques, aucun secret ne transite). Uniquement un
  chemin de secours désormais. Les remplacer par une Edge Function dédiée supprimerait
  cette dépendance externe.
- **Clé service_role dans les secrets GitHub Actions** (workflow `refresh-lists`,
  hebdomadaire) : elle contourne la RLS pour upserter la table `lists`. Elle ne doit
  JAMAIS apparaître côté client ni dans un log ; le workflow tourne avec
  `permissions: contents: read` et ne l'expose qu'à `scripts/ingest_lists.py`.
- **Actions CI épinglées par tag** (`@v4`) et non par SHA : une compromission d'une
  action populaire reste théoriquement possible. Épingler par SHA si le projet grossit.
- **error_events** : insertion ouverte à l'anonyme (plafonnée à 10/session côté client
  seulement). Un acteur malveillant peut spammer la table. Impact = bruit/coût, pas de
  fuite. Ajouter un rate-limit Postgres si ça devient un problème.
- ~~**record_game spammable**~~ **corrigé et vérifié par l'attaque** (06/07/2026, session
  de test authentifiée) : deux appels rapprochés → le 2ᵉ est refusé (« parties trop
  rapprochées », rate-limit 20 s via `profiles.last_game_at`). `challenges.list_slug` a
  aussi gagné sa FK vers `lists(slug)`. Vérifiés aussi en session réelle : `add_friend`
  refuse l'auto-ajout et les pseudos inexistants ; `friendships` ne montre que ses
  propres lignes.
- **Score compétitif calculé côté client** : la RPC borne (0 à rounds × ceil(films/10)) mais ne
  prouve pas le score — un joueur authentifié et motivé peut soumettre 500 via la
  console. Compromis assumé d'un site statique sans serveur de partie. Mitigations
  possibles le jour où le classement compte : envoyer le détail des manches
  (film + pari) et re-calculer le barème dans la RPC, ou passer par une Edge Function
  qui tire elle-même le deck (seed serveur).
- **Canal de jeu Realtime « entre amis » non privé** : la partie se déroule sur un canal
  broadcast `game:<roomId>`. Aujourd'hui, quiconque connaît le `roomId` peut s'y abonner
  (écoute/injection d'événements). Sa protection est l'**UUID v4 non devinable** du salon,
  qui n'est lisible que par les membres/invités (RLS sur `rooms`/`game_invites`) : pour
  connaître le nom du canal, il faut avoir été légitimement invité. Le mode étant réservé
  à un cercle d'amis (invitation obligatoire, amitié acceptée exigée), l'impact est faible
  — au pire un ancien invité rejoue le canal d'une partie passée. Vraie parade le jour venu :
  **Realtime Authorization** (canaux privés + RLS sur `realtime.messages`). L'intégrité de
  la partie repose par ailleurs sur l'honnêteté de l'hôte-arbitre (il tire le deck et
  calcule les verdicts) — acceptable entre amis, non transposable au compétitif.

## Purge post-audit
Les probes laissent des lignes `probe_audit` / `test_verif` dans `error_events` :
`delete from public.error_events where category in ('probe_audit','test_verif');`
(SQL Editor — la table n'est pas modifiable via la clé anon).
