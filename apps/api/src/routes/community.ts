import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireUser } from '../lib/auth.js';
import { HttpError, notFound } from '../lib/http.js';
import { levelFromXp, weekKey } from '../lib/levels.js';
import { addDays } from '../lib/srs.js';
import { logActivity } from '../lib/gamification.js';
import { getSettings } from '../lib/settings.js';
import { hasPremium, premiumBadge, premiumHistory } from '../lib/plan.js';
import { AVATAR_OPTIONS, DEFAULT_AVATAR, PREMIUM_ITEMS, avatarSchema, effectiveAvatar, premiumItemsUsed, type Avatar } from '../lib/avatar.js';
import { parseTag } from './friends.js';
import { parse } from './auth.js';

/** Lundi (UTC, AAAA-MM-JJ) de la semaine contenant `d`. */
function monday(d: Date) {
  const day = (d.getUTCDay() + 6) % 7;
  return addDays(d, -day).toISOString().slice(0, 10);
}

async function weekRanking(from: string, to: string | null, take: number) {
  const rows = await prisma.$queryRaw<{ id: string; xp: bigint }[]>`
    SELECT u.id, SUM(d.xp) xp FROM "DailyActivity" d JOIN "User" u ON u.id = d."userId"
    WHERE d.date >= ${from} AND (${to}::text IS NULL OR d.date <= ${to}::text)
      AND u."leaderboardOptIn" = true AND u.disabled = false AND u.role = 'USER'
    GROUP BY u.id HAVING SUM(d.xp) > 0 ORDER BY xp DESC LIMIT ${take}`;
  return rows.map((r) => ({ id: r.id, xp: Number(r.xp) }));
}

/** Désigne (une seule fois) le meilleur codeur de la semaine écoulée et lui donne son bonus. */
export async function settleLastWeek() {
  const lastWeekDate = addDays(new Date(), -7);
  const key = weekKey(lastWeekDate);
  if (await prisma.weeklyWinner.findUnique({ where: { weekKey: key } })) return;
  const from = monday(lastWeekDate);
  const to = addDays(new Date(`${from}T00:00:00Z`), 6).toISOString().slice(0, 10);
  const [top] = await weekRanking(from, to, 1);
  if (!top) return;
  try {
    await prisma.weeklyWinner.create({ data: { weekKey: key, userId: top.id, xp: top.xp } });
  } catch {
    return; // déjà désigné par une requête simultanée
  }
  const bonus = (await getSettings()).bestCoderXp;
  if (bonus > 0) await prisma.user.update({ where: { id: top.id }, data: { xp: { increment: bonus } } });
  await logActivity(top.id, 'best_coder', `🏆 Meilleur codeur de la semaine ${key} (${top.xp} XP) : +${bonus} XP`, { weekKey: key });
}

type MiniUser = { id: string; username: string; discriminator: string; displayName: string; xp: number; avatar: unknown; premiumUntil: Date | null };
const miniSelect = { id: true, username: true, discriminator: true, displayName: true, xp: true, avatar: true, premiumUntil: true } as const;
const mini = (u: MiniUser) => ({
  id: u.id, tag: `${u.username}#${u.discriminator}`, displayName: u.displayName, level: levelFromXp(u.xp).level,
  avatar: effectiveAvatar(u.avatar, hasPremium(u as any)), premium: hasPremium(u as any),
});

