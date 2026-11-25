/**
 * Offre gratuite / Premium.
 *
 * Offre gratuite (comme Duolingo) :
 *  - une réserve d'énergie (5 par défaut) : chaque réponse fausse en pratique ou chaque
 *    examen raté en coûte 1 ; elle se recharge avec le temps, en regardant une publicité
 *    ou en faisant des révisions ;
 *  - un quota quotidien d'exécutions de code libres (bouton « Exécuter », IDE) ;
 *  - l'assistant IA peut être réservé aux abonnés.
 * Premium : tout est illimité, sans publicité.
 * Les administrateurs ne sont jamais limités. L'administration peut désactiver le système.
 */
import type { User } from '@prisma/client';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { HttpError } from './http.js';
import { localDate } from './levels.js';
import { getSettings, type Settings } from './settings.js';

/** Paiement en ligne possible (boutique de clés). */
export const paymentsConfigured = () => !!config.stripe.secretKey;
/** Abonnement mensuel récurrent possible (nécessite en plus un tarif Stripe). */
export const stripeConfigured = () => !!(config.stripe.secretKey && config.stripe.priceId);

export function hasPremium(user: User, now = new Date()) {
  return !!user.premiumUntil && user.premiumUntil > now;
}

/** Vrai si l'utilisateur n'a aucune limite (Premium, administrateur, ou système désactivé). */
export function unlimited(user: User, s: Settings) {
  return !s.premiumEnabled || user.role === 'ADMIN' || hasPremium(user);
}

/** Recharge l'énergie écoulée et remet à zéro les compteurs quotidiens ; enregistre si besoin. */
export async function refreshUsage(user: User, s?: Settings): Promise<User> {
  const settings = s ?? (await getSettings());
  const now = Date.now();
  const max = Math.max(1, settings.freeMaxEnergy);
  const regenMs = Math.max(1, settings.energyRegenMinutes) * 60_000;
  const data: { energy?: number; energyAt?: Date; quotaDate?: string; runsUsed?: number; adsWatched?: number } = {};

  let energy = Math.min(user.energy, max);
  let energyAt = user.energyAt.getTime();
  if (energy < max) {
    const gained = Math.floor((now - energyAt) / regenMs);
    if (gained > 0) {
      energy = Math.min(max, energy + gained);
      energyAt = energy >= max ? now : energyAt + gained * regenMs;
    }
  } else energyAt = now;
  if (energy !== user.energy) data.energy = energy;
  if (energy !== user.energy || (energy < max && energyAt !== user.energyAt.getTime())) data.energyAt = new Date(energyAt);

  const today = localDate(user.timezone);
  if (user.quotaDate !== today) Object.assign(data, { quotaDate: today, runsUsed: 0, adsWatched: 0 });

  if (!Object.keys(data).length) return user;
  return prisma.user.update({ where: { id: user.id }, data });
}

export async function planStatus(input: User) {
  const s = await getSettings();
  const user = await refreshUsage(input, s);
  const free = !unlimited(user, s);
  const max = s.freeMaxEnergy;
  const regenMs = s.energyRegenMinutes * 60_000;
  return {
    enabled: s.premiumEnabled,
    premium: hasPremium(user),
    premiumUntil: user.premiumUntil,
    premiumSource: user.premiumSource,
    unlimited: !free,
    reason: !s.premiumEnabled ? 'disabled' : user.role === 'ADMIN' ? 'admin' : hasPremium(user) ? 'premium' : 'free',
    energy: free ? user.energy : max,
    maxEnergy: max,
    nextEnergyAt: free && user.energy < max ? new Date(user.energyAt.getTime() + regenMs) : null,
    fullEnergyAt: free && user.energy < max ? new Date(user.energyAt.getTime() + regenMs * (max - user.energy)) : null,
    regenMinutes: s.energyRegenMinutes,
    runsUsed: user.runsUsed,
    runsMax: free ? s.freeDailyRuns : null,
    adsEnabled: free && s.adsEnabled,
    adsLeft: free && s.adsEnabled ? Math.max(0, s.adMaxPerDay - user.adsWatched) : 0,
    adRewardEnergy: s.adRewardEnergy,
    adRewardRuns: s.adRewardRuns,
    reviewRefillsEnergy: s.reviewRefillsEnergy,
    codeCostsEnergy: s.codeCostsEnergy,
    trial: user.premiumSource === 'trial' && hasPremium(user),
    aiAllowed: !free || !s.aiPremiumOnly,
    priceLabel: s.premiumPriceLabel,
    stripe: stripeConfigured(),
    payments: paymentsConfigured(),
    streakProtection: hasPremium(user),
    ads: { provider: config.ads.provider, client: config.ads.adsenseClient || null, slotReward: config.ads.adsenseSlotReward || null, slotBanner: free && s.bannerAds ? config.ads.adsenseSlotBanner || null : null },
    canManageBilling: stripeConfigured() && !!user.stripeCustomerId,
  };
}
export type PlanStatus = Awaited<ReturnType<typeof planStatus>>;

export class LimitError extends HttpError {
  constructor(code: 'NO_ENERGY' | 'RUN_QUOTA' | 'PREMIUM_ONLY', message: string) {
    super(402, message, { code });
  }
}

