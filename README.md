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

Le planificateur utilise `ts-fsrs`. Une carte notée « Oublié » revient une heure après la réponse, y compris lors de plusieurs oublis consécutifs et pour une carte déjà apprise. Ce délai s’applique aux prochaines réponses ; les échéances déjà enregistrées ne sont pas modifiées rétroactivement. Les autres intervalles sont calculés selon son état de mémoire plutôt qu’avec des multiplicateurs fixes.

## Exercices

Le quatrième bouton charge directement **data/exercises.csv** : 72 exercices N5/N4 répartis dans neuf formats. Les 36 exercices d’introduction sont conservés avec leurs identifiants, et 36 questions plus exigeantes s’appuient sur les exemples de grammar.csv. Le mode **Approfondissement** donne directement accès à ces dernières. Les sessions proposent au maximum 10 questions et le mode **Reprendre mes erreurs** reprend les réponses à retravailler.

Les données ne sont plus intégrées au JavaScript. Une modification du CSV suffit : aucun rebuild n’est nécessaire pour modifier ou ajouter une question. Le CSV est mis en cache pour fonctionner hors connexion après un premier chargement en ligne. Il faut republier les fichiers modifiés pour mettre à jour l’application sur GitHub Pages, puis l’ouvrir en ligne pour recevoir les nouvelles données.

### Colonnes de exercises.csv

| Colonne | Contenu |
| --- | --- |
| id | Identifiant unique et stable. Ne pas réutiliser un ancien identifiant pour une question différente. |
| type | particle, vocabulary, conjugation, order, grammar, dialogue, reading, correction ou transform. |
| grammar_id | Identifiant existant dans grammar.csv, par exemple g114. Le niveau et la leçon proviennent de cette fiche. |
| difficulty | base ou practice (mode Approfondissement). |
| instruction | Consigne en français, assez précise pour rendre la réponse unique. |
| prompt | Phrase, dialogue ou texte présenté avant la réponse. Les retours à la ligne sont autorisés dans un champ entre guillemets. |
| answer | Bonne réponse, ou phrase complète pour order. |
| options | Mauvaises réponses séparées par le caractère \|. Pour order : tous les morceaux à assembler (douze maximum), séparés par \|, et non des mauvaises réponses. |
| translation | Traduction affichée après validation. |
| explanation | Explication de la correction et des confusions utiles. |
| ready | true pour activer ; false pour garder une question en brouillon. |

Enregistrer en UTF-8 avec une virgule comme séparateur. Les champs contenant des virgules ou des retours à la ligne doivent être entourés de guillemets doubles ; doubler un guillemet à l’intérieur d’un champ. Les mots japonais restent en kana, en conservant les katakana. Vérifier que les distracteurs ne sont pas des réponses également valables. Pour une phrase à assembler, préciser l’ordre attendu si plusieurs ordres sont naturels.

Une ligne active invalide affiche une erreur dans Exercices, sans bloquer les flashcards. Une fiche de grammaire inactive désactive aussi les exercices liés. Les résultats restent locaux, séparés de FSRS, et sont inclus dans les sauvegardes. Les historiques des identifiants anciens ou temporairement désactivés sont conservés, mais exclus des statistiques des exercices actifs.

Après une modification du code, reconstruire app.js. Après une modification des exercices, lancer pnpm run test:pwa pour vérifier le CSV et ses références.

Le bouton « Difficile » impose un délai minimum de deux heures, dans l’aperçu comme dans la sauvegarde. Si FSRS calcule un intervalle plus long, celui-ci est conservé. Cette règle s’applique aux prochaines réponses, sans modifier les échéances déjà enregistrées.
