import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '@prisma/client';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { HttpError } from './http.js';

export const COOKIE = 'cm_session';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export const hashPassword = (pw: string) =>
  argon2.hash(pw, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const verifyPassword = (hash: string, pw: string) => argon2.verify(hash, pw).catch(() => false);

export async function createSession(user: User, req: FastifyRequest, reply: FastifyReply) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionDays * 86400_000);
  await prisma.session.create({
    data: {
      tokenHash: sha(token),
      userId: user.id,
      expiresAt,
      userAgent: String(req.headers['user-agent'] ?? '').slice(0, 200),
      ip: req.ip,
    },
  });
  setCookie(reply, token, expiresAt);
}

function setCookie(reply: FastifyReply, token: string, expires: Date) {
  reply.setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    expires,
  });
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[COOKIE];
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha(token) } });
  reply.clearCookie(COOKIE, { path: '/' });
}

/** Charge l'utilisateur à partir du cookie ; renouvelle la session (expiration glissante). */
export async function loadUser(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[COOKIE];
  if (!token) return;
  const session = await prisma.session.findUnique({ where: { tokenHash: sha(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || session.user.disabled) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    reply.clearCookie(COOKIE, { path: '/' });
    return;
  }
  const halfLife = (config.sessionDays * 86400_000) / 2;
  if (session.expiresAt.getTime() - Date.now() < halfLife) {
    const expiresAt = new Date(Date.now() + config.sessionDays * 86400_000);
    await prisma.session.update({ where: { id: session.id }, data: { expiresAt } });
    setCookie(reply, token, expiresAt);
  }
  req.user = session.user;
  if (Date.now() - session.user.lastActiveAt.getTime() > 60_000) {
    prisma.user.update({ where: { id: session.user.id }, data: { lastActiveAt: new Date() } }).catch(() => {});
  }
}

export function requireUser(req: FastifyRequest): User {
  if (!req.user) throw new HttpError(401, 'Connexion requise');
  return req.user;
}

export function requireAdmin(req: FastifyRequest): User {
  const u = requireUser(req);
  if (u.role !== 'ADMIN') throw new HttpError(403, 'Réservé aux administrateurs');
  return u;
}

export function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    theme: u.theme,
    timezone: u.timezone,
    dailyGoalXp: u.dailyGoalXp,
    leaderboardOptIn: u.leaderboardOptIn,
    onboardingDone: u.onboardingDone,
    xp: u.xp,
    streak: u.streak,
    longestStreak: u.longestStreak,
    createdAt: u.createdAt,
  };
}
