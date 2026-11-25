import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { requireAdmin } from '../lib/auth.js';
import { badRequest, notFound } from '../lib/http.js';
import { extendPremium, paymentsConfigured, premiumHistory, setPremiumUntil, stripeConfigured } from '../lib/plan.js';
import { parse } from './auth.js';
import { newKey } from '../lib/stripe.js';
import { applySkillLevel } from './placement.js';
import { languageIds } from '../lib/languages.js';

const adSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  imageUrl: z.string().url().max(500).nullish().or(z.literal('')),
  linkUrl: z.string().max(500).nullish(),
  linkLabel: z.string().max(60).nullish(),
  durationSec: z.number().int().min(5).max(120).default(15),
  weight: z.number().int().min(1).max(100).default(1),
  enabled: z.boolean().default(true),
});

const newCode = newKey;

export default async function adminBillingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    requireAdmin(req);
  });

  app.get('/admin/billing', async () => {
    const now = new Date();
    const dayAgo = new Date(Date.now() - 86400_000);
    const sales = await prisma.premiumCode.aggregate({ where: { purchaseRef: { not: null } }, _sum: { amountCents: true }, _count: true });
    const [premium, former, codes, adViewsDay, adRewardsDay, ads] = await Promise.all([
      prisma.user.count({ where: { premiumUntil: { gt: now } } }),
      prisma.user.count({ where: { premiumUntil: { lte: now } } }),
      prisma.premiumCode.count(),
      prisma.adView.count({ where: { startedAt: { gte: dayAgo } } }),
      prisma.adView.count({ where: { rewardedAt: { gte: dayAgo } } }),
      prisma.ad.count(),
    ]);
    return {
      premium, former, codes, adViewsDay, adRewardsDay, ads,
      sales: { count: sales._count, totalCents: sales._sum.amountCents ?? 0 },
      stripe: { configured: stripeConfigured(), payments: paymentsConfigured(), webhook: !!config.stripe.webhookSecret, webhookUrl: `${config.publicUrl.replace(/\/$/, '')}/api/billing/webhook` },
      adsProvider: config.ads.provider,
      adsense: { client: config.ads.adsenseClient || null, slotReward: !!config.ads.adsenseSlotReward, slotBanner: !!config.ads.adsenseSlotBanner },
    };
  });

  /* ---------- Codes d'activation ---------- */
  app.get('/admin/premium/codes', async () =>
    prisma.premiumCode.findMany({ orderBy: { createdAt: 'desc' }, take: 500, include: { buyer: { select: { username: true, discriminator: true } }, redemptions: { include: { user: { select: { username: true, discriminator: true } } } } } }),
  );

  app.post('/admin/premium/codes', async (req) => {
    const b = parse(
      z.object({ days: z.number().int().min(1).max(3650), maxUses: z.number().int().min(1).max(10000).default(1), count: z.number().int().min(1).max(200).default(1), note: z.string().max(200).optional(), expiresAt: z.string().datetime().optional().or(z.literal('')) }),
      req.body,
    );
    const codes = Array.from({ length: b.count }, newCode);
    await prisma.premiumCode.createMany({ data: codes.map((code) => ({ code, days: b.days, maxUses: b.maxUses, note: b.note || null, expiresAt: b.expiresAt ? new Date(b.expiresAt) : null })) });
    return { codes };
  });

  /** Export des clés inutilisées (une par ligne) : à importer comme « stock de clés » sur Sell.app, Sellix, Ko-fi… pour les vendre sur Discord. */
  app.get<{ Querystring: { note?: string } }>('/admin/premium/codes/export', async (req, reply) => {
    const rows = await prisma.premiumCode.findMany({ where: { uses: 0, buyerId: null, maxUses: 1, ...(req.query.note ? { note: req.query.note } : {}) }, orderBy: { createdAt: 'asc' } });
    reply.header('content-disposition', 'attachment; filename="cles-premium.txt"');
    return reply.type('text/plain; charset=utf-8').send(rows.map((r) => r.code).join('\n') + '\n');
  });

  app.delete<{ Params: { id: string } }>('/admin/premium/codes/:id', async (req) => {
    await prisma.premiumCode.delete({ where: { id: req.params.id } }).catch(() => {
      throw notFound('Code');
    });
    return { ok: true };
  });

  /* ---------- Premium d'un utilisateur ---------- */
  app.get<{ Params: { id: string } }>('/admin/users/:id/premium', async (req) => premiumHistory(req.params.id));

  app.post<{ Params: { id: string } }>('/admin/users/:id/premium', async (req) => {
    const b = parse(z.object({ days: z.number().int().min(1).max(3650).optional(), revoke: z.boolean().optional(), note: z.string().max(200).optional() }), req.body);
    const u = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!u) throw notFound('Utilisateur');
    if (b.revoke) await setPremiumUntil(u.id, new Date(), 'admin', b.note);
    else if (b.days) await extendPremium(u.id, b.days, 'admin', b.note);
    else throw badRequest('Indique un nombre de jours');
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/admin/users/:id/reset-2fa', async (req) => {
    const u = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!u) throw notFound('Utilisateur');
    await prisma.user.update({ where: { id: u.id }, data: { totpEnabled: false, totpSecret: null, totpLastStep: null, recoveryCodes: [] } });
    await prisma.session.deleteMany({ where: { userId: u.id } });
    return { ok: true };
  });

  /* ---------- Niveaux (réservé à l'administration, anti-triche) ---------- */
  app.get<{ Params: { id: string } }>('/admin/users/:id/skills', async (req) => prisma.skillProfile.findMany({ where: { userId: req.params.id } }));
  app.put<{ Params: { id: string; lang: string } }>('/admin/users/:id/skills/:lang', async (req) => {
    const b = parse(z.object({ level: z.number().int().min(1).max(5) }), req.body);
    if (!(await languageIds()).includes(req.params.lang)) throw badRequest('Langage inconnu');
    await applySkillLevel(req.params.id, req.params.lang, b.level, 'admin');
    return { ok: true };
  });

  /* ---------- Annonces maison ---------- */
  app.get('/admin/ads', async () => prisma.ad.findMany({ orderBy: { createdAt: 'desc' } }));
  app.post('/admin/ads', async (req) => {
    const b = parse(adSchema, req.body);
    return prisma.ad.create({ data: { ...b, imageUrl: b.imageUrl || null } });
  });
  app.put<{ Params: { id: string } }>('/admin/ads/:id', async (req) => {
    const b = parse(adSchema, req.body);
    return prisma.ad.update({ where: { id: req.params.id }, data: { ...b, imageUrl: b.imageUrl || null } });
  });
  app.delete<{ Params: { id: string } }>('/admin/ads/:id', async (req) => {
    await prisma.ad.delete({ where: { id: req.params.id } });
    return { ok: true };
  });
}
