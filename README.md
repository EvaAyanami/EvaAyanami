# Codemori

**Apprendre Rust, C++ et Java, de zéro à expert — en français, avec Kiri.**

Codemori est une plateforme web d’apprentissage de la programmation, complète et **auto-hébergeable**. Les apprenants suivent des parcours progressifs, écrivent du vrai code dans un éditeur intégré, et ce code est **réellement compilé et exécuté** côté serveur, dans des bacs à sable Docker isolés. Kiri, la mascotte, les accompagne : elle réagit, encourage, explique les erreurs de compilation.

## En chiffres

| | Rust | C++ | Java | Total |
|---|---|---|---|---|
| Chapitres (5 niveaux) | 54 | 54 | 55 | **163** |
| Exercices, mini-projets et examens | | | | **≈ 1 400** |
| Projets guidés multi-langages | | | | **22** (44 étapes, solutions dans les 3 langages) |
| Questions du test de positionnement | 20 | 20 | 20 | **60** |

Chaque solution de référence, chaque test caché et chaque sortie attendue est **vérifié automatiquement** par compilation et exécution réelles (`scripts/verify-content.sh`).

## Fonctionnalités

- **Accueil personnalisé** : questionnaire de départ (12 questions) puis **test adaptatif** par langage, qui produit un profil de compétences distinct pour Rust, C++ et Java. On peut aussi partir de zéro, choisir son niveau, refaire l’évaluation.
- **Parcours** en 5 niveaux (débutant absolu → expertise et projets). Chaque chapitre : théorie, exemples, exercices interactifs, mini-projet et **examen de validation** (on ne valide pas un chapitre d’un clic).
- **6 types d’exercices** : QCM, code à trous, remise en ordre, prédiction de sortie, chasse au bug, écriture de programme avec tests cachés et règles (`require`/`forbid`).
- **IDE intégré** (Monaco) : coloration, autocomplétion, extraits, fermeture des parenthèses, Compiler/Exécuter/Réinitialiser, sauvegarde automatique, mode plein écran, console d’entrée/sortie.
- **Explications pédagogiques des erreurs** de rustc, g++ et javac, en français.
- **Révisions espacées** (algorithme SM-2) des notions ratées.
- **Gamification bienveillante** : XP, niveaux, séries, objectif quotidien, 26 succès, défis hebdomadaires, statistiques, classement optionnel. Les erreurs ne font jamais perdre d’XP.
- **Projets** : 22 projets progressifs (calculatrice, serveur HTTP, client/serveur TCP réel, moteur SQL, système de fichiers virtuel, ordonnanceur, serveur compatible Redis, moteur de stockage avec reprise après crash, outil diff…), réalisables dans le langage de son choix, étape par étape, avec tests automatiques.
- **Assistant pédagogique** : indices en 3 niveaux, explication d’erreurs, reformulation, comparaison entre langages, génération d’exercices de révision. Fonctionne **sans IA** ; peut utiliser une API compatible OpenAI ou un modèle local **Ollama**.
- **Administration** : utilisateurs, chapitres, exercices (avec vérification en un clic dans le bac à sable), projets, récompenses, paramètres pédagogiques, journal des erreurs, import/export du contenu.
- Thème clair/sombre, interface responsive, aucune ressource externe (polices embarquées).

## Démarrage rapide (production)

Prérequis : un serveur Linux avec **Docker** et **Docker Compose v2**, 2 Go de RAM minimum (4 Go conseillés), ~10 Go de disque.

```bash
git clone <ce-dépôt> codemori && cd codemori
./scripts/install.sh          # génère .env (secrets aléatoires), construit et démarre
```

ou manuellement :

```bash
cp .env.example .env          # renseigner au minimum POSTGRES_PASSWORD et RUNNER_TOKEN
docker compose up -d --build
```

Puis ouvrir `https://<DOMAIN>`. Avec un vrai nom de domaine pointant vers le serveur, Caddy obtient automatiquement un certificat Let’s Encrypt. Le premier démarrage construit les images des bacs à sable (Rust, C++, Java) : comptez 5 à 15 minutes.

Guide complet : [docs/installation.md](docs/installation.md).

## Documentation

| Document | Contenu |
|---|---|
| [docs/installation.md](docs/installation.md) | Installation, configuration, HTTPS, mises à jour, sauvegardes, dépannage |
| [docs/architecture.md](docs/architecture.md) | Composants, flux d’une exécution, modèle de données, API |
| [docs/securite.md](docs/securite.md) | Isolation des bacs à sable, authentification, durcissement |
| [docs/contenu.md](docs/contenu.md) | Format des cours, exercices, projets et tests ; vérification |
| [docs/administration.md](docs/administration.md) | Panneau d’administration et paramètres pédagogiques |
| [docs/assistant-ia.md](docs/assistant-ia.md) | Assistant sans IA, API compatible OpenAI, Ollama |
| [docs/developpement.md](docs/developpement.md) | Lancer le projet en local, tests, structure du code |

## Pile technique

React 18 · TypeScript · Vite · Tailwind CSS · Monaco Editor · Framer Motion — Node.js 22 · Fastify 5 · Prisma 6 · PostgreSQL 16 · Argon2 — Docker (bacs à sable rustc/Cargo, GCC 14, OpenJDK 21) · Caddy.

## Licence

Code sous licence MIT (voir [LICENSE](LICENSE)). Le contenu pédagogique (`content/`) est sous licence CC BY-SA 4.0.
