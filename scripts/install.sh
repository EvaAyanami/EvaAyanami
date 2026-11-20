#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Installation de Codemori sur un serveur Linux disposant de Docker.
#
#   ./scripts/install.sh                         (questions interactives)
#   DOMAIN=codemori.exemple.fr ADMIN_EMAIL=moi@exemple.fr ./scripts/install.sh -y
# ------------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

OUI=false
[[ "${1:-}" == "-y" ]] && OUI=true

info() { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
erreur() { printf '\033[1;31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

demander() { # demander VARIABLE "question" "défaut"
  local var=$1 question=$2 defaut=${3:-} valeur=${!1:-}
  if [[ -z "$valeur" && "$OUI" == false ]]; then
    read -r -p "$question [${defaut}] : " valeur || true
  fi
  printf -v "$var" '%s' "${valeur:-$defaut}"
}

secret() { openssl rand -hex "${1:-24}" 2>/dev/null || head -c "${1:-24}" /dev/urandom | od -An -tx1 | tr -d ' \n'; }

# ------------------------------------------------------------------ prérequis
command -v docker >/dev/null || erreur "Docker est requis : https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || erreur "Le plugin Docker Compose v2 est requis (docker compose)."
docker info >/dev/null 2>&1 || erreur "Impossible de joindre le démon Docker (es-tu dans le groupe docker ?)."
ok "Docker $(docker version --format '{{.Server.Version}}') et $(docker compose version --short) détectés"

# ------------------------------------------------------------------ configuration
if [[ -f .env ]]; then
  info "Fichier .env existant conservé."
else
  demander DOMAIN "Nom de domaine (localhost pour un test local)" "localhost"
  demander ADMIN_EMAIL "E-mail du compte administrateur" "admin@${DOMAIN}"
  ADMIN_PASSWORD=${ADMIN_PASSWORD:-$(secret 12)}
  cp .env.example .env
  sed -i \
    -e "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" \
    -e "s|^PUBLIC_URL=.*|PUBLIC_URL=https://${DOMAIN}|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(secret 24)|" \
    -e "s|^RUNNER_TOKEN=.*|RUNNER_TOKEN=$(secret 32)|" \
    -e "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=${ADMIN_EMAIL}|" \
    -e "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${ADMIN_PASSWORD}|" \
    .env
  CPUS=$(nproc 2>/dev/null || echo 4)
  sed -i "s|^RUNNER_MAX_PARALLEL=.*|RUNNER_MAX_PARALLEL=$(( CPUS > 1 ? CPUS - 1 : 1 ))|" .env
  chmod 600 .env
  ok "Configuration créée dans .env (secrets générés aléatoirement)"
fi

# ------------------------------------------------------------------ démarrage
info "Construction des images et démarrage (la première fois : 5 à 15 minutes)…"
docker compose up -d --build

info "Attente du démarrage de l'application…"
for _ in $(seq 1 90); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    break
  fi
  sleep 2
done

docker compose ps
DOMAIN=$(grep -E '^DOMAIN=' .env | cut -d= -f2)
ok "Codemori est prêt : https://${DOMAIN}"
if grep -qE '^ADMIN_EMAIL=.+' .env; then
  echo "   Administrateur : $(grep -E '^ADMIN_EMAIL=' .env | cut -d= -f2)"
  echo "   Mot de passe   : voir ADMIN_PASSWORD dans .env (à changer après la première connexion)"
fi
echo "   Sauvegardes    : ./scripts/backup.sh (à planifier avec cron)"
