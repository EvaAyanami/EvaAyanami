# Développement

## Prérequis

Node.js 22 (`.nvmrc`), PostgreSQL 16, Docker (pour les vrais bacs à sable).

## Lancer en local

```bash
npm install

# Base de données
createdb codemori        # ou : docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=codemori -e POSTGRES_USER=codemori postgres:16-alpine
echo 'DATABASE_URL=postgresql://codemori:codemori@localhost:5432/codemori' > apps/api/.env
npm run db:migrate -w apps/api        # applique les migrations

# Images des bacs à sable
./scripts/build-sandbox-images.sh

# Trois terminaux
npm run dev:runner     # http://localhost:4100
npm run dev:api        # http://localhost:4000 (importe content/ au démarrage)
npm run dev:web        # http://localhost:5173 (proxy /api → 4000)
```

Sans Docker, le runner peut exécuter le code **directement sur la machine** (développement uniquement, aucune isolation, compilateurs locaux requis) :

```bash
RUNNER_DRIVER=local RUNNER_PORT=4101 npm run dev:runner
```

## Tests et vérifications

```bash
npm test                                   # tests unitaires (API et runner)
npm run build                              # compilation TypeScript + bundle web
npm run content:validate                   # structure du contenu
RUNNER_URL=http://localhost:4100 npm run content:verify             # tout le contenu exécutable
RUNNER_URL=http://localhost:4100 npm run content:verify -- --lang cpp --filter cpp-ptr
```

## Structure du code

```
apps/api/src
├── app.ts              construction de l'application Fastify (sécurité, routes, SPA)
├── server.ts           démarrage, import du contenu, compte admin
├── lib/
│   ├── auth.ts         sessions, Argon2, rôles
│   ├── content.ts      schémas zod du contenu YAML, import en base
│   ├── grading.ts      correction des 6 types d'exercices, vue publique
│   ├── runner.ts       client du service d'exécution
│   ├── diagnostics.ts  analyse et explication des erreurs de compilation
│   ├── gamification.ts XP, succès, défis, séries
│   ├── srs.ts          révision espacée SM-2
│   ├── progress.ts     progression des chapitres et projets
│   └── ai.ts           fournisseurs IA (OpenAI-compatible, Ollama)
├── routes/             une route par domaine (auth, learn, exercises, placement…)
└── scripts/            import, validation et vérification du contenu
apps/web/src
├── components/         Mascot (Kiri), Exercise, CodeEditor, Assistant, Layout…
├── pages/              une page par écran + admin/
└── lib/                api, thème, Monaco, retours visuels
apps/runner/src
├── languages.ts        registre des langages (image, commandes, limites)
├── sandbox.ts          archive tar, arguments docker, protocole du harnais
└── server.ts           API HTTP, file d'attente, jeton
```

## Ajouter un langage

1. Une image `apps/runner/images/<langage>/Dockerfile` reprenant le harnais commun.
2. Une entrée dans `apps/runner/src/languages.ts` (fichier source, commandes, limites).
3. Le langage dans `content/languages.yaml` et l’énumération `LANGS` de l’API, ses explications d’erreurs dans `diagnostics.ts`, ses extraits dans `apps/web/src/lib/monaco.ts`.
4. Son contenu dans `content/<langage>/`.
