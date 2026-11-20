#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Sauvegarde de la base PostgreSQL de Codemori (dump compressé et horodaté).
#
#   ./scripts/backup.sh                  → backups/codemori-AAAAMMJJ-HHMMSS.sql.gz
#   GARDER=30 ./scripts/backup.sh        (nombre de sauvegardes conservées, 14 par défaut)
#
# Exemple de planification quotidienne (crontab -e) :
#   15 3 * * * cd /opt/codemori && ./scripts/backup.sh >> backups/backup.log 2>&1
# ------------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

DOSSIER=${DOSSIER_SAUVEGARDE:-backups}
GARDER=${GARDER:-14}
mkdir -p "$DOSSIER"
chmod 700 "$DOSSIER"

set -a
# shellcheck disable=SC1091
source .env
set +a

FICHIER="$DOSSIER/codemori-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-codemori}" -d "${POSTGRES_DB:-codemori}" --clean --if-exists --no-owner \
  | gzip -9 > "$FICHIER.partiel"
mv "$FICHIER.partiel" "$FICHIER"
chmod 600 "$FICHIER"
echo "✔ Sauvegarde : $FICHIER ($(du -h "$FICHIER" | cut -f1))"

# Rotation : on ne garde que les $GARDER plus récentes
ls -1t "$DOSSIER"/codemori-*.sql.gz 2>/dev/null | tail -n +"$((GARDER + 1))" | xargs -r rm -f
