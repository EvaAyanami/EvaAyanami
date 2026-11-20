import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireUser, publicUser } from '../lib/auth.js';
import { notFound } from '../lib/http.js';
import { publicExercise } from '../lib/grading.js';
import { achievementProgress, currentChallenges } from '../lib/gamification.js';
import { getSettings } from '../lib/settings.js';
import { levelFromXp, localDate, weekKey, LEVEL_NAMES } from '../lib/levels.js';
import { chapterStatuses, nextLesson } from '../lib/progress.js';
import { addDays } from '../lib/srs.js';
import { parse } from './auth.js';
import { LANGS } from './exercises.js';

export async function weakPoints(userId: string, limit = 6) {
  const rows = await prisma.$queryRaw<{ concept: string; language: string; total: bigint; ok: bigint }[]>`
    SELECT c AS concept, e.language AS language, COUNT(*) AS total, SUM(CASE WHEN a.correct THEN 1 ELSE 0 END) AS ok
    FROM "Attempt" a JOIN "Exercise" e ON e.id = a."exerciseId", unnest(e.concepts) AS c
    WHERE a."userId" = ${userId} AND a."createdAt" > now() - interval '90 days' AND e.language IS NOT NULL
    GROUP BY c, e.language
    HAVING COUNT(*) >= 2
    ORDER BY SUM(CASE WHEN a.correct THEN 1 ELSE 0 END)::float / COUNT(*) ASC
    LIMIT ${limit}`;
  return rows
    .map((r) => ({ concept: r.concept, language: r.language, attempts: Number(r.total), successRate: Number(r.ok) / Number(r.total) }))
    .filter((r) => r.successRate < 0.75);
}

