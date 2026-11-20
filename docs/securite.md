# Sécurité

Codemori exécute du code arbitraire envoyé par des utilisateurs : la sécurité repose sur plusieurs couches indépendantes (défense en profondeur).

## 1. Bacs à sable d’exécution

Chaque exécution a lieu dans un **conteneur neuf, détruit ensuite** (`docker run --rm`), avec :

| Mesure | Option Docker |
|---|---|
| Aucun accès réseau | `--network none` |
| Aucune capacité Linux, pas d’élévation de privilèges | `--cap-drop ALL`, `--security-opt no-new-privileges` |
| Utilisateur non privilégié | `--user 10001:10001` |
| Système de fichiers en lecture seule | `--read-only` ; seul `/tmp` est inscriptible (tmpfs 256 Mo, `nosuid`) |
| Mémoire limitée, sans swap | `--memory` = `--memory-swap` (384 à 640 Mo selon le langage) |
| CPU limité | `--cpus 1` |
| Nombre de processus limité (fork bombs) | `--pids-limit 128` |
| Temps CPU, taille des fichiers, descripteurs | `--ulimit cpu=60 fsize=128MB nofile=256` |
| Délais de compilation et d’exécution | contrôlés par le harnais et par le runner (le conteneur est tué au-delà) |
| Taille des sorties | tronquée (64 Kio par défaut) |
| Pas de journal Docker | `--log-driver none` |
| Pas de montage de l’hôte | le code arrive par l’entrée standard (archive tar) |

Le runner limite aussi la **taille du code source**, le **nombre d’exécutions simultanées** et la **longueur de la file**. L’API limite le **nombre d’exécutions par utilisateur et par minute**.

### Isolation renforcée (recommandée en production publique)

Les conteneurs partagent le noyau de l’hôte. Pour une instance ouverte au public, installe **gVisor** sur l’hôte et active-le :

```bash
# après installation de runsc (https://gvisor.dev/docs/user_guide/install/)
echo 'RUNNER_DOCKER_RUNTIME=runsc' >> .env && docker compose up -d
```

Chaque bac à sable s’exécute alors avec un noyau applicatif isolé.

### Le runner et le socket Docker

Le service `runner` doit créer des conteneurs : il reçoit le socket Docker de l’hôte, ce qui équivaut à des droits administrateur sur l’hôte. C’est pourquoi :

- il n’expose **aucun port** sur l’hôte et n’est joignable que depuis le réseau Compose `interne` (déclaré `internal: true`) ;
- chaque requête doit porter le jeton `RUNNER_TOKEN` (comparaison en temps constant) ;
- il ne fait que lancer des conteneurs avec les options ci-dessus, à partir d’images fixées par la configuration.

Pour aller plus loin : Docker **rootless**, ou un démon Docker dédié aux bacs à sable sur une machine séparée (`DOCKER_HOST` du runner).

## 2. Comptes et sessions

- Mots de passe hachés avec **Argon2id** ; longueur minimale imposée.
- Sessions par cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production ; seul le **haché SHA-256** du jeton est stocké en base ; expiration glissante.
- Protection **CSRF** : toute requête modifiante doit porter l’en-tête `x-codemori` (impossible à poser depuis un formulaire tiers).
- **Limitation de débit** globale et renforcée sur l’authentification et les exécutions.
- Rôles `USER` / `ADMIN` vérifiés côté serveur sur chaque route d’administration.

## 3. Application web

- En-têtes de sécurité (helmet) : **Content-Security-Policy** stricte (aucun script en ligne, aucune ressource tierce), `X-Content-Type-Options`, `Referrer-Policy`, HSTS via le reverse proxy.
- Les **solutions et tests cachés** ne sont jamais envoyés au navigateur.
- Validation systématique des entrées (zod) ; requêtes SQL paramétrées (Prisma).
- Le contenu Markdown est rendu sans HTML brut.
- Aucune dépendance à un service externe : polices embarquées, éditeur servi localement.

## 4. Exploitation

- Secrets uniquement dans `.env` (droits `600`), jamais dans les images.
- Base de données et runner sur un réseau interne, non exposés.
- Sauvegardes chiffrables et à externaliser (`scripts/backup.sh`).
- Journal des erreurs serveur consultable dans l’administration.
- Mets à jour régulièrement (`scripts/update.sh`) pour bénéficier des correctifs des images de base.

## Signaler une vulnérabilité

Merci de signaler toute faille en privé aux mainteneurs de l’instance avant toute divulgation publique.
