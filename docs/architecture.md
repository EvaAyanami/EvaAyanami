# Architecture

## Vue d’ensemble

```
            navigateur
                │ HTTPS
          ┌─────▼─────┐
          │   Caddy   │  reverse proxy, certificats
          └─────┬─────┘
                │ HTTP (réseau « web »)
          ┌─────▼──────────────────────┐
          │ app : API Fastify + SPA     │  sessions, progression, correction,
          │ (sert apps/web/dist)        │  gamification, contenu, assistant
          └──┬───────────────────┬─────┘
   réseau    │ SQL               │ HTTP + jeton
   « interne »│                   │
        ┌────▼─────┐      ┌──────▼──────┐   socket Docker   ┌──────────────────┐
        │PostgreSQL│      │   runner    │ ───────────────▶ │ bac à sable      │
        └──────────┘      │ (file, quota)│  docker run …    │ (1 conteneur par │
                          └─────────────┘                   │  exécution)      │
                                                            └──────────────────┘
```

Le dépôt est un monorepo npm (workspaces) :

| Dossier | Rôle |
|---|---|
| `apps/web` | Interface React + TypeScript + Vite + Tailwind ; Monaco pour l’éditeur |
| `apps/api` | API REST Fastify, Prisma/PostgreSQL, logique pédagogique |
| `apps/runner` | Service d’exécution : file d’attente, construction de l’archive, `docker run` |
| `apps/runner/images` | Images des bacs à sable (Rust, C++, Java) et harnais commun |
| `content/` | Tout le contenu pédagogique (YAML), importé en base au démarrage |
| `deploy/`, `scripts/` | Déploiement et exploitation |
| `tools/content-gen` | Générateurs des fichiers de projets |

## Exécution d’un programme

1. L’apprenant clique sur **Valider** : l’interface envoie le code à `POST /api/exercises/:id/submit`.
2. L’API charge l’exercice et ses **tests cachés** (jamais envoyés au navigateur), vérifie les règles (`require`/`forbid`, sur le code débarrassé des commentaires et chaînes), puis appelle le runner avec le source et les entrées de chaque test.
3. Le runner met la tâche en file (parallélisme borné), construit une archive tar (`main.rs`/`main.cpp`/`Main.java` + `tests/N.in`) et la transmet **sur l’entrée standard** d’un `docker run --rm -i` : aucun fichier n’est partagé avec l’hôte.
4. Dans le conteneur, `harness.sh` décompresse l’archive dans `/tmp`, compile (délai maximal), puis exécute chaque test avec son entrée et un délai, et renvoie un protocole texte (`@@CM COMPILE …`, `@@CM TEST …`, sorties en base64, tronquées).
5. L’API compare les sorties (normalisation des fins de ligne et espaces de fin ; modes `exact`, `contains`, `regex` possibles), traduit les erreurs du compilateur en explications pédagogiques françaises, met à jour la progression, l’XP, les succès, les défis et la file de révision.

## Modèle de données (principal)

| Table | Contenu |
|---|---|
| `User`, `Session` | Comptes (Argon2id), sessions (jeton haché SHA-256, expiration glissante) |
| `Language`, `Chapter`, `Exercise`, `Project` | Contenu importé (`Exercise.kind` : practice, exam, miniproject, placement, project) |
| `Attempt`, `ExerciseProgress` | Tentatives, brouillons sauvegardés automatiquement |
| `ChapterProgress`, `ProjectProgress`, `SkillProfile` | Avancement et niveau par langage |
| `PlacementAnswer` | Réponses du test de positionnement |
| `ReviewItem` | Révision espacée (SM-2) |
| `Achievement`, `UserAchievement`, `WeeklyChallenge`, `UserChallenge`, `DailyActivity` | Gamification |
| `Setting`, `ErrorLog`, `ActivityLog`, `Snippet` | Paramètres, journal, activité, sauvegardes de l’IDE |

Le schéma est dans `apps/api/prisma/schema.prisma` ; les migrations dans `apps/api/prisma/migrations`.

## API REST (extraits)

Toutes les routes sont sous `/api`. Les requêtes de modification exigent l’en-tête `x-codemori: 1` (protection CSRF) et un cookie de session.

| Route | Rôle |
|---|---|
| `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/password`, `GET /auth/me` | Authentification |
| `GET /placement/questionnaire`, `POST /placement/questionnaire`, `/start`, `/answer`, `/finish`, `/skip` | Accueil et test adaptatif |
| `GET /languages`, `/languages/:id/map`, `/chapters/:slug` | Parcours et chapitres |
| `GET /exercises`, `/exercises/:id`, `POST /exercises/:id/submit`, `/run`, `/hint`, `PUT /exercises/:id/draft` | Exercices |
| `GET /chapters/:slug/exam`, `POST /chapters/:slug/exam` | Examens de validation |
| `GET /projects`, `/projects/:slug` | Projets |
| `GET /review/queue`, `/review/summary` | Révisions espacées |
| `POST /ide/run`, `GET/POST/DELETE /ide/snippets` | IDE libre et programmes sauvegardés |
| `GET /dashboard`, `/stats`, `/achievements`, `/leaderboard`, `/me/skills` | Tableau de bord, statistiques, récompenses |
| `POST /assistant/ask`, `/explain`, `/reformulate`, `/practice` | Assistant pédagogique |
| `/admin/*` | Administration (rôle ADMIN) |

## Choix techniques

- **Fastify** : rapide, schéma de plugins simple (helmet, rate-limit, cookie, static).
- **Prisma** : migrations versionnées et typage de bout en bout.
- **Bacs à sable Docker éphémères** : un conteneur par exécution, sans état, sans réseau ; isolation éprouvée, images versionnées, compatible avec gVisor.
- **Contenu en YAML** dans le dépôt : relisible, versionné, vérifiable automatiquement, modifiable aussi depuis l’administration.
