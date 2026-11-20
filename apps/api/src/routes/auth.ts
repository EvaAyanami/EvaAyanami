import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { createSession, destroySession, hashPassword, publicUser, requireUser, verifyPassword } from '../lib/auth.js';
import { HttpError, badRequest } from '../lib/http.js';
import { getSettings } from '../lib/settings.js';

const registerSchema = z.object({
  email: z.string().email('Adresse e-mail invalide').max(200),
  username: z
    .string()
    .min(3, 'Pseudo trop court (3 caractères minimum)')
    .max(24)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Pseudo : lettres, chiffres, _ . - uniquement'),
  displayName: z.string().min(1).max(40).optional(),
  password: z.string().min(8, 'Mot de passe trop court (8 caractères minimum)').max(200),
  timezone: z.string().max(60).optional(),
});

export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw badRequest(r.error.issues[0]?.message ?? 'Données invalides', r.error.issues);
  return r.data;
}

const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export default async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    if (!config.allowRegistration && (await prisma.user.count()) > 0) throw new HttpError(403, 'Les inscriptions sont fermées sur ce serveur.');
    const body = parse(registerSchema, req.body);
    const email = body.email.toLowerCase();
    const exists = await prisma.user.findFirst({ where: { OR: [{ email }, { username: body.username }] } });
    if (exists) throw badRequest(exists.email === email ? 'Cette adresse e-mail est déjà utilisée' : 'Ce pseudo est déjà pris');
    const isFirst = (await prisma.user.count({ where: { role: 'ADMIN' } })) === 0;
    const settings = await getSettings();
    const user = await prisma.user.create({
      data: {
        email,
        username: body.username,
        displayName: body.displayName || body.username,
        passwordHash: await hashPassword(body.password),
        role: isFirst ? 'ADMIN' : 'USER',
        timezone: body.timezone || 'Europe/Paris',
        dailyGoalXp: settings.defaultDailyGoal,
      },
    });
    await createSession(user, req, reply);
    return { user: publicUser(user) };
  });

  app.post('/auth/login', { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } }, async (req, reply) => {
    const body = parse(z.object({ login: z.string().min(1), password: z.string().min(1) }), req.body);
    const login = body.login.trim();
    const user = await prisma.user.findFirst({ where: { OR: [{ email: login.toLowerCase() }, { username: login }] } });
    const invalid = new HttpError(401, 'Identifiants incorrects');
    if (!user) {
      await hashPassword(body.password); // temps constant approximatif
      throw invalid;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpError(429, 'Trop de tentatives. Compte temporairement verrouillé, réessaie dans quelques minutes.');
    }
    if (!(await verifyPassword(user.passwordHash, body.password))) {
      const failed = user.failedLogins + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: failed >= MAX_FAILED ? 0 : failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
      });
      throw invalid;
    }
    if (user.disabled) throw new HttpError(403, 'Ce compte est désactivé.');
    const fresh = await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastActiveAt: new Date() } });
    await createSession(fresh, req, reply);
    return { user: publicUser(fresh) };
  });

  app.post('/auth/logout', async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });

  app.get('/auth/me', async (req) => {
    return { user: req.user ? publicUser(req.user) : null, appName: config.appName, registration: config.allowRegistration };
  });

  app.post('/auth/password', async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ current: z.string(), next: z.string().min(8, 'Nouveau mot de passe trop court') }), req.body);
    if (!(await verifyPassword(user.passwordHash, body.current))) throw badRequest('Mot de passe actuel incorrect');
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.next) } });
    return { ok: true };
  });
}
