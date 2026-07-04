---
name: deploy-verify
description: Déployer MovieGuesser et vérifier réellement la mise en production (CI, domaine, deep links). À utiliser après tout push sur main ou quand l'utilisateur demande de déployer/vérifier le site.
---

# Déployer et vérifier MovieGuesser

Le déploiement est automatique sur push `main`. Ce skill = la checklist de preuve.

## Étapes

1. Avant le push : `pnpm typecheck && pnpm test` (37+ tests attendus verts).
2. Push, puis suivre le run correspondant au commit :
   ```bash
   RUN=$(gh run list -R illanseghir0/movieguesser --branch main --limit 1 \
     --json databaseId,headSha --jq ".[] | select(.headSha==\"$(git rev-parse HEAD)\") | .databaseId")
   gh run watch $RUN -R illanseghir0/movieguesser --exit-status
   ```
3. Vérifier la prod (le cache CDN peut mettre ~30 s) :
   ```bash
   curl -s https://movieguesser.fr/ | grep -o "<title>[^<]*</title>"     # MovieGuesser
   curl -s https://movieguesser.fr/ | grep -o 'assets/index-[^"]*\.js'   # hash = build local ?
   curl -s https://movieguesser.fr/profil | grep -q MovieGuesser && echo "deep links OK"
   ```
4. Si la feature touche un texte/écran précis : grep le marqueur dans le bundle en ligne.

## Pannes connues

- `deploy: Deployment failed, try again later` → erreur transitoire GitHub Pages.
  Le workflow retente une fois tout seul ; sinon `gh run rerun <id> --failed -R illanseghir0/movieguesser`.
- Run introuvable pour le head SHA : attendre 5-10 s, GitHub met le run en file.
- Statut HTTP 404 sur un deep link en curl : normal si le `<title>` est MovieGuesser
  (mécanisme 404.html de Pages) ; anormal si c'est la page 404 GitHub.