/** Refuse l'action si un compte gratuit n'a plus d'énergie. */
export async function requireEnergy(user: User) {
  const s = await getSettings();
  if (unlimited(user, s)) return;
  const u = await refreshUsage(user, s);
  if (u.energy <= 0)
    throw new LimitError('NO_ENERGY', "Plus d'énergie ! Attends qu'elle se recharge, regarde une courte publicité, fais une révision… ou passe à Premium.");
}

/** Retire 1 point d'énergie (réponse fausse). Sans effet pour un compte illimité. */
export async function spendEnergy(user: User) {
  const s = await getSettings();
  if (unlimited(user, s)) return;
  const u = await refreshUsage(user, s);
  if (u.energy <= 0) return;
  await prisma.user.update({
    where: { id: u.id },
    // La recharge démarre à partir du moment où la réserve n'est plus pleine.
    data: { energy: { decrement: 1 }, ...(u.energy >= s.freeMaxEnergy ? { energyAt: new Date() } : {}) },
  });
}

export async function gainEnergy(user: User, n: number) {
  const s = await getSettings();
  if (unlimited(user, s) || n <= 0) return;
  const u = await refreshUsage(user, s);
  const energy = Math.min(s.freeMaxEnergy, u.energy + n);
  if (energy !== u.energy) await prisma.user.update({ where: { id: u.id }, data: { energy, ...(energy >= s.freeMaxEnergy ? { energyAt: new Date() } : {}) } });
}

/** Décompte une exécution libre du quota quotidien. */
export async function consumeRun(user: User) {
  const s = await getSettings();
  if (unlimited(user, s)) return;
  const u = await refreshUsage(user, s);
  if (u.runsUsed >= s.freeDailyRuns)
    throw new LimitError('RUN_QUOTA', `Tu as utilisé tes ${s.freeDailyRuns} exécutions gratuites du jour. Regarde une courte publicité pour en débloquer d'autres, ou passe à Premium.`);
  await prisma.user.update({ where: { id: u.id }, data: { runsUsed: { increment: 1 } } });
}

/** L'IA est-elle accessible à ce compte ? (sinon l'assistante répond sans IA) */
export async function aiAllowed(user: User) {
  const s = await getSettings();
  return unlimited(user, s) || !s.aiPremiumOnly;
}

export async function requireAi(user: User) {
  const s = await getSettings();
  if (unlimited(user, s) || !s.aiPremiumOnly) return;
  throw new LimitError('PREMIUM_ONLY', "L'assistante IA est réservée aux abonnés Premium. Les indices et explications d'erreurs restent gratuits !");
}

export const SOURCE_LABEL: Record<string, string> = { trial: 'Essai gratuit', stripe: 'Abonnement', code: "Code d'activation", admin: "Offert par l'administration" };

/**
 * Fixe la fin du Premium à `until` et inscrit la période ajoutée dans l'historique.
 * Si `until` est antérieur à la fin actuelle, le Premium est raccourci (résiliation).
 */
export async function setPremiumUntil(userId: string, until: Date, source: string, note?: string, extra: Record<string, unknown> = {}) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const now = Date.now();
  const from = Math.max(now, u.premiumUntil?.getTime() ?? 0);
  if (until.getTime() > from) {
    await prisma.premiumPeriod.create({
      data: { userId, source, note, startsAt: new Date(from), endsAt: until, days: Math.max(1, Math.round((until.getTime() - from) / 86400_000)) },
    });
  } else if (until.getTime() < (u.premiumUntil?.getTime() ?? 0)) {
    // Raccourcissement : on tronque les périodes qui dépassent la nouvelle fin.
    await prisma.premiumPeriod.updateMany({ where: { userId, endsAt: { gt: until } }, data: { endsAt: until } });
  }
  return prisma.user.update({ where: { id: userId }, data: { premiumUntil: until, premiumSource: source, ...extra } });
}

/** Prolonge le Premium de `days` jours (à partir de la fin actuelle s'il est encore actif). */
export async function extendPremium(userId: string, days: number, source: string, note?: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const base = hasPremium(u) ? u.premiumUntil!.getTime() : Date.now();
  return setPremiumUntil(userId, new Date(base + days * 86400_000), source, note);
}

/** Badge et historique Premium (affichés sur le profil et aux amis). */
export async function premiumHistory(userId: string) {
  const periods = await prisma.premiumPeriod.findMany({ where: { userId }, orderBy: { startsAt: 'desc' } });
  const now = Date.now();
  const totalDays = Math.round(periods.reduce((a, p) => a + Math.max(0, Math.min(now, p.endsAt.getTime()) - p.startsAt.getTime()), 0) / 86400_000);
  return {
    periods: periods.map((p) => ({ id: p.id, source: p.source, sourceLabel: SOURCE_LABEL[p.source] ?? p.source, startsAt: p.startsAt, endsAt: p.endsAt, days: p.days, note: p.note, current: p.startsAt.getTime() <= now && p.endsAt.getTime() > now })),
    totalDays,
    since: periods.length ? periods[periods.length - 1].startsAt : null,
  };
}

/** Badge public : « premium » (actif), « ancien » (a déjà été Premium) ou rien. */
export function premiumBadge(u: Pick<User, 'premiumUntil'>, hadPremium: boolean): 'premium' | 'former' | null {
  if (u.premiumUntil && u.premiumUntil > new Date()) return 'premium';
  return hadPremium || u.premiumUntil ? 'former' : null;
}
