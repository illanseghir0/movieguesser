# Audit de sécurité — MovieGuesser

Dernier audit : **2026-07-05**. À rejouer via le skill `security-audit` après quelques MEP.

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
    `rounds × 50`, une seule participation (PK + unique_violation).

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
- **Actions CI épinglées par tag** (`@v4`) et non par SHA : une compromission d'une
  action populaire reste théoriquement possible. Épingler par SHA si le projet grossit.
- **error_events** : insertion ouverte à l'anonyme (plafonnée à 10/session côté client
  seulement). Un acteur malveillant peut spammer la table. Impact = bruit/coût, pas de
  fuite. Ajouter un rate-limit Postgres si ça devient un problème.
- **Score compétitif calculé côté client** : la RPC borne (0 à rounds × 50) mais ne
  prouve pas le score — un joueur authentifié et motivé peut soumettre 500 via la
  console. Compromis assumé d'un site statique sans serveur de partie. Mitigations
  possibles le jour où le classement compte : envoyer le détail des manches
  (film + pari) et re-calculer le barème dans la RPC, ou passer par une Edge Function
  qui tire elle-même le deck (seed serveur).

## Purge post-audit
Les probes laissent des lignes `probe_audit` / `test_verif` dans `error_events` :
`delete from public.error_events where category in ('probe_audit','test_verif');`
(SQL Editor — la table n'est pas modifiable via la clé anon).
