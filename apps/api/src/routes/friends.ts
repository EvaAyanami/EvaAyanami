import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { User } from '@prisma/client';
import { prisma } from '../db.js';
import { requireUser } from '../lib/auth.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { levelFromXp } from '../lib/levels.js';
import { addDays } from '../lib/srs.js';
import { hasPremium, premiumBadge, premiumHistory } from '../lib/plan.js';
import { effectiveAvatar } from '../lib/avatar.js';
import { FLAME_MILESTONES, flameState } from '../lib/flames.js';
import { parse } from './auth.js';

const MAX_FRIENDS = 200;
const ONLINE_MS = 5 * 60_000;

/** « pseudo#1234 » → { username, discriminator } */
export function parseTag(tag: string) {
  const m = tag.trim().match(/^([a-zA-Z0-9_.-]{3,24})#(\d{4})$/);
  return m ? { username: m[1], discriminator: m[2] } : null;
}

async function hadPremium(ids: string[]) {
  const rows = await prisma.premiumPeriod.groupBy({ by: ['userId'], where: { userId: { in: ids } } });
  return new Set(rows.map((r) => r.userId));
}

function card(u: User, former: Set<string>) {
  return {
    id: u.id,
    tag: `${u.username}#${u.discriminator}`,
    username: u.username,
    discriminator: u.discriminator,
    displayName: u.displayName,
    xp: u.xp,
    level: levelFromXp(u.xp).level,
    streak: u.streak,
    online: Date.now() - u.lastActiveAt.getTime() < ONLINE_MS,
    lastActiveAt: u.lastActiveAt,
    badge: premiumBadge(u, former.has(u.id)),
    avatar: effectiveAvatar(u.avatar, hasPremium(u)),
  };
}

async function weeklyXp(ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const since = addDays(new Date(), -6).toISOString().slice(0, 10);
  const rows = await prisma.dailyActivity.groupBy({ by: ['userId'], where: { userId: { in: ids }, date: { gte: since } }, _sum: { xp: true } });
  return new Map(rows.map((r) => [r.userId, r._sum.xp ?? 0]));
}

async function areFriends(a: string, b: string) {
  return !!(await prisma.friendship.findFirst({ where: { status: 'ACCEPTED', OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] } }));
}