export default async function communityRoutes(app: FastifyInstance) {
  app.get('/community/best-coder', async (req) => {
    const me = requireUser(req);
    await settleLastWeek().catch((e) => req.log.warn(e));
    const live = await weekRanking(monday(new Date()), null, 10);
    const users = await prisma.user.findMany({ where: { id: { in: live.map((l) => l.id) } }, select: miniSelect });
    const winners = await prisma.weeklyWinner.findMany({ orderBy: { weekKey: 'desc' }, take: 12, include: { user: { select: miniSelect } } });
    const now = new Date();
    const end = addDays(new Date(`${monday(now)}T00:00:00Z`), 7);
    return {
      week: weekKey(),
      endsAt: end,
      bonusXp: (await getSettings()).bestCoderXp,
      optIn: me.leaderboardOptIn,
      leaders: live.map((l, i) => ({ rank: i + 1, xp: l.xp, me: l.id === me.id, ...mini(users.find((u) => u.id === l.id)!) })),
      lastWinner: winners[0] ? { weekKey: winners[0].weekKey, xp: winners[0].xp, ...mini(winners[0].user) } : null,
      hallOfFame: winners.map((w) => ({ weekKey: w.weekKey, xp: w.xp, ...mini(w.user) })),
    };
  });

  /* ---------- Avatar ---------- */
  app.get('/avatar/options', async () => ({ options: AVATAR_OPTIONS, premium: PREMIUM_ITEMS, defaults: DEFAULT_AVATAR }));

  app.get('/me/avatar', async (req) => {
    const u = requireUser(req);
    return { avatar: effectiveAvatar(u.avatar, true), bio: u.bio ?? '' };
  });

  app.put('/me/avatar', async (req) => {
    const u = requireUser(req);
    const body = parse(z.object({ avatar: avatarSchema, bio: z.string().max(160).optional() }), req.body);
    const used = premiumItemsUsed(body.avatar as Avatar);
    if (used.length && !hasPremium(u) && u.role !== 'ADMIN') throw new HttpError(402, 'Certains éléments choisis sont réservés aux membres Premium 👑', { code: 'PREMIUM_ONLY' });
    await prisma.user.update({ where: { id: u.id }, data: { avatar: body.avatar, ...(body.bio !== undefined ? { bio: body.bio.trim() || null } : {}) } });
    return { ok: true, avatar: body.avatar };
  });

  /* ---------- Profil public ---------- */
  app.get<{ Params: { tag: string } }>('/users/:tag', async (req) => {
    const me = requireUser(req);
    const t = parseTag(decodeURIComponent(req.params.tag));
    if (!t) throw notFound('Profil');
    const u = await prisma.user.findFirst({ where: { username: { equals: t.username, mode: 'insensitive' }, discriminator: t.discriminator, disabled: false }, include: { skills: true } });
    if (!u) throw notFound('Profil');
    const [hist, achievements, chapters, projects, wins, friendship, solved] = await Promise.all([
      premiumHistory(u.id),
      prisma.userAchievement.findMany({ where: { userId: u.id }, include: { achievement: true }, orderBy: { unlockedAt: 'desc' }, take: 18 }),
      prisma.chapterProgress.count({ where: { userId: u.id, completedAt: { not: null }, skipped: false } }),
      prisma.projectProgress.count({ where: { userId: u.id, completedAt: { not: null } } }),
      prisma.weeklyWinner.findMany({ where: { userId: u.id }, orderBy: { weekKey: 'desc' } }),
      prisma.friendship.findFirst({ where: { OR: [{ requesterId: me.id, addresseeId: u.id }, { requesterId: u.id, addresseeId: me.id }] } }),
      prisma.exerciseProgress.count({ where: { userId: u.id, solved: true } }),
    ]);
    const premium = hasPremium(u);
    const lvl = levelFromXp(u.xp);
    return {
      id: u.id,
      me: u.id === me.id,
      tag: `${u.username}#${u.discriminator}`,
      displayName: u.displayName,
      bio: u.bio,
      avatar: effectiveAvatar(u.avatar, premium),
      badge: premiumBadge(u, hist.periods.length > 0),
      premiumDays: hist.totalDays,
      premiumSince: hist.since,
      role: u.role,
      xp: u.xp,
      level: lvl.level,
      levelProgress: (u.xp - lvl.current) / Math.max(1, lvl.next - lvl.current),
      streak: u.streak,
      longestStreak: u.longestStreak,
      createdAt: u.createdAt,
      online: Date.now() - u.lastActiveAt.getTime() < 5 * 60_000,
      chaptersCompleted: chapters,
      projectsCompleted: projects,
      exercisesSolved: solved,
      bestCoderWins: wins.map((w) => w.weekKey),
      skills: u.skills.map((s) => ({ language: s.languageId, level: s.level })),
      achievements: achievements.map((a) => ({ icon: a.achievement.icon, title: a.achievement.title, unlockedAt: a.unlockedAt })),
      friendship: friendship ? { id: friendship.id, status: friendship.status, outgoing: friendship.requesterId === me.id } : null,
    };
  });
}
