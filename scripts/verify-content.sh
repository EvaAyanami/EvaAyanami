#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Vérifie TOUT le contenu exécutable (exercices, examens, projets, placement) :
# chaque solution de référence est compilée et exécutée dans les vrais bacs à
# sable, et doit passer tous ses tests ; chaque code « bogué » doit échouer.
#
#   ./scripts/verify-content.sh                  (tout, ~15 min)
#   ./scripts/verify-content.sh --lang java
#   ./scripts/verify-content.sh --filter calc-
# ------------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose run --rm -e VERIFY_PARALLEL="${VERIFY_PARALLEL:-4}" app verify "$@"
