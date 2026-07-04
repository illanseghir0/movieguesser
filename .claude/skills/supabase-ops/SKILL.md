---
name: supabase-ops
description: Vérifier ou faire évoluer le backend Supabase de MovieGuesser (tables, RLS, RPC, auth OTP, télémétrie). À utiliser pour diagnostiquer la DB, préparer une migration SQL, ou vérifier après une action dashboard de l'utilisateur.
---

# Opérations Supabase

Projet réel : URL + clé anon dans `.env.local` (jamais l'afficher en entier ni le committer).
La clé anon est **publique par design** — la sécurité vient des policies RLS.

## Ce que l'agent peut faire seul (REST avec la clé anon)

```bash
set -a; source .env.local; set +a
H=(-H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY")
curl -s "${H[@]}" "$VITE_SUPABASE_URL/rest/v1/lists?select=slug,film_count"      # catalogue
curl -s "${H[@]}" "$VITE_SUPABASE_URL/rest/v1/profiles?select=count"             # nb profils
curl -s -o /dev/null -w "%{http_code}" "${H[@]}" "$VITE_SUPABASE_URL/auth/v1/health"
```

Vérifier qu'une protection tient = tenter l'attaque et attendre l'échec
(ex. PATCH sur profiles doit renvoyer `[]`, RPC record_game anonyme doit renvoyer 401).

## Ce qui exige l'utilisateur (dashboard) — préparer, demander, vérifier

- Exécuter du SQL (SQL Editor) : écrire la migration dans `supabase/*.sql`
  (idempotente : `if not exists`, `drop policy if exists`, `on conflict`).
- Templates email, SMTP, rate limits, providers auth.
- Lire `error_events` (la télémétrie est insert-only pour la clé anon).

## État du schéma (résumé)

- `profiles` : select public ; insert = son propre id avec stats vierges ;
  **pas d'update direct** — stats via RPC `record_game(p_won, p_best_gap)`
  (security definer, +1 partie, +0/1 victoire, best_gap ne peut que baisser).
- `lists` : select public, écriture réservée au SQL Editor (catalogue curaté).
- `error_events` : insert public (category ≤ 40 c.), select bloqué.
- Auth : OTP email uniquement (`signInWithOtp` + `verifyOtp`, type "email").
  ⚠️ Le code à 6 chiffres n'arrive que si le template « Magic link or OTP »
  contient `{{ .Token }}`, ce qui exige un SMTP custom configuré.

## Réflexes

- Toute nouvelle table : RLS activée d'office + policies minimales, et se demander
  « que peut faire un anonyme motivé avec la clé publique ? ».
- Après chaque action dashboard de l'utilisateur : vérification REST immédiate.
