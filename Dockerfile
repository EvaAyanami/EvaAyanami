# syntax=docker/dockerfile:1
# ------------------------------------------------------------------------------
# Image de l'application Codemori : API (Fastify + Prisma) qui sert aussi
# l'interface web compilée (React/Vite). Le service d'exécution du code
# (« runner ») a sa propre image : apps/runner/Dockerfile.
# ------------------------------------------------------------------------------

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Dépendances d'abord (mise en cache des couches Docker)
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/runner/package.json apps/runner/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

# Code source puis compilation
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build -w apps/api && npm run build -w apps/web

# On ne garde que les dépendances d'exécution
RUN npm prune --omit=dev --no-audit --no-fund \
 && npx --workspace apps/api prisma generate

# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    WEB_DIST=/app/apps/web/dist \
    CONTENT_DIR=/app/content

# Les dépendances de l'interface sont regroupées dans le bundle Vite : seules
# celles de l'API sont copiées.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
# apps/api contient dist/, prisma/ et un éventuel node_modules non hissé
COPY --from=build --chown=node:node /app/apps/api ./apps/api
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --chown=node:node content ./content
COPY --chmod=0755 deploy/docker-entrypoint.sh /usr/local/bin/codemori-entrypoint
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "codemori-entrypoint"]
