# syntax=docker/dockerfile:1
# ------------------------------------------------------------------------------
# Service d'exécution (« runner ») : reçoit le code à compiler, lance un
# conteneur bac à sable jetable par exécution (sans réseau, sans privilèges,
# limites mémoire/CPU/temps) et renvoie les résultats.
#
# Il pilote le démon Docker de l'hôte via son socket : c'est le seul service
# qui y a accès, il n'est joignable que depuis le réseau interne de Compose
# et il exige un jeton (RUNNER_TOKEN). Voir docs/securite.md.
# Contexte de construction : la racine du dépôt.
# ------------------------------------------------------------------------------

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/runner/package.json apps/runner/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/runner --include-workspace-root=false --no-audit --no-fund
COPY apps/runner apps/runner
RUN npm run build -w apps/runner \
 && npm prune --workspace apps/runner --omit=dev --no-audit --no-fund

FROM docker:27-cli AS docker-cli

FROM node:22-alpine
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
WORKDIR /app
ENV NODE_ENV=production RUNNER_PORT=4100 RUNNER_HOST=0.0.0.0 RUNNER_DRIVER=docker
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/runner/package.json ./apps/runner/package.json
COPY --from=build /app/apps/runner/dist ./apps/runner/dist
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.RUNNER_PORT||4100)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/runner/dist/server.js"]
