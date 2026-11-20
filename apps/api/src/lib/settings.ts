import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

/** Paramètres pédagogiques modifiables depuis l'administration. */
export const DEFAULT_SETTINGS = {
  examPassScore: 70,
  xpRetryFactor: 0.7,
  xpSolutionFactor: 0.4,
  xpReview: 5,
  xpExamPassed: 50,
  xpChapterCompleted: 100,
  xpProjectCompleted: 150,
  defaultDailyGoal: 50,
  placementQuestionsPerLanguage: 8,
  reviewSessionSize: 12,
  solutionMinAttempts: 2,
  leaderboardEnabled: true,
  aiEnabled: true,
  weeklyChallenges: [
    { metric: 'xp', title: 'Gagner {n} XP cette semaine', target: 300, xpReward: 60 },
    { metric: 'exercises', title: 'Réussir {n} exercices', target: 25, xpReward: 50 },
    { metric: 'reviews', title: 'Faire {n} révisions', target: 15, xpReward: 40 },
    { metric: 'chapters', title: 'Terminer {n} chapitre(s)', target: 1, xpReward: 80 },
    { metric: 'code', title: 'Faire compiler {n} programmes réussis', target: 10, xpReward: 50 },
  ],
};
export type Settings = typeof DEFAULT_SETTINGS;

let cache: { at: number; value: Settings } | null = null;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const row = await prisma.setting.findUnique({ where: { key: 'pedagogy' } });
  const value = { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
  cache = { at: Date.now(), value };
  return value;
}

export async function saveSettings(patch: Partial<Settings>) {
  const value = { ...(await getSettings()), ...patch };
  await prisma.setting.upsert({
    where: { key: 'pedagogy' },
    create: { key: 'pedagogy', value: value as unknown as Prisma.InputJsonValue },
    update: { value: value as unknown as Prisma.InputJsonValue },
  });
  cache = null;
  return value;
}
