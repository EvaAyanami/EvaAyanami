# Installation et exploitation

## 1. Prérequis

- Linux x86_64 (Debian, Ubuntu, Fedora…) avec **Docker Engine 24+** et le plugin **Docker Compose v2** (`docker compose version`).
- 2 Go de RAM minimum, 4 Go conseillés (chaque compilation simultanée consomme jusqu’à 512 à 640 Mo).
- ~10 Go de disque (les images des compilateurs sont volumineuses).
- Pour HTTPS public : un nom de domaine pointant vers le serveur, ports **80** et **443** ouverts.

## 2. Installation automatique

```bash
git clone <ce-dépôt> /opt/codemori && cd /opt/codemori
./scripts/install.sh
```

Le script vérifie Docker, crée `.env` à partir de `.env.example` en générant des secrets aléatoires (mot de passe PostgreSQL, jeton du runner, mot de passe administrateur), adapte le parallélisme au nombre de cœurs, puis lance `docker compose up -d --build` et attend que l’application réponde.

Version non interactive :

```bash
DOMAIN=codemori.mondomaine.fr ADMIN_EMAIL=moi@mondomaine.fr ./scripts/install.sh -y
```

## 3. Installation manuelle

```bash
cp .env.example .env
# éditer .env : POSTGRES_PASSWORD, RUNNER_TOKEN (obligatoires), DOMAIN, PUBLIC_URL, ADMIN_*
docker compose up -d --build
docker compose ps
```

Les services `sandbox-rust`, `sandbox-cpp` et `sandbox-java` construisent les images des bacs à sable puis s’arrêtent (état `Exited (0)`) : c’est normal.

> Utilise des secrets hexadécimaux (`openssl rand -hex 24`) : le mot de passe PostgreSQL est inséré dans une URL de connexion.

## 4. Variables de configuration

Toutes sont documentées dans [`.env.example`](../.env.example). Les principales :

| Variable | Rôle |
|---|---|
| `DOMAIN`, `PUBLIC_URL` | Nom de domaine servi par Caddy, URL publique |
| `POSTGRES_PASSWORD` | Mot de passe de la base (obligatoire) |
| `RUNNER_TOKEN` | Jeton partagé app ↔ runner (obligatoire) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Compte administrateur créé/promu au démarrage. À défaut, le premier inscrit devient administrateur |
| `ALLOW_REGISTRATION` | `false` pour fermer les inscriptions |
| `RUNNER_MAX_PARALLEL` | Compilations simultanées (≈ nombre de cœurs − 1) |
| `RUNNER_MEMORY_*`, `RUNNER_CPUS` | Limites de chaque bac à sable |
| `RUNNER_DOCKER_RUNTIME` | Runtime renforcé optionnel (`runsc` pour gVisor) |
| `RUN_LIMIT_PER_MINUTE` | Exécutions par utilisateur et par minute |
| `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Assistant IA (facultatif, voir [assistant-ia.md](assistant-ia.md)) |

Après modification de `.env` : `docker compose up -d`.

## 5. HTTPS et reverse proxy

**Caddy** (inclus) gère automatiquement les certificats :

- `DOMAIN=codemori.mondomaine.fr` → certificat Let’s Encrypt, renouvelé automatiquement ;
- `DOMAIN=localhost` → certificat local auto-signé (le navigateur affiche un avertissement), pour tester.

La configuration est dans [`deploy/Caddyfile`](../deploy/Caddyfile) (en-têtes de sécurité, compression, cache des fichiers statiques).

Tu préfères **Nginx** ? Un exemple complet est fourni dans [`deploy/nginx.conf.example`](../deploy/nginx.conf.example). Désactive alors Caddy et publie le port de l’application dans un `docker-compose.override.yml` :

```yaml
services:
  caddy:
    profiles: ["desactive"]
  app:
    ports: ["127.0.0.1:4000:4000"]
```

## 6. Mises à jour

```bash
./scripts/update.sh
```

Le script sauvegarde la base, fait `git pull`, reconstruit les images et redémarre. Les **migrations de base de données** sont appliquées automatiquement au démarrage du conteneur `app`, et le contenu pédagogique est réimporté (les éléments modifiés dans l’administration sont préservés).

## 7. Sauvegardes

```bash
./scripts/backup.sh                       # backups/codemori-AAAAMMJJ-HHMMSS.sql.gz
GARDER=30 ./scripts/backup.sh             # rotation : garder 30 sauvegardes
./scripts/restore.sh backups/codemori-20261120-031500.sql.gz
```

Planification quotidienne (`crontab -e`) :

```
15 3 * * * cd /opt/codemori && ./scripts/backup.sh >> backups/backup.log 2>&1
```

Pense à copier `backups/` **et** `.env` hors du serveur.

## 8. Vérifier l’installation

```bash
docker compose ps                         # tous les services « running » / « healthy »
docker compose logs -f app                # journal de l’application
./scripts/verify-content.sh --lang rust   # compile toutes les solutions Rust dans les bacs à sable
```

## 9. Dépannage

| Symptôme | Piste |
|---|---|
| « Le service d’exécution est indisponible » | `docker compose logs runner` ; vérifier que `/var/run/docker.sock` existe et que les images `codemori/sandbox-*` sont construites (`docker images 'codemori/*'`) |
| Compilations très lentes | Augmenter la RAM, réduire `RUNNER_MAX_PARALLEL`, vérifier `docker stats` |
| Certificat non obtenu | DNS du domaine, ports 80/443 ouverts, `docker compose logs caddy` |
| Connexion impossible en HTTP local | Mettre `COOKIE_SECURE=false` (les cookies sécurisés exigent HTTPS) |
| Reconstruire une image de bac à sable | `./scripts/build-sandbox-images.sh rust` |
| Réimporter le contenu en écrasant les modifications | `docker compose run --rm app import --force` |
