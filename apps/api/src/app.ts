import Fastify, { type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fstatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config.js';
import { prisma } from './db.js';
import { loadUser } from './lib/auth.js';
import { HttpError } from './lib/http.js';
import authRoutes from './routes/auth.js';
import learnRoutes from './routes/learn.js';
import exerciseRoutes from './routes/exercises.js';
import placementRoutes from './routes/placement.js';
import progressRoutes from './routes/progress.js';
import profileRoutes from './routes/profile.js';
import assistantRoutes from './routes/assistant.js';
import adminRoutes from './routes/admin.js';

export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-eval'", 'blob:'], // Monaco utilise des web workers
        workerSrc: ["'self'", 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute' });

  // Protection CSRF : les requêtes de modification doivent porter un en-tête personnalisé
  // (impossible à envoyer depuis un autre site sans pré-vol CORS).
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers['x-codemori'] !== '1') {
      throw new HttpError(403, 'Requête refusée (en-tête de sécurité manquant)');
    }
  });

  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/api/')) await loadUser(req, reply);
  });

  app.setErrorHandler(async (err: FastifyError | HttpError, req, reply) => {
    const status = (err as HttpError).statusCode ?? 500;
    if (status >= 500) {
      req.log.error(err);
      await prisma.errorLog
        .create({ data: { level: 'error', message: err.message.slice(0, 1000), stack: err.stack?.slice(0, 5000), context: { url: req.url, method: req.method, user: req.user?.id ?? null } } })
        .catch(() => {});
    }
    if ((err as FastifyError).validation) return reply.code(400).send({ error: 'Données invalides', details: (err as FastifyError).validation });
    if (status === 429 && !(err instanceof HttpError)) return reply.code(429).send({ error: 'Trop de requêtes : ralentis un peu et réessaie dans un instant.' });
    return reply.code(status).send({ error: status >= 500 && config.production ? 'Erreur interne du serveur' : err.message, details: (err as HttpError).details });
  });

  app.get('/api/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, name: config.appName };
  });

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(learnRoutes);
      await api.register(exerciseRoutes);
      await api.register(placementRoutes);
      await api.register(progressRoutes);
      await api.register(profileRoutes);
      await api.register(assistantRoutes);
      await api.register(adminRoutes);
    },
    { prefix: '/api' },
  );

  // Service du frontend compilé (mode production, conteneur unique)
  const dist = config.webDist ? resolve(config.webDist) : '';
  if (dist && existsSync(dist)) {
    await app.register(fstatic, { root: dist, wildcard: false, maxAge: '1h' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Route inconnue' });
      return reply.type('text/html').sendFile('index.html', { maxAge: 0 });
    });
  }
  return app;
}