export default async function progressRoutes(app: FastifyInstance) {
  /* ---------------- Tableau de bord ---------------- */
  app.get('/dashboard', async (req) => {
    const user = requireUser(req);
    const today = localDate(user.timezone);
    const [daily, solved, attempts, correctAttempts, chaptersDone, reviewsDue, recent, last30] = await Promise.all([
      prisma.dailyActivity.findUnique({ where: { userId_date: { userId: user.id, date: today } } }),
      prisma.exerciseProgress.count({ where: { userId: user.id, solved: true } }),
      prisma.attempt.count({ where: { userId: user.id } }),
      prisma.attempt.count({ where: { userId: user.id, correct: true } }),
      prisma.chapterProgress.count({ where: { userId: user.id, completedAt: { not: null }, skipped: false } }),
      prisma.reviewItem.count({ where: { userId: user.id, dueAt: { lte: new Date() } } }),
      prisma.activityLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 8 }),
      prisma.dailyActivity.findMany({ where: { userId: user.id, date: { gte: localDate(user.timezone, addDays(new Date(), -29)) } }, orderBy: { date: 'asc' } }),
    ]);
    const languages = [];
    for (const l of await prisma.language.findMany({ where: { enabled: true }, orderBy: { order: 'asc' } })) {
      const st = await chapterStatuses(user.id, l.id);
      const skill = await prisma.skillProfile.findUnique({ where: { userId_languageId: { userId: user.id, languageId: l.id } } });
      const byLevel = [1, 2, 3, 4, 5].map((lv) => {
        const c = st.filter((s) => s.chapter.level === lv);
        return { level: lv, total: c.length, validated: c.filter((s) => s.status === 'done' || s.status === 'skipped').length };
      });
      languages.push({
        id: l.id,
        name: l.name,
        color: l.color,
        total: st.length,
        done: st.filter((s) => s.status === 'done').length,
        validated: st.filter((s) => s.status === 'done' || s.status === 'skipped').length,
        skillLevel: skill?.level ?? 1,
        skillName: LEVEL_NAMES[skill?.level ?? 1],
        byLevel,
        next: await nextLesson(user.id, l.id),
      });
    }
    const challenges = await currentChallenges();
    const uc = await prisma.userChallenge.findMany({ where: { userId: user.id, challengeId: { in: challenges.map((c) => c.id) } } });
    const lastAny = await prisma.attempt.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, select: { language: true } });
    const recommended =
      languages.find((l) => l.id === (user.lastLocation as any)?.language)?.next ??
      languages.find((l) => l.id === lastAny?.language)?.next ??
      languages.find((l) => l.next)?.next ??
      null;
    // La série est « en danger » si aucune activité aujourd'hui
    const streakAlive = user.lastStreakDate === today || user.lastStreakDate === localDate(user.timezone, addDays(new Date(), -1));
    return {
      user: publicUser(user),
      level: levelFromXp(user.xp),
      streak: streakAlive ? user.streak : 0,
      streakDoneToday: user.lastStreakDate === today,
      daily: { xp: daily?.xp ?? 0, goal: user.dailyGoalXp, exercises: daily?.exercises ?? 0 },
      learningTimeMs: Number(user.learningTimeMs),
      solved,
      attempts,
      successRate: attempts ? correctAttempts / attempts : 0,
      chaptersDone,
      reviewsDue,
      languages,
      recommended,
      resume: user.lastLocation,
      weakPoints: await weakPoints(user.id),
      recent: recent.map((r) => ({ type: r.type, message: r.message, at: r.createdAt })),
      activity: last30.map((d) => ({ date: d.date, xp: d.xp, exercises: d.exercises })),
      challenges: challenges.map((c) => {
        const u = uc.find((x) => x.challengeId === c.id);
        return { id: c.id, title: c.title, target: c.target, xpReward: c.xpReward, progress: Math.min(c.target, u?.progress ?? 0), done: !!u?.completedAt };
      }),
    };
  });

  /* ---------------- Statistiques détaillées ---------------- */
  app.get('/stats', async (req) => {
    const user = requireUser(req);
    const from = localDate(user.timezone, addDays(new Date(), -89));
    const daily = await prisma.dailyActivity.findMany({ where: { userId: user.id, date: { gte: from } }, orderBy: { date: 'asc' } });
    const byType = await prisma.$queryRaw<{ type: string; total: bigint; ok: bigint }[]>`
      SELECT e.type, COUNT(*) total, SUM(CASE WHEN a.correct THEN 1 ELSE 0 END) ok
      FROM "Attempt" a JOIN "Exercise" e ON e.id = a."exerciseId" WHERE a."userId" = ${user.id} GROUP BY e.type`;
    const byLang = await prisma.$queryRaw<{ language: string; total: bigint; ok: bigint; solved: bigint }[]>`
      SELECT a.language, COUNT(*) total, SUM(CASE WHEN a.correct THEN 1 ELSE 0 END) ok,
        (SELECT COUNT(*) FROM "ExerciseProgress" p WHERE p."userId" = ${user.id} AND p.language = a.language AND p.solved) solved
      FROM "Attempt" a WHERE a."userId" = ${user.id} GROUP BY a.language`;
    const examScores = await prisma.chapterProgress.findMany({
      where: { userId: user.id, examScore: { gt: 0 } },
      include: { chapter: { select: { title: true, languageId: true, slug: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    return {
      daily: daily.map((d) => ({ date: d.date, xp: d.xp, exercises: d.exercises, correct: d.correct, timeMs: d.timeMs })),
      byType: byType.map((t) => ({ type: t.type, total: Number(t.total), successRate: Number(t.ok) / Number(t.total) })),
      byLanguage: byLang.map((t) => ({ language: t.language, attempts: Number(t.total), successRate: Number(t.ok) / Number(t.total), solved: Number(t.solved) })),
      exams: examScores.map((e) => ({ chapter: e.chapter.title, slug: e.chapter.slug, language: e.chapter.languageId, score: e.examScore, passed: e.examPassed })),
      weakPoints: await weakPoints(user.id, 10),
      totals: { xp: user.xp, level: levelFromXp(user.xp), longestStreak: user.longestStreak, learningTimeMs: Number(user.learningTimeMs) },
    };
  });

  app.get('/achievements', async (req) => achievementProgress(requireUser(req)));

  app.get('/leaderboard', async (req) => {
    const user = requireUser(req);
    const settings = await getSettings();
    if (!settings.leaderboardEnabled) return { enabled: false, weekly: [], allTime: [], optIn: user.leaderboardOptIn };
    const wk = weekKey();
    const monday = (() => {
      const d = new Date();
      const day = (d.getUTCDay() + 6) % 7;
      return addDays(d, -day).toISOString().slice(0, 10);
    })();
    const weekly = await prisma.$queryRaw<{ id: string; displayName: string; username: string; xp: bigint }[]>`
      SELECT u.id, u."displayName", u.username, COALESCE(SUM(d.xp), 0) xp FROM "User" u
      LEFT JOIN "DailyActivity" d ON d."userId" = u.id AND d.date >= ${monday}
      WHERE u."leaderboardOptIn" = true AND u.disabled = false GROUP BY u.id ORDER BY xp DESC LIMIT 50`;
    const allTime = await prisma.user.findMany({
      where: { leaderboardOptIn: true, disabled: false },
      orderBy: { xp: 'desc' },
      take: 50,
      select: { id: true, displayName: true, username: true, xp: true, streak: true },
    });
    return {
      enabled: true,
      week: wk,
      optIn: user.leaderboardOptIn,
      weekly: weekly.map((w) => ({ ...w, xp: Number(w.xp), me: w.id === user.id })),
      allTime: allTime.map((a) => ({ ...a, level: levelFromXp(a.xp).level, me: a.id === user.id })),
    };
  });

  /* ---------------- Révisions (répétition espacée) ---------------- */
  app.get<{ Querystring: { language?: string } }>('/review/queue', async (req) => {
    const user = requireUser(req);
    const settings = await getSettings();
    const language = req.query.language && LANGS.includes(req.query.language) ? req.query.language : undefined;
    const size = settings.reviewSessionSize;
    const now = new Date();
    let items = await prisma.reviewItem.findMany({
      where: { userId: user.id, dueAt: { lte: now }, ...(language ? { language } : {}) },
      orderBy: [{ lapses: 'desc' }, { dueAt: 'asc' }],
      take: size,
      include: { exercise: true },
    });
    // Compléter avec des notions « oubliées » : exercices réussis il y a longtemps
    if (items.length < size) {
      const old = await prisma.exerciseProgress.findMany({
        where: {
          userId: user.id,
          solved: true,
          updatedAt: { lt: addDays(now, -14) },
          exercise: { kind: 'practice', type: { not: 'code' }, reviews: { none: { userId: user.id } } },
          ...(language ? { language } : {}),
        },
        take: size - items.length,
        include: { exercise: true },
      });
      for (const o of old) {
        const it = await prisma.reviewItem.create({
          data: { userId: user.id, exerciseId: o.exerciseId, language: o.language, dueAt: now, reason: 'forgotten', interval: 14, repetitions: 2 },
          include: { exercise: true },
        });
        items.push(it);
      }
    }
    items = items.filter((i) => i.exercise.kind !== 'placement');
    const reasons: Record<string, string> = { error: 'Ancienne erreur', learned: 'Consolidation', forgotten: 'Notion à rafraîchir', weak: 'Point faible' };
    return {
      items: items.map((i) => ({ ...publicExercise(i.exercise, i.language), reviewReason: reasons[i.reason] ?? 'Révision', lapses: i.lapses })),
      upcoming: await prisma.reviewItem.count({ where: { userId: user.id, dueAt: { gt: now, lte: addDays(now, 7) } } }),
    };
  });

  app.get('/review/summary', async (req) => {
    const user = requireUser(req);
    const now = new Date();
    const due = await prisma.reviewItem.groupBy({ by: ['language'], where: { userId: user.id, dueAt: { lte: now } }, _count: true });
    const total = await prisma.reviewItem.count({ where: { userId: user.id } });
    const mastered = await prisma.reviewItem.count({ where: { userId: user.id, interval: { gte: 21 } } });
    const forecast = [];
    for (let d = 1; d <= 7; d++) {
      forecast.push({
        day: d,
        count: await prisma.reviewItem.count({ where: { userId: user.id, dueAt: { gt: addDays(now, d - 1), lte: addDays(now, d) } } }),
      });
    }
    return { due: due.map((d) => ({ language: d.language, count: d._count })), total, mastered, forecast, weakPoints: await weakPoints(user.id) };
  });

  /* ---------------- Projets ---------------- */
  app.get('/projects', async (req) => {
    const user = requireUser(req);
    const projects = await prisma.project.findMany({
      where: { published: true },
      orderBy: [{ level: 'asc' }, { order: 'asc' }],
      include: { _count: { select: { steps: true } }, progress: { where: { userId: user.id } } },
    });
    return projects.map((p) => ({
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      level: p.level,
      levelName: LEVEL_NAMES[p.level],
      languages: p.languages,
      steps: p._count.steps,
      progress: p.progress.map((x) => ({ language: x.language, stepsDone: x.stepsDone.length, completed: !!x.completedAt })),
    }));
  });

  app.get<{ Params: { slug: string }; Querystring: { language?: string } }>('/projects/:slug', async (req) => {
    const user = requireUser(req);
    const p = await prisma.project.findUnique({ where: { slug: req.params.slug }, include: { steps: { orderBy: { order: 'asc' } } } });
    if (!p || !p.published) throw notFound('Projet');
    const language = req.query.language && p.languages.includes(req.query.language) ? req.query.language : p.languages[0];
    const pp = await prisma.projectProgress.findUnique({ where: { userId_projectId_language: { userId: user.id, projectId: p.id, language } } });
    const ep = await prisma.exerciseProgress.findMany({ where: { userId: user.id, language, exerciseId: { in: p.steps.map((s) => s.id) } } });
    await prisma.user.update({ where: { id: user.id }, data: { lastLocation: { path: `/projets/${p.slug}?language=${language}`, label: `Projet : ${p.title}`, language } } });
    return {
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      description: p.description,
      objectives: p.objectives,
      constraints: p.constraints,
      level: p.level,
      levelName: LEVEL_NAMES[p.level],
      languages: p.languages,
      language,
      completed: !!pp?.completedAt,
      steps: p.steps.map((s) => {
        const e = ep.find((x) => x.exerciseId === s.id);
        return { ...publicExercise(s, language), state: { solved: pp?.stepsDone.includes(s.id) ?? false, attempts: e?.attempts ?? 0, draft: e?.draft ?? null, hintsUsed: e?.hintsUsed ?? 0 } };
      }),
    };
  });

  /* ---------------- Temps d'apprentissage & position ---------------- */
  app.post('/me/heartbeat', async (req) => {
    const user = requireUser(req);
    const body = parse(
      z.object({ timeMs: z.number().int().min(0).max(5 * 60_000), location: z.object({ path: z.string().max(200), label: z.string().max(200), language: z.string().optional() }).optional() }),
      req.body,
    );
    const today = localDate(user.timezone);
    await prisma.dailyActivity.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      create: { userId: user.id, date: today, timeMs: body.timeMs },
      update: { timeMs: { increment: body.timeMs } },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { learningTimeMs: { increment: BigInt(body.timeMs) }, ...(body.location ? { lastLocation: body.location } : {}) },
    });
    return { ok: true };
  });
}
