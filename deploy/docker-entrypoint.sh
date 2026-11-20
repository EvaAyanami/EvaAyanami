#!/bin/sh
# Point d'entrée du conteneur « app » : applique les migrations de base de données
# puis démarre l'API (qui importe le contenu pédagogique au démarrage).
set -e
cd /app/apps/api

if [ "${MIGRATE_ON_START:-true}" = "true" ]; then
  echo "[codemori] Application des migrations de base de données…"
  attempts=0
  until node ../../node_modules/prisma/build/index.js migrate deploy; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 10 ]; then
      echo "[codemori] La base de données est injoignable, abandon." >&2
      exit 1
    fi
    echo "[codemori] Base de données pas encore prête, nouvel essai dans 3 s…"
    sleep 3
  done
fi

# Commandes utilitaires : `docker compose run --rm app import` / `verify`
case "${1:-}" in
  import) shift; exec node dist/scripts/import-content.js "$@" ;;
  verify) shift; exec node dist/scripts/verify-content.js "$@" ;;
  validate) shift; exec node dist/scripts/validate-content.js "$@" ;;
esac

echo "[codemori] Démarrage de l'API sur le port ${PORT:-4000}"
exec node dist/server.js
