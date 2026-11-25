import type { User } from '@prisma/client';
import { prisma } from '../db.js';
import { levelFromXp, localDate, previousDay, weekKey } from './levels.js';
import { getSettings } from './settings.js';

export interface Rewards {
  xp: number;
  totalXp: number;
  level: number;
  levelUp: boolean;
  streak: number;
  streakIncreased: boolean;
  dailyXp: number;
  dailyGoal: number;
  dailyGoalReached: boolean;
  achievements: { id: string; title: string; description: string; icon: string; xp: number }[];
  challenges: { title: string; xpReward: number }[];
}

type Metric = 'xp' | 'exercises' | 'reviews' | 'chapters' | 'code';

export async function currentChallenges() {
  const settings = await getSettings();
  const wk = weekKey();
  const existing = await prisma.weeklyChallenge.findMany({ where: { weekKey: wk } });
  if (existing.length) return existing;
  // Sélection de 3 défis variés pour la semaine (rotation déterministe)
  const templates = settings.weeklyChallenges;
  const n = Number(wk.slice(-2));
  const picks = [0, 1, 2].map((i) => templates[(n + i * 2) % templates.length]);
  const unique = picks.filter((p, i) => picks.findIndex((q) => q.metric === p.metric) === i);
  for (const t of unique) {
    await prisma.weeklyChallenge
      .create({ data: { weekKey: wk, metric: t.metric, target: t.target, xpReward: t.xpReward, title: t.title.replace('{n}', String(t.target)) } })
      .catch(() => {});
  }
  return prisma.weeklyChallenge.findMany({ where: { weekKey: wk } });
}

async function bumpChallenges(userId: string, metrics: Partial<Record<Metric, number>>) {
  const completed: { title: string; xpReward: number }[] = [];
  const list = await currentChallenges();
  for (const c of list) {
    const inc = metrics[c.metric as Metric];
    if (!inc) continue;
    const uc = await prisma.userChallenge.upsert({
      where: { userId_challengeId: { userId, challengeId: c.id } },
      create: { userId, challengeId: c.id, progress: inc },
      update: { progress: { increment: inc } },
    });
    if (!uc.completedAt && uc.progress >= c.target) {
      await prisma.userChallenge.update({ where: { id: uc.id }, data: { completedAt: new Date() } });
      completed.push({ title: c.title, xpReward: c.xpReward });
    }
  }
  return completed;
}

export async function logActivity(userId: string, type: string, message: string, meta?: object) {
  await prisma.activityLog.create({ data: { userId, type, message, meta: meta as any } });
}

/**
 * Point d'entrée unique pour récompenser une activité : XP, série, objectif
 * quotidien, défis hebdomadaires et succès.
 */
/** Protection de série (Premium) : disponible une fois tous les 7 jours. */
export function canSaveStreak(user: User) {
  const premium = !!user.premiumUntil && user.premiumUntil > new Date();
  return premium && (!user.streakSavedAt || Date.now() - user.streakSavedAt.getTime() > 7 * 86400_000);
}

export async function reward(
  user: User,
  opts: { xp: number; exercises?: number; correct?: number; reviews?: number; chapters?: number; code?: number; timeMs?: number },
): Promise<Rewards> {
  const today = localDate(user.timezone);
  const before = levelFromXp(user.xp);
  let streak = user.streak;
  let streakIncreased = false;
  const active = opts.xp > 0 || (opts.correct ?? 0) > 0;
  let streakSaved = false;
  if (active && user.lastStreakDate !== today) {
    if (user.lastStreakDate === previousDay(today)) streak = user.streak + 1;
    else if (user.lastStreakDate === previousDay(previousDay(today)) && canSaveStreak(user)) {
      // Avantage Premium : un jour manqué par semaine ne casse pas la série.
      streak = user.streak + 1;
      streakSaved = true;
    } else streak = 1;
    streakIncreased = true;
  }
  const daily = await prisma.dailyActivity.upsert({
    where: { userId_date: { userId: user.id, date: today } },
    create: {
      userId: user.id,
      date: today,
      xp: opts.xp,
      exercises: opts.exercises ?? 0,
      correct: opts.correct ?? 0,
      reviews: opts.reviews ?? 0,
      timeMs: opts.timeMs ?? 0,
    },
    update: {
      xp: { increment: opts.xp },
      exercises: { increment: opts.exercises ?? 0 },
      correct: { increment: opts.correct ?? 0 },
      reviews: { increment: opts.reviews ?? 0 },
      timeMs: { increment: opts.timeMs ?? 0 },
    },
  });
  const challenges = await bumpChallenges(user.id, {
    xp: opts.xp,
    exercises: opts.correct,
    reviews: opts.reviews,
    chapters: opts.chapters,
    code: opts.code,
  });
  const bonus = challenges.reduce((s, c) => s + c.xpReward, 0);
  let updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      xp: { increment: opts.xp + bonus },
      streak,
      longestStreak: Math.max(user.longestStreak, streak),
      ...(streakSaved ? { streakSavedAt: new Date() } : {}),
      lastStreakDate: active ? today : user.lastStreakDate,
      learningTimeMs: { increment: BigInt(opts.timeMs ?? 0) },
    },
  });
  if (bonus) {
    await prisma.dailyActivity.update({ where: { id: daily.id }, data: { xp: { increment: bonus } } });
    for (const c of challenges) await logActivity(user.id, 'challenge', `Défi hebdomadaire réussi : ${c.title}`);
  }
  const achievements = await checkAchievements(updated);
  const achXp = achievements.reduce((s, a) => s + a.xp, 0);
  if (achXp) {
    updated = await prisma.user.update({ where: { id: user.id }, data: { xp: { increment: achXp } } });
    await prisma.dailyActivity.update({ where: { id: daily.id }, data: { xp: { increment: achXp } } });
  }
  const after = levelFromXp(updated.xp);
  if (after.level > before.level) await logActivity(user.id, 'level', `Niveau ${after.level} atteint !`);
  const dailyXp = daily.xp + bonus + achXp;
  return {
    xp: opts.xp + bonus + achXp,
    totalXp: updated.xp,
    level: after.level,
    levelUp: after.level > before.level,
    streak,
    streakIncreased,
    dailyXp,
    dailyGoal: user.dailyGoalXp,
    dailyGoalReached: dailyXp >= user.dailyGoalXp && dailyXp - opts.xp - bonus - achXp < user.dailyGoalXp,
    achievements,
    challenges,
  };
}