export default async function friendRoutes(app: FastifyInstance) {
  app.get('/friends', async (req) => {
    const me = requireUser(req);
    const rows = await prisma.friendship.findMany({
      where: { OR: [{ requesterId: me.id }, { addresseeId: me.id }] },
      include: { requester: true, addressee: true },
      orderBy: { createdAt: 'desc' },
    });
    const others = rows.map((r) => (r.requesterId === me.id ? r.addressee : r.requester));
    const former = await hadPremium([me.id, ...others.map((o) => o.id)]);
    const accepted = rows.filter((r) => r.status === 'ACCEPTED');
    const week = await weeklyXp([me.id, ...accepted.map((r) => (r.requesterId === me.id ? r.addresseeId : r.requesterId))]);
    const friends = accepted
      .map((r) => {
        const o = r.requesterId === me.id ? r.addressee : r.requester;
        return { friendshipId: r.id, since: r.acceptedAt, weeklyXp: week.get(o.id) ?? 0, flame: flameState(r, r.requesterId === me.id), ...card(o, former) };
      })
      .sort((a, b) => Number(b.online) - Number(a.online) || b.weeklyXp - a.weeklyXp);
    const ranking = [...friends.map((f) => ({ id: f.id, tag: f.tag, displayName: f.displayName, weeklyXp: f.weeklyXp, me: false, badge: f.badge })), { id: me.id, tag: `${me.username}#${me.discriminator}`, displayName: me.displayName, weeklyXp: week.get(me.id) ?? 0, me: true, badge: premiumBadge(me, former.has(me.id)) }].sort(
      (a, b) => b.weeklyXp - a.weeklyXp,
    );
    return {
      me: { tag: `${me.username}#${me.discriminator}` },
      milestones: FLAME_MILESTONES,
      friends,
      ranking,
      incoming: rows.filter((r) => r.status === 'PENDING' && r.addresseeId === me.id).map((r) => ({ friendshipId: r.id, createdAt: r.createdAt, ...card(r.requester, former) })),
      outgoing: rows.filter((r) => r.status === 'PENDING' && r.requesterId === me.id).map((r) => ({ friendshipId: r.id, createdAt: r.createdAt, ...card(r.addressee, former) })),
    };
  });

  app.post('/friends/request', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
    const me = requireUser(req);
    const body = parse(z.object({ tag: z.string().min(3).max(40) }), req.body);
    const t = parseTag(body.tag);
    if (!t) throw badRequest('Format attendu : pseudo#1234 (le pseudo, un dièse et 4 chiffres)');
    const other = await prisma.user.findFirst({ where: { username: { equals: t.username, mode: 'insensitive' }, discriminator: t.discriminator, disabled: false } });
    // Message volontairement identique si le pseudo existe mais pas le numéro (pas d'énumération).
    if (!other) throw notFound(`Aucun compte « ${body.tag.trim()} »`);
    if (other.id === me.id) throw badRequest("C'est ton propre identifiant 😄");
    const count = await prisma.friendship.count({ where: { status: 'ACCEPTED', OR: [{ requesterId: me.id }, { addresseeId: me.id }] } });
    if (count >= MAX_FRIENDS) throw badRequest(`Limite de ${MAX_FRIENDS} amis atteinte`);
    const existing = await prisma.friendship.findFirst({ where: { OR: [{ requesterId: me.id, addresseeId: other.id }, { requesterId: other.id, addresseeId: me.id }] } });
    if (existing?.status === 'ACCEPTED') throw badRequest('Vous êtes déjà amis');
    if (existing && existing.requesterId === me.id) throw badRequest('Demande déjà envoyée');
    if (existing) {
      // L'autre m'avait déjà invité : on accepte directement.
      await prisma.friendship.update({ where: { id: existing.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
      return { ok: true, accepted: true };
    }
    await prisma.friendship.create({ data: { requesterId: me.id, addresseeId: other.id } });
    return { ok: true, accepted: false };
  });

  app.post<{ Params: { id: string } }>('/friends/:id/accept', async (req) => {
    const me = requireUser(req);
    const f = await prisma.friendship.findUnique({ where: { id: req.params.id } });
    if (!f || f.addresseeId !== me.id || f.status !== 'PENDING') throw notFound('Demande');
    await prisma.friendship.update({ where: { id: f.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
    return { ok: true };
  });

  /** Refuser, annuler une demande ou retirer un ami. */
  app.delete<{ Params: { id: string } }>('/friends/:id', async (req) => {
    const me = requireUser(req);
    const f = await prisma.friendship.findUnique({ where: { id: req.params.id } });
    if (!f || (f.requesterId !== me.id && f.addresseeId !== me.id)) throw notFound('Ami');
    await prisma.friendship.delete({ where: { id: f.id } });
    return { ok: true };
  });

  /** Profil d'un ami (visible uniquement entre amis). */
  app.get<{ Params: { id: string } }>('/friends/profile/:id', async (req) => {
    const me = requireUser(req);
    const u = await prisma.user.findUnique({ where: { id: req.params.id }, include: { skills: true } });
    if (!u) throw notFound('Utilisateur');
    if (u.id !== me.id && !(await areFriends(me.id, u.id))) throw forbidden('Profil visible uniquement par ses amis');
    const [hist, achievements, chapters, week] = await Promise.all([
      premiumHistory(u.id),
      prisma.userAchievement.findMany({ where: { userId: u.id }, include: { achievement: true }, orderBy: { unlockedAt: 'desc' }, take: 12 }),
      prisma.chapterProgress.count({ where: { userId: u.id, completedAt: { not: null } } }),
      weeklyXp([u.id]),
    ]);
    return {
      ...card(u, new Set(hist.periods.length ? [u.id] : [])),
      createdAt: u.createdAt,
      longestStreak: u.longestStreak,
      weeklyXp: week.get(u.id) ?? 0,
      chaptersCompleted: chapters,
      premiumDays: hist.totalDays,
      premiumSince: hist.since,
      skills: u.skills.map((s) => ({ language: s.languageId, level: s.level })),
      achievements: achievements.map((a) => ({ icon: a.achievement.icon, title: a.achievement.title, unlockedAt: a.unlockedAt })),
    };
  });
}
