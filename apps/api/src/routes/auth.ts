import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { createSession, destroySession, hashPassword, publicUser, requireUser, verifyPassword } from '../lib/auth.js';
import { HttpError, badRequest } from '../lib/http.js';
import { getSettings } from '../lib/settings.js';
import { extendPremium } from '../lib/plan.js';
import { consumeToken, sendPasswordReset, sendVerification, smtpConfigured, verificationRequired } from '../lib/mail.js';
import { createHash, randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { decryptSecret, encryptSecret, hashRecovery, newRecoveryCodes, newTotpSecret, otpauthUri, verifyTotp } from '../lib/totp.js';
import type { User } from '@prisma/client';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const CHALLENGE_MINUTES = 5;
const CHALLENGE_ATTEMPTS = 5;

/** Vérifie un code TOTP ou un code de secours ; consomme le code de secours utilisé. */
export async function checkSecondFactor(user: User, code: string): Promise<'totp' | 'recovery' | null> {
  if (!user.totpEnabled || !user.totpSecret) return null;
  const clean = code.trim();
  if (/^\d{3}\s?\d{3}$/.test(clean)) {
    const step = verifyTotp(decryptSecret(user.totpSecret), clean, user.totpLastStep);
    if (step === null) return null;
    // Anti-rejeu : mise à jour conditionnelle (un même code ne sert qu'une fois)
    const r = await prisma.user.updateMany({ where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step } });
    return r.count ? 'totp' : null;
  }
  const h = hashRecovery(clean);
  if (!user.recoveryCodes.includes(h)) return null;
  await prisma.user.update({ where: { id: user.id }, data: { recoveryCodes: user.recoveryCodes.filter((c) => c !== h) } });
  return 'recovery';
}

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
  locale: z.string().max(5).optional(),
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
        emailVerified: isFirst || !verificationRequired(),
        locale: ['fr', 'en', 'de', 'es'].includes(String(body.locale)) ? String(body.locale) : 'fr',
      },
    });
    if (!user.emailVerified) await sendVerification(user).catch((e) => req.log.error(e, 'envoi du mail de vérification'));
    // Essai Premium de bienvenue : on découvre tout avant de choisir.
    let fresh = user;
    if (settings.premiumEnabled && settings.trialDays > 0 && user.role !== 'ADMIN') fresh = await extendPremium(user.id, settings.trialDays, 'trial');
    await createSession(fresh, req, reply);
    return { user: publicUser(fresh), trialDays: fresh === user ? 0 : settings.trialDays, needsVerification: !fresh.emailVerified };
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
    if (user.totpEnabled) {
      // Mot de passe correct : on attend maintenant le code de l'application d'authentification.
      const ticket = randomBytes(32).toString('base64url');
      await prisma.loginChallenge.deleteMany({ where: { OR: [{ userId: user.id }, { expiresAt: { lt: new Date() } }] } });
      await prisma.loginChallenge.create({ data: { tokenHash: sha(ticket), userId: user.id, expiresAt: new Date(Date.now() + CHALLENGE_MINUTES * 60_000) } });
      await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
      return { twoFactor: true, ticket };
    }
    const fresh = await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastActiveAt: new Date() } });
    await createSession(fresh, req, reply);
    return { user: publicUser(fresh) };
  });

  app.post('/auth/login/2fa', { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } }, async (req, reply) => {
    const body = parse(z.object({ ticket: z.string().min(10), code: z.string().min(6).max(20) }), req.body);
    const ch = await prisma.loginChallenge.findUnique({ where: { tokenHash: sha(body.ticket) }, include: { user: true } });
    if (!ch || ch.expiresAt < new Date()) throw new HttpError(401, 'Délai dépassé : reconnecte-toi avec ton mot de passe.');
    if (ch.user.disabled) throw new HttpError(403, 'Ce compte est désactivé.');
    const kind = await checkSecondFactor(ch.user, body.code);
    if (!kind) {
      const attempts = ch.attempts + 1;
      if (attempts >= CHALLENGE_ATTEMPTS) {
        await prisma.loginChallenge.delete({ where: { id: ch.id } });
        throw new HttpError(401, 'Trop de codes incorrects : reconnecte-toi avec ton mot de passe.');
      }
      await prisma.loginChallenge.update({ where: { id: ch.id }, data: { attempts } });
      throw new HttpError(401, `Code incorrect (${CHALLENGE_ATTEMPTS - attempts} essai(s) restant(s)).`);
    }
    await prisma.loginChallenge.delete({ where: { id: ch.id } });
    const fresh = await prisma.user.update({ where: { id: ch.userId }, data: { lastActiveAt: new Date() } });
    await createSession(fresh, req, reply);
    return { user: publicUser(fresh), recoveryUsed: kind === 'recovery', recoveryLeft: fresh.recoveryCodes.length };
  });

  /* ---------- Double authentification : configuration ---------- */
  app.get('/auth/2fa', async (req) => {
    const u = requireUser(req);
    return { enabled: u.totpEnabled, recoveryLeft: u.recoveryCodes.length };
  });

  app.post('/auth/2fa/setup', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const u = requireUser(req);
    const body = parse(z.object({ password: z.string().min(1) }), req.body);
    if (!(await verifyPassword(u.passwordHash, body.password))) throw badRequest('Mot de passe incorrect');
    if (u.totpEnabled) throw badRequest('La double authentification est déjà activée');
    const secret = newTotpSecret();
    await prisma.user.update({ where: { id: u.id }, data: { totpSecret: encryptSecret(secret), totpLastStep: null } });
    const uri = otpauthUri(secret, u.email, config.appName);
    const qr = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    return { secret: secret.replace(/(.{4})/g, '$1 ').trim(), uri, qr: `data:image/svg+xml;base64,${Buffer.from(qr).toString('base64')}` };
  });

  app.post('/auth/2fa/enable', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const u = requireUser(req);
    const body = parse(z.object({ code: z.string().min(6).max(8) }), req.body);
    if (u.totpEnabled) throw badRequest('La double authentification est déjà activée');
    if (!u.totpSecret) throw badRequest("Commence par scanner le QR code");
    const step = verifyTotp(decryptSecret(u.totpSecret), body.code, null);
    if (step === null) throw badRequest("Code incorrect. Vérifie que l'heure de ton téléphone est automatique, puis réessaie.");
    const codes = newRecoveryCodes();
    await prisma.user.update({ where: { id: u.id }, data: { totpEnabled: true, totpLastStep: step, recoveryCodes: codes.map(hashRecovery) } });
    // Les autres appareils connectés sont déconnectés par sécurité.
    await prisma.session.deleteMany({ where: { userId: u.id, NOT: { tokenHash: sha(String(req.cookies['cm_session'] ?? '')) } } });
    return { ok: true, recoveryCodes: codes };
  });

  app.post('/auth/2fa/disable', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const u = requireUser(req);
    const body = parse(z.object({ password: z.string().min(1), code: z.string().min(6).max(20) }), req.body);
    if (!(await verifyPassword(u.passwordHash, body.password))) throw badRequest('Mot de passe incorrect');
    if (!(await checkSecondFactor(u, body.code))) throw badRequest('Code incorrect');
    await prisma.user.update({ where: { id: u.id }, data: { totpEnabled: false, totpSecret: null, totpLastStep: null, recoveryCodes: [] } });
    return { ok: true };
  });

  app.post('/auth/2fa/recovery', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req) => {
    const u = requireUser(req);
    const body = parse(z.object({ password: z.string().min(1), code: z.string().min(6).max(20) }), req.body);
    if (!(await verifyPassword(u.passwordHash, body.password))) throw badRequest('Mot de passe incorrect');
    if (!(await checkSecondFactor(u, body.code))) throw badRequest('Code incorrect');
    const codes = newRecoveryCodes();
    await prisma.user.update({ where: { id: u.id }, data: { recoveryCodes: codes.map(hashRecovery) } });
    return { recoveryCodes: codes };
  });

  /* ---------- Vérification de l'adresse e-mail ---------- */
  app.post('/auth/verify-email', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const body = parse(z.object({ token: z.string().min(20).max(200) }), req.body);
    const u = await consumeToken(body.token, 'verify');
    if (!u) throw badRequest('Lien invalide ou expiré. Demande un nouvel e-mail depuis la page de connexion.');
    const fresh = await prisma.user.update({ where: { id: u.id }, data: { emailVerified: true } });
    // Connexion directe depuis le lien (sauf si la double authentification est activée)
    if (!req.user && !fresh.totpEnabled && !fresh.disabled) await createSession(fresh, req, reply);
    return { ok: true, user: req.user || !fresh.totpEnabled ? publicUser(fresh) : null };
  });

  app.post('/auth/verify-email/resend', { config: { rateLimit: { max: 3, timeWindow: '10 minutes' } } }, async (req) => {
    const u = requireUser(req);
    if (u.emailVerified) return { ok: true, already: true };
    const sent = await sendVerification(u);
    return { ok: true, sent };
  });

  /** Changer l'adresse e-mail avant vérification (faute de frappe à l'inscription). */
  app.post('/auth/email', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req) => {
    const u = requireUser(req);
    const body = parse(z.object({ email: z.string().email('Adresse e-mail invalide').max(200), password: z.string().min(1) }), req.body);
    if (!(await verifyPassword(u.passwordHash, body.password))) throw badRequest('Mot de passe incorrect');
    const email = body.email.toLowerCase();
    if (await prisma.user.findFirst({ where: { email, NOT: { id: u.id } } })) throw badRequest('Cette adresse e-mail est déjà utilisée');
    const fresh = await prisma.user.update({ where: { id: u.id }, data: { email, emailVerified: !verificationRequired() } });
    if (!fresh.emailVerified) await sendVerification(fresh);
    return { user: publicUser(fresh) };
  });

  /* ---------- Mot de passe oublié ---------- */
  app.post('/auth/forgot', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (req) => {
    const body = parse(z.object({ email: z.string().email('Adresse e-mail invalide').max(200) }), req.body);
    const u = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (u && !u.disabled) await sendPasswordReset(u).catch((e) => req.log.error(e, 'envoi du mail de réinitialisation'));
    // Même réponse que l'adresse existe ou non (pas d'énumération des comptes).
    return { ok: true, smtp: smtpConfigured() };
  });

  app.post('/auth/reset', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req) => {
    const body = parse(z.object({ token: z.string().min(20).max(200), password: z.string().min(8, 'Mot de passe trop court (8 caractères minimum)').max(200) }), req.body);
    const u = await consumeToken(body.token, 'reset');
    if (!u) throw badRequest('Lien invalide ou expiré. Refais une demande.');
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(body.password), failedLogins: 0, lockedUntil: null, emailVerified: true } });
    await prisma.session.deleteMany({ where: { userId: u.id } });
    return { ok: true };
  });

  app.post('/auth/logout', async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });

  app.get('/auth/me', async (req) => {
    return {
      user: req.user ? publicUser(req.user) : null,
      appName: config.appName,
      registration: config.allowRegistration,
      providers: { google: !!config.oauth.google.clientId, facebook: !!config.oauth.facebook.clientId },
      emailVerification: verificationRequired(),
    };
  });

  app.post('/auth/password', async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ current: z.string(), next: z.string().min(8, 'Nouveau mot de passe trop court') }), req.body);
    if (!(await verifyPassword(user.passwordHash, body.current))) throw badRequest('Mot de passe actuel incorrect');
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.next) } });
    return { ok: true };
  });
}