/* ------------------------------------------------------------------ */
/* Succès                                                              */
/* ------------------------------------------------------------------ */

async function metricValue(user: User, cond: { type: string; threshold: number; language?: string; concept?: string }): Promise<number> {
  const lang = cond.language ? { language: cond.language } : {};
  switch (cond.type) {
    case 'exercises_solved':
      return prisma.exerciseProgress.count({ where: { userId: user.id, solved: true, exercise: { kind: { in: ['practice', 'miniproject', 'project'] } }, ...lang } });
    case 'xp_total':
      return user.xp;
    case 'streak':
      return user.streak;
    case 'chapters_completed':
      return prisma.chapterProgress.count({
        where: { userId: user.id, completedAt: { not: null }, skipped: false, ...(cond.language ? { chapter: { languageId: cond.language } } : {}) },
      });
    case 'code_success':
      return prisma.attempt.count({ where: { userId: user.id, correct: true, exercise: { type: { in: ['code', 'bugfix'] } }, ...lang } });
    case 'ide_runs':
      return prisma.activityLog.count({ where: { userId: user.id, type: 'ide_run_ok' } });
    case 'concept_solved':
      return prisma.exerciseProgress.count({
        where: { userId: user.id, solved: true, exercise: { concepts: { has: cond.concept ?? '' }, type: { in: ['code', 'bugfix', 'fill'] } } },
      });
    case 'projects_completed':
      return prisma.projectProgress.count({ where: { userId: user.id, completedAt: { not: null } } });
    case 'reviews_done':
      return prisma.attempt.count({ where: { userId: user.id, mode: 'review', correct: true } });
    case 'placement_done':
      return user.onboardingDone ? 1 : 0;
    case 'perfect_exam':
      return prisma.chapterProgress.count({ where: { userId: user.id, examScore: 100 } });
    case 'languages_started': {
      const rows = await prisma.exerciseProgress.findMany({ where: { userId: user.id, solved: true }, distinct: ['language'], select: { language: true } });
      return rows.length;
    }
    case 'chapter_mastered': {
      const done = await prisma.chapterProgress.findMany({ where: { userId: user.id, completedAt: { not: null }, skipped: false }, select: { chapterId: true } });
      let mastered = 0;
      for (const d of done) {
        const total = await prisma.exercise.count({ where: { chapterId: d.chapterId, kind: { in: ['practice', 'miniproject'] } } });
        const solved = await prisma.exerciseProgress.count({
          where: { userId: user.id, solved: true, exercise: { chapterId: d.chapterId, kind: { in: ['practice', 'miniproject'] } } },
        });
        if (total > 0 && solved >= total) mastered++;
      }
      return mastered;
    }
    default:
      return 0;
  }
}

export async function achievementProgress(user: User) {
  const all = await prisma.achievement.findMany({ orderBy: { order: 'asc' } });
  const unlocked = await prisma.userAchievement.findMany({ where: { userId: user.id } });
  const map = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt]));
  const out = [];
  for (const a of all) {
    const cond = a.condition as { type: string; threshold: number; language?: string; concept?: string };
    const value = map.has(a.id) ? cond.threshold : await metricValue(user, cond);
    out.push({
      id: a.id,
      title: a.hidden && !map.has(a.id) ? '???' : a.title,
      description: a.hidden && !map.has(a.id) ? 'Succès secret' : a.description,
      icon: a.icon,
      xp: a.xp,
      unlockedAt: map.get(a.id) ?? null,
      progress: Math.min(value, cond.threshold),
      threshold: cond.threshold,
    });
  }
  return out;
}

export async function checkAchievements(user: User) {
  const all = await prisma.achievement.findMany();
  const have = new Set((await prisma.userAchievement.findMany({ where: { userId: user.id }, select: { achievementId: true } })).map((a) => a.achievementId));
  const newly: Rewards['achievements'] = [];
  for (const a of all) {
    if (have.has(a.id)) continue;
    const cond = a.condition as { type: string; threshold: number; language?: string; concept?: string };
    if ((await metricValue(user, cond)) >= cond.threshold) {
      const created = await prisma.userAchievement.create({ data: { userId: user.id, achievementId: a.id } }).catch(() => null);
      if (created) {
        newly.push({ id: a.id, title: a.title, description: a.description, icon: a.icon, xp: a.xp });
        await logActivity(user.id, 'achievement', `Succès débloqué : ${a.title}`, { id: a.id });
      }
    }
  }
  return newly;
}
