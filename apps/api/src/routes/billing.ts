import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { requireUser } from '../lib/auth.js';
import { HttpError, badRequest, notFound } from '../lib/http.js';
import { getSettings } from '../lib/settings.js';
import { extendPremium, gainEnergy, paymentsConfigured, planStatus, premiumHistory, refreshUsage, stripeConfigured, unlimited } from '../lib/plan.js';
import { fulfillPurchase, handleStripeEvent, stripe, verifyStripeSignature } from '../lib/stripe.js';
import type { User } from '@prisma/client';
import { parse } from './auth.js';

/** Annonces maison utilisées tant que l'administration n'en a créé aucune. */
export const BUILTIN_ADS = [
  { key: 'premium', title: 'Codemori Premium', body: "Énergie illimitée, exécutions illimitées, aucune publicité et l'assistante IA de Kiri. Soutiens le projet !", linkUrl: '/abonnement', linkLabel: 'Découvrir Premium' },
  { key: 'revisions', title: 'Astuce de Kiri', body: 'Une révision réussie te rend de l’énergie. Les notions ratées reviennent au bon moment : c’est comme ça qu’on retient pour de bon !', linkUrl: '/revisions', linkLabel: 'Faire une révision' },
  { key: 'projets', title: 'Passe à la pratique', body: '22 projets guidés t’attendent : serveur HTTP, moteur SQL, mini-Redis… dans le langage de ton choix.', linkUrl: '/projets', linkLabel: 'Voir les projets' },
  { key: 'amis', title: 'Apprendre à plusieurs', body: 'Ajoute tes amis avec leur pseudo#1234 et comparez vos séries et votre XP de la semaine.', linkUrl: '/amis', linkLabel: 'Ajouter des amis' },
];

function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((a, i) => a + Math.max(1, i.weight), 0);
  let r = Math.random() * total;
  for (const i of items) {
    r -= Math.max(1, i.weight);
    if (r <= 0) return i;
  }
  return items[items.length - 1];
}

