---
name: security-audit
description: Auditer la sécurité de MovieGuesser (dépendances, secrets git, XSS, RLS/RPC Supabase par l'attaque, CI, en-têtes HTTP). À relancer après quelques mises en production, ou quand l'utilisateur demande un audit/diagnostic de sécurité.
---

# Audit de sécurité MovieGuesser

Rejoue les vérifications, compare à `docs/SECURITY.md`, mets ce fichier à jour (date + delta).
Principe : le front est public et la clé anon aussi — **on attaque avec la clé anon et on
vérifie que rien ne cède**. Ne jamais afficher la clé/`.env.local` en entier.

## 1. Dépendances

```bash
pnpm audit
```
Trier : une vuln en **devDependency** (vite, vitest, happy-dom, esbuild) n'atteint pas le
bundle de prod → risque réel faible. Une vuln dans une **dependency** de prod (vue, pinia,
vue-router, @supabase/supabase-js) est prioritaire. Tenter la montée mineure/patch
(`pnpm add -D <pkg>@<patched>`), lancer `pnpm typecheck && pnpm test`, revert si ça casse
(`cp /tmp/lock.bak pnpm-lock.yaml`). Ne pas forcer un breaking (ex. Vite 6) sans le décider.

## 2. Secrets dans l'historique git

```bash
git log --all --diff-filter=A --name-only --pretty=format: | sort -u | grep -iE "\.env|secret|credential"
git log --all -p | grep -cE "service_role|SUPABASE_SERVICE|sk-[A-Za-z0-9]{20}|re_[A-Za-z0-9]{20}"
```
Attendu : seul `.env.example` (vide). 0 clé privée. Si une clé a fuité → la **révoquer**
(Supabase/Resend), pas seulement la retirer du repo (l'historique la garde).

## 3. XSS / injections front

```bash
grep -rn "v-html\|innerHTML\|outerHTML\|insertAdjacentHTML\|document.write" src/
grep -rn ":href=\|:src=" src/components/
```
Attendu : aucun sink. Les `:src`/`:href` ne doivent porter que des URLs
`a.ltrbxd.com`/`letterboxd.com` issues de la DB. Tout lien externe : `rel="noopener"`.

## 4. Probes RLS / RPC (le cœur)

```bash
set -a; source .env.local; set +a
H=(-H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json")
# chaque probe doit ÉCHOUER :
curl -s -X PATCH "$VITE_SUPABASE_URL/rest/v1/profiles?id=neq.0" "${H[@]}" -H "Prefer: return=representation" -d '{"games_won":999}'   # → []
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$VITE_SUPABASE_URL/rest/v1/lists" "${H[@]}" -d '{"slug":"x","url":"x","title":"x","film_count":0,"films":[]}'  # → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/record_game" "${H[@]}" -d '{"p_won":true,"p_best_gap":1}'  # → 401
curl -s "$VITE_SUPABASE_URL/rest/v1/error_events?select=*&limit=5" "${H[@]}"  # → []
```
Pour **chaque nouvelle table**, ajouter ici une probe qui tente l'écriture/lecture interdite.

## 5. CI et en-têtes HTTP

```bash
grep -E "uses:|^permissions:" -A4 .github/workflows/deploy.yml   # permissions minimales
curl -sI https://movieguesser.fr/ | grep -iE "strict-transport|content-security|x-frame"
```
GitHub Pages ne pose pas d'en-têtes de sécurité (limite connue, cf SECURITY.md).

## 6. Nettoyage

Les probes créent des lignes `probe_audit` dans `error_events`. Signaler à l'utilisateur
la requête de purge (SQL Editor) — la table n'est pas modifiable via la clé anon.

## Livrable
Mettre à jour `docs/SECURITY.md` (date, ✅/⚠️, delta depuis le dernier audit). Signaler à
l'utilisateur uniquement ce qui a **changé** ou ce qui exige une action de sa part
(révocation de clé, migration SQL, montée de version).
