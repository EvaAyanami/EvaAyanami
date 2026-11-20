# Administration

Le panneau d’administration (`/admin`) est accessible aux comptes de rôle **ADMIN** : le compte défini par `ADMIN_EMAIL`/`ADMIN_PASSWORD`, ou à défaut le premier compte inscrit. Un administrateur peut promouvoir d’autres comptes.

## Sections

| Section | Possibilités |
|---|---|
| **Vue d’ensemble** | Utilisateurs (total, actifs), exercices réussis, exécutions, état du runner (file, parallélisme), erreurs récentes |
| **Utilisateurs** | Recherche, rôle, désactivation du compte, nouveau mot de passe, déblocage, réinitialisation de la progression, suppression |
| **Cours** | Chapitres par langage et niveau : création, modification (théorie, résumé, examen), suppression ; exercices : énoncé, choix, solution, **tests cachés**, règles, indices ; bouton **Vérifier** qui compile la solution dans le bac à sable |
| **Projets** | Cahier des charges, objectifs, contraintes, étapes, solutions et tests par langage |
| **Récompenses** | Succès (titre, icône, condition, seuil, XP, caché) |
| **Paramètres** | Paramètres pédagogiques (ci-dessous), activation du classement et de l’IA |
| **Journaux** | Erreurs serveur (avec contexte), purge |
| **Contenu** | Export complet du contenu en JSON ; réimport du dossier `content/` (en préservant les personnalisations, ou en les écrasant) |

Toute modification faite dans l’administration marque l’élément comme personnalisé : il ne sera pas écrasé par le réimport automatique du dossier `content/`.

## Paramètres pédagogiques

| Paramètre | Défaut | Effet |
|---|---|---|
| `examPassScore` | 70 | Score minimal (%) pour valider un examen (si le chapitre n’en précise pas) |
| `xpRetryFactor` | 0,7 | Part de l’XP accordée quand l’exercice est réussi après plusieurs essais |
| `xpSolutionFactor` | 0,4 | Part de l’XP quand la solution a été consultée |
| `xpReview` | 5 | XP par révision réussie |
| `xpExamPassed`, `xpChapterCompleted`, `xpProjectCompleted` | 50, 100, 150 | Bonus d’étapes |
| `defaultDailyGoal` | 50 | Objectif quotidien d’XP par défaut |
| `placementQuestionsPerLanguage` | 8 | Longueur du test adaptatif par langage |
| `reviewSessionSize` | 12 | Nombre de cartes par session de révision |
| `solutionMinAttempts` | 2 | Tentatives avant de pouvoir afficher la solution |
| `leaderboardEnabled` | oui | Classement visible |
| `aiEnabled` | oui | Assistant IA (si un fournisseur est configuré) |
| `weeklyChallenges` | 5 modèles | Défis hebdomadaires : métrique (`xp`, `exercises`, `reviews`, `chapters`, `code`), titre, objectif, récompense |

## Conditions de succès

`xp_total`, `exercises_solved`, `code_success`, `chapters_completed`, `chapter_mastered`, `perfect_exam`, `projects_completed`, `reviews_done`, `streak`, `ide_runs`, `languages_started`, `placement_done`, `concept_solved` (avec `concept`) — chacune avec un `threshold` et éventuellement un `language`.

## Commandes utiles

```bash
docker compose run --rm app import            # réimporter content/
docker compose run --rm app import --force    # réimporter en écrasant les personnalisations
docker compose run --rm app validate          # valider la structure du contenu
docker compose exec db psql -U codemori       # console SQL
```
