# Déployer Codemori sur TrueNAS SCALE

Ce guide vaut pour **TrueNAS SCALE 24.10 (Electric Eel) ou plus récent**, qui fait tourner les applications avec Docker.

> **TrueNAS CORE** (FreeBSD) n’a pas Docker : crée une VM Debian ou Ubuntu et suis [installation.md](installation.md).

TrueNAS ne compile pas les images : l’application utilise des **images prêtes à l’emploi**, publiées automatiquement sur le registre GitHub (`ghcr.io`) par la CI du dépôt.

## 1. Publier les images (une seule fois, sur GitHub)

1. Pousse le dépôt sur GitHub : le workflow **Images Docker** (`.github/workflows/images.yml`) se lance tout seul. Tu peux aussi le lancer à la main dans l’onglet *Actions → Images Docker → Run workflow*.
2. Attends la fin (≈ 15 à 25 minutes la première fois ; l’image Rust est la plus longue).
3. Les 5 images apparaissent dans *ton profil GitHub → Packages* : `codemori-app`, `codemori-runner`, `codemori-sandbox-rust`, `codemori-sandbox-cpp`, `codemori-sandbox-java`.
4. **Rends-les publiques** (le plus simple) : pour chaque package, *Package settings → Change visibility → Public*.
   Sinon, garde-les privées et ajoute un identifiant dans TrueNAS : *Apps → Configuration → Manage Container Images* (ou *Docker Registries*), registre `ghcr.io`, ton nom GitHub et un *Personal Access Token* avec la permission `read:packages`.

## 2. Préparer les secrets

Dans *System → Shell* de TrueNAS :

```bash
openssl rand -hex 24   # → mot de passe de la base
openssl rand -hex 32   # → jeton du runner
```

Utilise uniquement ces valeurs hexadécimales : le mot de passe de la base est inséré dans une URL de connexion.

## 3. Installer l’application

1. *Apps → Discover Apps → ⋮ (en haut à droite) → **Install via YAML***.
2. Nom : `codemori`.
3. Colle le contenu de [`deploy/truenas/codemori.yaml`](../deploy/truenas/codemori.yaml) et remplace :

| À remplacer | Par | Où |
|---|---|---|
| `MOT_DE_PASSE_DB` | le 1er secret | **2 endroits** : `POSTGRES_PASSWORD` et `DATABASE_URL` |
| `JETON_RUNNER` | le 2nd secret | **2 endroits** : service `runner` et service `app` |
| `192.168.1.10` | l’adresse IP de ton NAS | `PUBLIC_URL` |
| `admin@codemori.local`, `ChangeMoiTresVite2026` | ton e-mail et un mot de passe | `ADMIN_EMAIL`, `ADMIN_PASSWORD` |
| `evaayanami` | ton nom GitHub, en minuscules | si tu as forké le dépôt |

4. *Save*. Le premier démarrage télécharge environ 3 Go d’images (compte quelques minutes).
5. Ouvre **`http://IP-DU-NAS:30480`** et connecte-toi avec le compte administrateur. Change le mot de passe dans *Profil*.

Dans la liste des conteneurs, `sandbox-rust`, `sandbox-cpp` et `sandbox-java` apparaissent arrêtés (*Exited*) : c’est normal, ils servent seulement à télécharger les images des bacs à sable.

## 4. Réglages utiles

| Réglage | Où | Conseil |
|---|---|---|
| Port | `ports: "30480:4000"` | Garde un port au-dessus de 30000 : 80 et 443 sont pris par l’interface de TrueNAS |
| Compilations simultanées | `RUNNER_MAX_PARALLEL` | 2 pour 8 Go de RAM, 4 pour 16 Go ou plus |
| Inscriptions | `ALLOW_REGISTRATION` | `"false"` pour un usage familial ou fermé |
| Assistant IA | `AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL` | voir [assistant-ia.md](assistant-ia.md). Avec l’app *Ollama* de TrueNAS : `AI_PROVIDER: ollama`, `AI_BASE_URL: http://IP-DU-NAS:30068` (le port de ton app Ollama) |

Pour modifier un réglage : *Apps → codemori → Edit*, puis *Save*.

## 5. Accès en HTTPS (facultatif, recommandé hors du réseau local)

L’application fonctionne en HTTP sur le réseau local. Pour un accès sécurisé ou depuis Internet, place-la derrière un reverse proxy HTTPS. Par exemple :

- l’app **Nginx Proxy Manager** du catalogue TrueNAS : crée un *Proxy Host* vers `IP-DU-NAS:30480`, coche *Websockets Support* et demande un certificat Let’s Encrypt ;
- ou **Tailscale** (app du catalogue) pour un accès privé chiffré, sans ouvrir de port ;
- ou un tunnel **Cloudflare**.

Puis, dans le YAML : `COOKIE_SECURE: "true"` et `PUBLIC_URL: https://ton-domaine`.

## 6. Mises à jour

Les images portent l’étiquette `latest` et chaque service a `pull_policy: always`. Après une nouvelle publication sur GitHub : *Apps → codemori → Edit → Save*. Les images sont retéléchargées et les migrations de la base sont appliquées automatiquement. Ta progression et tes comptes sont conservés dans le volume `codemori-pgdata`.

Pour figer une version, remplace `:latest` par une étiquette précise, par exemple `:sha-1a2b3c4`, ou `:v1.0.0` si tu crées une étiquette Git `v1.0.0`.

## 7. Sauvegardes

**Instantanés ZFS** : active des *Periodic Snapshot Tasks* sur le dataset `ix-apps` de ton pool. Ils incluent les volumes Docker, donc la base de données.

**Export SQL** (recommandé en plus) : *System → Advanced → Cron Jobs → Add*, utilisateur `root`, tous les jours, commande :

```bash
docker exec ix-codemori-db-1 pg_dump -U codemori codemori | gzip > /mnt/TONPOOL/sauvegardes/codemori-$(date +\%Y\%m\%d).sql.gz
```

Remplace `TONPOOL/sauvegardes` par un dataset existant. Vérifie le nom exact du conteneur avec `docker ps | grep codemori`.

Restauration :

```bash
gunzip -c /mnt/TONPOOL/sauvegardes/codemori-20261120.sql.gz | docker exec -i ix-codemori-db-1 psql -U codemori codemori
```

## 8. Sécurité sur un NAS

Le service `runner` monte `/var/run/docker.sock` pour créer un conteneur isolé par exécution de code : cela lui donne des droits étendus sur le Docker du NAS. Il reste sur un réseau interne, n’expose aucun port et exige le jeton. Chaque bac à sable tourne sans réseau, sans privilèges, en lecture seule, avec des limites de mémoire, de CPU et de temps. Voir [securite.md](securite.md).

Si tu ouvres Codemori à des inconnus sur Internet, ferme les inscriptions libres (`ALLOW_REGISTRATION: "false"`) ou prévois une machine dédiée.

## 9. Dépannage

| Problème | Solution |
|---|---|
| *manifest unknown* / *denied* au téléchargement | Les images ne sont pas encore publiées, ou sont privées : étape 1 |
| La page s’affiche mais la connexion échoue | `COOKIE_SECURE` doit valoir `"false"` en HTTP |
| « Service d’exécution indisponible » | Journaux du conteneur `runner` (*Apps → codemori → Logs*) ; vérifier que les 3 `sandbox-*` ont bien terminé avec le code 0 |
| Première compilation très lente | Normal : le NAS charge l’image du compilateur. Les suivantes sont rapides |
| L’app ne démarre pas | Les deux occurrences de `MOT_DE_PASSE_DB` et de `JETON_RUNNER` doivent être identiques |
