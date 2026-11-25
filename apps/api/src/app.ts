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
import { verificationRequired } from './lib/mail.js';
import { HttpError } from './lib/http.js';
import authRoutes from './routes/auth.js';
import learnRoutes from './routes/learn.js';
import exerciseRoutes from './routes/exercises.js';
import placementRoutes from './routes/placement.js';
import progressRoutes from './routes/progress.js';
import profileRoutes from './routes/profile.js';
import assistantRoutes from './routes/assistant.js';
import adminRoutes from './routes/admin.js';
import billingRoutes from './routes/billing.js';
import friendRoutes from './routes/friends.js';
import communityRoutes from './routes/community.js';
import feedbackRoutes from './routes/feedback.js';
import quizRoutes from './routes/quiz.js';
import oauthRoutes from './routes/oauth.js';
import adminBillingRoutes from './routes/admin-billing.js';

// Domaines nécessaires à Google AdSense (uniquement si ADS_PROVIDER=adsense).
const ADSENSE = config.ads.provider === 'adsense' && config.ads.adsenseClient;
const AD_SCRIPT = ADSENSE ? ['https://pagead2.googlesyndication.com', 'https://*.googlesyndication.com', 'https://*.adtrafficquality.google', 'https://www.googletagservices.com', 'https://*.google.com'] : [];
const AD_FRAME = ADSENSE ? ['https://googleads.g.doubleclick.net', 'https://tpc.googlesyndication.com', 'https://*.googlesyndication.com', 'https://www.google.com', 'https://*.adtrafficquality.google'] : [];
const AD_CONNECT = ADSENSE ? ['https://pagead2.googlesyndication.com', 'https://*.google.com', 'https://*.adtrafficquality.google', 'https://*.doubleclick.net'] : [];

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
        scriptSrc: ["'self'", "'unsafe-eval'", 'blob:', ...AD_SCRIPT], // Monaco utilise des web workers
        workerSrc: ["'self'", 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'], // polices embarquées (aucune requête vers un service tiers)
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'], // https: images des annonces
        connectSrc: ["'self'", ...AD_CONNECT],
        frameSrc: ["'self'", ...AD_FRAME],
        // En accès HTTP (réseau local, NAS…), forcer HTTPS casserait le chargement des ressources.
        upgradeInsecureRequests: config.cookieSecure ? [] : null,
      },
    },
    hsts: config.cookieSecure,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: config.cookieSecure,
    originAgentCluster: config.cookieSecure,
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute' });

  // Protection CSRF : les requêtes de modification doivent porter un en-tête personnalisé
  // (impossible à envoyer depuis un autre site sans pré-vol CORS).
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    if (req.url.startsWith('/api/billing/webhook')) return; // appel de Stripe, authentifié par signature
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers['x-codemori'] !== '1') {
      throw new HttpError(403, 'Requête refusée (en-tête de sécurité manquant)');
    }
  });

  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/api/')) {
      await loadUser(req, reply);
      // Adresse e-mail non vérifiée : seules l'authentification et la langue restent accessibles.
      if (req.user && !req.user.emailVerified && !/^\/api\/(auth\/|me$|me\?|health)/.test(req.url) && verificationRequired())
        throw new HttpError(403, 'Confirme d’abord ton adresse e-mail : clique sur le lien reçu par e-mail.', { code: 'EMAIL_UNVERIFIED' });
    }
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

  // ads.txt : exigé par Google AdSense pour être rémunéré.
  app.get('/ads.txt', async (_req, reply) => {
    const pub = config.ads.adsenseClient.replace(/^ca-/, '');
    if (!ADSENSE || !pub) return reply.code(404).type('text/plain').send('');
    return reply.type('text/plain').send(`google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`);
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
      await api.register(adminBillingRoutes);
      await api.register(billingRoutes);
      await api.register(friendRoutes);
      await api.register(communityRoutes);
      await api.register(feedbackRoutes);
      await api.register(quizRoutes);
      await api.register(oauthRoutes);
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
