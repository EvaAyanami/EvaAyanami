#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Restauration d'une sauvegarde produite par scripts/backup.sh.
#
#   ./scripts/restore.sh backups/codemori-20261120-031500.sql.gz
# ------------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

FICHIER=${1:-}
[[ -f "$FICHIER" ]] || { echo "Usage : $0 <fichier.sql.gz>" >&2; exit 1; }

set -a
# shellcheck disable=SC1091
source .env
set +a

read -r -p "⚠ La base actuelle sera remplacée par « $FICHIER ». Continuer ? (oui/non) " r
[[ "$r" == "oui" ]] || { echo "Annulé."; exit 0; }

echo "▸ Arrêt de l'application…"
docker compose stop app
echo "▸ Restauration…"
gunzip -c "$FICHIER" | docker compose exec -T db psql -q -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-codemori}" -d "${POSTGRES_DB:-codemori}"
echo "▸ Redémarrage…"
docker compose start app
echo "✔ Restauration terminée."