export default async function billingRoutes(app: FastifyInstance) {
  app.get('/plan', async (req) => planStatus(requireUser(req)));

  app.get('/me/premium', async (req) => {
    const u = requireUser(req);
    return { status: await planStatus(u), history: await premiumHistory(u.id) };
  });

  /* ---------- Clés d'activation ---------- */
  async function redeem(u: User, raw: string) {
    const code = raw.trim().toUpperCase();
    const pc = await prisma.premiumCode.findUnique({ where: { code } });
    if (!pc || (pc.expiresAt && pc.expiresAt < new Date())) throw badRequest('Code invalide ou expiré');
    if (pc.uses >= pc.maxUses) throw badRequest('Ce code a déjà été utilisé');
    if (await prisma.premiumRedemption.findUnique({ where: { codeId_userId: { codeId: pc.id, userId: u.id } } })) throw badRequest('Tu as déjà utilisé ce code');
    // Incrément conditionnel : protège contre deux utilisations simultanées du dernier exemplaire.
    const r = await prisma.premiumCode.updateMany({ where: { id: pc.id, uses: { lt: pc.maxUses } }, data: { uses: { increment: 1 } } });
    if (!r.count) throw badRequest('Ce code a déjà été utilisé');
    await prisma.premiumRedemption.create({ data: { codeId: pc.id, userId: u.id } });
    const fresh = await extendPremium(u.id, pc.days, 'code', pc.note ?? undefined);
    return { ok: true, days: pc.days, premiumUntil: fresh.premiumUntil, plan: await planStatus(fresh) };
  }

  app.post('/premium/redeem', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const body = parse(z.object({ code: z.string().min(4).max(64) }), req.body);
    return redeem(requireUser(req), body.code);
  });

  /* ---------- Boutique de clés Premium ---------- */
  app.get('/shop', async (req) => {
    const u = requireUser(req);
    const s = await getSettings();
    const base = s.shopOffers.find((o) => o.months === 1)?.priceCents ?? 499;
    const keys = await prisma.premiumCode.findMany({ where: { buyerId: u.id }, orderBy: { createdAt: 'desc' }, include: { redemptions: { include: { user: { select: { username: true, discriminator: true } } } } } });
    return {
      payments: paymentsConfigured(),
      offers: s.shopOffers.map((o) => ({ ...o, perMonthCents: Math.round(o.priceCents / o.months), savingPercent: Math.max(0, Math.round((1 - o.priceCents / (base * o.months)) * 100)) })),
      keys: keys.map((k) => ({
        id: k.id, code: k.code, days: k.days, offer: k.offer, amountCents: k.amountCents, createdAt: k.createdAt,
        usedBy: k.redemptions.map((r) => `${r.user.username}#${r.user.discriminator}`)[0] ?? null,
      })),
    };
  });

  app.post('/shop/checkout', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const u = requireUser(req);
    const body = parse(z.object({ offer: z.string().max(20) }), req.body);
    if (!paymentsConfigured()) throw new HttpError(404, "Le paiement en ligne n'est pas encore configuré sur ce serveur. Demande une clé à l'administrateur.");
    const offer = (await getSettings()).shopOffers.find((o) => o.id === body.offer);
    if (!offer) throw badRequest('Offre inconnue');
    const base = config.publicUrl.replace(/\/$/, '');
    const session = await stripe<{ url: string }>('/checkout/sessions', {
      mode: 'payment',
      line_items: { 0: { quantity: 1, price_data: { currency: 'eur', unit_amount: offer.priceCents, product_data: { name: `Clé ${config.appName} Premium — ${offer.label}`, description: `${offer.days} jours de Premium, à activer ou à offrir` } } } },
      client_reference_id: u.id,
      metadata: { offer: offer.id, days: offer.days },
      ...(u.stripeCustomerId ? { customer: u.stripeCustomerId } : { customer_email: u.email }),
      success_url: `${base}/boutique?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/boutique?paiement=annule`,
      locale: 'fr',
    });
    return { url: session.url };
  });

  /** Retour de paiement : génère la clé tout de suite, sans attendre le webhook. */
  app.post('/shop/confirm', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req) => {
    const u = requireUser(req);
    const body = parse(z.object({ sessionId: z.string().regex(/^cs_[A-Za-z0-9_]+$/) }), req.body);
    if (!paymentsConfigured()) throw badRequest('Paiement non configuré');
    const session = await stripe<any>(`/checkout/sessions/${body.sessionId}`);
    if (session.client_reference_id !== u.id) throw notFound('Paiement');
    if (session.payment_status !== 'paid') return { paid: false };
    const key = await fulfillPurchase(session);
    return { paid: true, key: key ? { id: key.id, code: key.code, days: key.days } : null };
  });

  app.post<{ Params: { id: string } }>('/shop/keys/:id/redeem', async (req) => {
    const u = requireUser(req);
    const key = await prisma.premiumCode.findUnique({ where: { id: req.params.id } });
    if (!key || key.buyerId !== u.id) throw notFound('Clé');
    return redeem(u, key.code);
  });

  /* ---------- Paiement Stripe (facultatif) ---------- */
  app.post('/billing/checkout', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const u = requireUser(req);
    if (!stripeConfigured()) throw new HttpError(404, "Le paiement en ligne n'est pas configuré sur ce serveur. Demande un code d'activation à l'administrateur.");
    const base = config.publicUrl.replace(/\/$/, '');
    const session = await stripe<{ url: string }>('/checkout/sessions', {
      mode: 'subscription',
      line_items: { 0: { price: config.stripe.priceId, quantity: 1 } },
      client_reference_id: u.id,
      ...(u.stripeCustomerId ? { customer: u.stripeCustomerId } : { customer_email: u.email }),
      success_url: `${base}/abonnement?paiement=ok`,
      cancel_url: `${base}/abonnement?paiement=annule`,
      allow_promotion_codes: true,
      locale: 'fr',
    });
    return { url: session.url };
  });

  app.post('/billing/portal', async (req) => {
    const u = requireUser(req);
    if (!stripeConfigured() || !u.stripeCustomerId) throw badRequest('Aucun abonnement en ligne à gérer');
    const session = await stripe<{ url: string }>('/billing_portal/sessions', { customer: u.stripeCustomerId, return_url: `${config.publicUrl.replace(/\/$/, '')}/abonnement` });
    return { url: session.url };
  });

  // Webhook Stripe : corps brut nécessaire pour vérifier la signature.
  await app.register(async (hook) => {
    hook.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    hook.post('/billing/webhook', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
      const raw = req.body as Buffer;
      if (!verifyStripeSignature(raw, req.headers['stripe-signature'] as string | undefined, config.stripe.webhookSecret)) return reply.code(400).send({ error: 'Signature invalide' });
      await handleStripeEvent(JSON.parse(raw.toString('utf8')));
      return { received: true };
    });
  });

  /* ---------- Publicités récompensées ---------- */
  app.post('/ads/start', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req) => {
    const user = requireUser(req);
    const s = await getSettings();
    if (unlimited(user, s)) throw badRequest('Tu es déjà illimité : aucune publicité nécessaire 💜');
    if (!s.adsEnabled) throw badRequest('Les publicités récompensées sont désactivées sur ce serveur');
    const u = await refreshUsage(user, s);
    if (u.adsWatched >= s.adMaxPerDay) throw new HttpError(429, `Tu as regardé tes ${s.adMaxPerDay} publicités du jour. Reviens demain, ou passe à Premium !`);
    const duration = Math.max(5, s.adMinSeconds);
    const ads = await prisma.ad.findMany({ where: { enabled: true } });
    if (config.ads.provider === 'adsense' && config.ads.adsenseClient && config.ads.adsenseSlotReward) {
      const view = await prisma.adView.create({ data: { userId: u.id, builtin: 'adsense', durationSec: duration } });
      return { ticket: view.id, durationSec: duration, kind: 'adsense', adsense: { client: config.ads.adsenseClient, slot: config.ads.adsenseSlotReward } };
    }
    if (ads.length) {
      const ad = pickWeighted(ads);
      const view = await prisma.adView.create({ data: { userId: u.id, adId: ad.id, durationSec: Math.max(duration, ad.durationSec) } });
      await prisma.ad.update({ where: { id: ad.id }, data: { views: { increment: 1 } } });
      return { ticket: view.id, durationSec: view.durationSec, kind: 'house', ad: { title: ad.title, body: ad.body, imageUrl: ad.imageUrl, linkUrl: ad.linkUrl, linkLabel: ad.linkLabel } };
    }
    const b = BUILTIN_ADS[Math.floor(Math.random() * BUILTIN_ADS.length)];
    const view = await prisma.adView.create({ data: { userId: u.id, builtin: b.key, durationSec: duration } });
    return { ticket: view.id, durationSec: duration, kind: 'house', ad: { title: b.title, body: b.body, imageUrl: null, linkUrl: b.linkUrl, linkLabel: b.linkLabel } };
  });

  app.post<{ Params: { id: string } }>('/ads/:id/claim', async (req) => {
    const user = requireUser(req);
    const s = await getSettings();
    const view = await prisma.adView.findUnique({ where: { id: req.params.id } });
    if (!view || view.userId !== user.id) throw notFound('Publicité');
    if (view.rewardedAt) throw badRequest('Récompense déjà récupérée');
    const elapsed = (Date.now() - view.startedAt.getTime()) / 1000;
    if (elapsed < view.durationSec - 1) throw badRequest(`Encore ${Math.ceil(view.durationSec - elapsed)} s avant la récompense`);
    if (elapsed > 3600) throw badRequest('Cette publicité a expiré, relance-en une autre');
    const u = await refreshUsage(user, s);
    if (u.adsWatched >= s.adMaxPerDay) throw new HttpError(429, 'Limite quotidienne de publicités atteinte');
    const r = await prisma.adView.updateMany({ where: { id: view.id, rewardedAt: null }, data: { rewardedAt: new Date() } });
    if (!r.count) throw badRequest('Récompense déjà récupérée');
    await prisma.user.update({ where: { id: u.id }, data: { adsWatched: { increment: 1 }, runsUsed: Math.max(0, u.runsUsed - s.adRewardRuns) } });
    await gainEnergy(u, s.adRewardEnergy);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    return { ok: true, energy: s.adRewardEnergy, runs: s.adRewardRuns, plan: await planStatus(fresh) };
  });

  app.post<{ Params: { id: string } }>('/ads/:id/click', async (req) => {
    const user = requireUser(req);
    const view = await prisma.adView.findUnique({ where: { id: req.params.id } });
    if (view?.userId === user.id && view.adId) await prisma.ad.update({ where: { id: view.adId }, data: { clicks: { increment: 1 } } });
    return { ok: true };
  });
}
