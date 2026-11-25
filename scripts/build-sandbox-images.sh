#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Construit (ou reconstruit) les images des bacs à sable sans tout redémarrer.
# `docker compose up -d --build` le fait aussi automatiquement.
#
#   ./scripts/build-sandbox-images.sh            (rust, cpp, java, python et php)
#   ./scripts/build-sandbox-images.sh rust
# ------------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/../apps/runner/images"

LANGAGES=("${@:-rust cpp java python php}")
for l in ${LANGAGES[*]}; do
  echo "▸ Image codemori/sandbox-$l"
  docker build -t "codemori/sandbox-$l:latest" -f "$l/Dockerfile" .
done
echo "✔ Images prêtes :"
docker images 'codemori/sandbox-*' --format '  {{.Repository}}:{{.Tag}}  {{.Size}}'
