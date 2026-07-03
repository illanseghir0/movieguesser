# Guess the Rank

*A Letterboxd game* — jeu de duel hot-seat pour deux cinéphiles : un film s'affiche,
chacun devine en secret son rang dans un classement Letterboxd, le plus proche gagne.

**Jouer :** ouvrir `index.html` (ou le site déployé), coller l'URL de n'importe quelle
liste Letterboxd classée (ex. [Top 250 Films with the Most Fans](https://letterboxd.com/official/list/top-250-films-with-the-most-fans/)),
entrer les noms, lancer.

## Fonctionnalités

- Chargement d'une liste Letterboxd par URL, sans backend (proxys CORS publics avec fallback)
- Affiches portrait, année et réalisateur récupérés à la demande, film par film
- Cache localStorage par liste (7 jours) ; la dernière liste jouée est restaurée au retour
- Deux modes : nombre de manches (1 pt/manche) ou course aux points
  (le vainqueur d'une manche marque l'écart entre les deux estimations)
- Ordre de passage alterné, aléatoire ou fixe ; écran « Entracte » pour passer le téléphone
- Révélation animée en trois temps sur la ligne 1 → N, générique de fin avec stats et récap

## Structure

```
index.html          markup seul
css/base.css        tokens, layout, header, boutons, panneaux, home
css/game.css        scoreboard, scène, révélation, entracte, générique
js/utils.js         helpers DOM partagés
js/letterboxd.js    couche données : proxys CORS, parsing listes/films, cache
js/settings.js      réglages persistants + écran paramètres
js/game.js          boucle de jeu : manches, révélation, scores, fin
js/main.js          accueil, citations, boot, tilt 3D
scrape.py           scraper Python optionnel -> films.json (mode local hors-ligne)
films.json          Top 500 pré-scrapé (auto-chargé s'il est servi à côté de la page)
```

Vanilla HTML/CSS/JS, aucun framework ni build. Pas de modules ES volontairement :
le jeu fonctionne en ouvrant `index.html` directement (`file://`). Les scripts se
partagent la portée globale et se chargent dans l'ordre en fin de body.

## Développement

```bash
python3 -m http.server   # puis http://localhost:8000
```

Le serveur local n'est nécessaire que pour l'auto-chargement de `films.json` ;
le chargement par URL de liste fonctionne aussi en `file://`.

## Limites connues

Le contournement CORS repose sur des proxys publics (allorigins, codetabs, corsproxy) —
gratuits mais sans garantie. Pour fiabiliser en production : une Cloudflare Worker de
quelques lignes en proxy dédié, et remplacer la constante `PROXIES` dans `js/letterboxd.js`.
