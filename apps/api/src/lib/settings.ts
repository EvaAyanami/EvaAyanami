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
  // Abonnement Premium et limites de l'offre gratuite
  premiumEnabled: true,
  freeMaxEnergy: 5,
  energyRegenMinutes: 30,
  freeDailyRuns: 40,
  adsEnabled: true,
  adMaxPerDay: 6,
  adMinSeconds: 15,
  adRewardEnergy: 1,
  adRewardRuns: 10,
  bannerAds: true,
  /** Essai Premium offert à l'inscription (0 = aucun). */
  trialDays: 7,
  /** Bonus d'XP du « meilleur codeur de la semaine ». */
  bestCoderXp: 150,
  /** Les exercices d'écriture de code ne coûtent jamais d'énergie (on apprend en itérant). */
  codeCostsEnergy: false,
  reviewRefillsEnergy: true,
  aiPremiumOnly: true,
  premiumPriceLabel: '4,99 € / mois',
  /** Boutique : clés Premium (prix en centimes d'euro). */
  shopOffers: [
    { id: 'm1', months: 1, days: 30, priceCents: 499, label: '1 mois' },
    { id: 'm2', months: 2, days: 60, priceCents: 998, label: '2 mois' },
    { id: 'm3', months: 3, days: 90, priceCents: 1250, label: '3 mois', best: true },
  ],
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
