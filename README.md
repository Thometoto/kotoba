# Kotoba - Japanese Learning

Application de flashcards japonais-français destinée principalement à l’iPhone et à l’iPad. Elle contient trois parcours séparés (kanji, vocabulaire et grammaire), les niveaux N5/N4 et une planification adaptative FSRS.

## Installer sur iPhone ou iPad

La version recommandée est la PWA disponible depuis GitHub Pages. Elle ne nécessite pas Python sur l’appareil :

1. Ouvrir l’adresse GitHub Pages de Kotoba dans **Safari**.
2. Toucher **Partager**.
3. Choisir **Sur l’écran d’accueil**, puis **Ajouter**.
4. Ouvrir Kotoba une première fois avec Internet afin de mettre les CSV en cache.

Kotoba fonctionne ensuite hors connexion. Les données, les états FSRS et l’historique restent dans le stockage local de l’appareil. La rubrique **Sauvegarde** permet d’exporter un fichier JSON et de le restaurer sur un autre appareil.

La progression n’est pas synchronisée automatiquement entre l’iPhone et l’iPad : il faut utiliser l’export/import pour la transférer.

## Développement

Les fichiers `index.html`, `app.js`, `pwa.css`, `manifest.webmanifest` et `service-worker.js` forment l’application installable. Pour reconstruire `app.js` après une modification de `src/pwa-app.js` :

```bash
pnpm install
pnpm run build
pnpm run test:pwa
```

Pour tester l’application localement, il suffit de servir le dossier avec un serveur HTTP statique, par exemple `python3 -m http.server 8000`, puis d’ouvrir <http://127.0.0.1:8000>. La progression et l’historique sont enregistrés dans IndexedDB sur l’appareil. Aucun temps de réponse n’est mesuré ni sauvegardé.

## Ajouter ou modifier les cartes

Toutes les fiches sont dans `data/kanji.csv`. Il peut être ouvert dans un tableur ou un éditeur de texte. Les colonnes sont :

```csv
character,meaning,readings,examples,ready
食,"manger, nourriture",しょく・た,"食事（しょくじ）— repas ; 食べる（たべる）— manger",true
```

Les modifications du CSV sont prises en compte au prochain chargement de page. Une fiche avec `ready` défini à `false` reste visible dans le catalogue mais n’apparaît pas en révision.

Le vocabulaire se trouve dans `data/vocabulary.csv` et la grammaire dans `data/grammar.csv`. Chaque ligne possède un identifiant unique, un niveau (`N5` ou `N4`) et une colonne `ready`.

## Tests

```bash
pnpm run test:pwa
```

## Portée actuelle

- Parcours Kanji, Vocabulaire et Grammaire fonctionnels.
- N5 : 1 204 cartes de vocabulaire et 96 cartes de grammaire.
- N4 : 1 488 cartes de vocabulaire et 84 cartes de grammaire.
- Toutes les entrées de la liste initiale figurent dans le catalogue.
- Seules les fiches comportant un sens, des lectures et un exemple participent aux sessions.
- Taille des sessions : 20 kanji, 20 cartes de vocabulaire et 5 cartes de grammaire.

Le planificateur utilise `ts-fsrs`. Une carte oubliée repasse par une étape courte ; les autres intervalles sont calculés selon son état de mémoire plutôt qu’avec des multiplicateurs fixes.
