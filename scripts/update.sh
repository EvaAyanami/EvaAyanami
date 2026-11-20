#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Mise à jour de Codemori : sauvegarde, récupération du code, reconstruction.
# Les migrations de base de données sont appliquées automatiquement au démarrage.
#
#   ./scripts/update.sh            (branche courante)
#   SANS_SAUVEGARDE=1 ./scripts/update.sh
# ------------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${SANS_SAUVEGARDE:-}" ]]; then
  echo "▸ Sauvegarde préalable de la base de données…"
  ./scripts/backup.sh
fi

if [[ -d .git ]]; then
  echo "▸ Récupération de la dernière version…"
  git pull --ff-only
fi

echo "▸ Reconstruction et redémarrage…"
docker compose up -d --build --remove-orphans

echo "▸ Nettoyage des anciennes images…"
docker image prune -f >/dev/null

docker compose ps
echo "✔ Mise à jour terminée."
