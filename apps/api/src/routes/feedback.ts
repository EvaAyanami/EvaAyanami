import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAdmin, requireUser } from '../lib/auth.js';
import { notFound } from '../lib/http.js';
import { parse } from './auth.js';

const KINDS = ['bug', 'idea', 'improvement', 'content', 'other'] as const;
const STATUSES = ['new', 'planned', 'in_progress', 'done', 'rejected'] as const;

export default async function feedbackRoutes(app: FastifyInstance) {
  /** Liste publique (pour voter sur les idées des autres). */
  app.get<{ Querystring: { sort?: string; kind?: string } }>('/feedback', async (req) => {
    const me = requireUser(req);
    const rows = await prisma.feedback.findMany({
      where: { ...(req.query.kind && (KINDS as readonly string[]).includes(req.query.kind) ? { kind: req.query.kind } : {}), status: { not: 'rejected' } },
      orderBy: req.query.sort === 'new' ? { createdAt: 'desc' } : [{ votes: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: { user: { select: { username: true, discriminator: true, displayName: true } }, voters: { where: { userId: me.id }, select: { id: true } } },
    });
    return rows.map((f) => ({
      id: f.id, kind: f.kind, title: f.title, body: f.body, status: f.status, votes: f.votes, adminReply: f.adminReply, createdAt: f.createdAt,
      author: f.user ? f.user.displayName : 'Anonyme', mine: f.userId === me.id, voted: f.voters.length > 0,
    }));
  });

  app.post('/feedback', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const me = requireUser(req);
    const b = parse(z.object({ kind: z.enum(KINDS), title: z.string().trim().min(4, 'Titre trop court').max(120), body: z.string().trim().min(10, 'Décris un peu plus ton idée (10 caractères minimum)').max(4000), page: z.string().max(200).optional() }), req.body);
    const f = await prisma.feedback.create({ data: { ...b, userId: me.id, votes: 1, voters: { create: { userId: me.id } } } });
    return { ok: true, id: f.id };
  });

  app.post<{ Params: { id: string } }>('/feedback/:id/vote', async (req) => {
    const me = requireUser(req);
    const f = await prisma.feedback.findUnique({ where: { id: req.params.id } });
    if (!f) throw notFound('Avis');
    const existing = await prisma.feedbackVote.findUnique({ where: { feedbackId_userId: { feedbackId: f.id, userId: me.id } } });
    if (existing) {
      await prisma.$transaction([prisma.feedbackVote.delete({ where: { id: existing.id } }), prisma.feedback.update({ where: { id: f.id }, data: { votes: { decrement: 1 } } })]);
      return { voted: false, votes: f.votes - 1 };
    }
    await prisma.$transaction([prisma.feedbackVote.create({ data: { feedbackId: f.id, userId: me.id } }), prisma.feedback.update({ where: { id: f.id }, data: { votes: { increment: 1 } } })]);
    return { voted: true, votes: f.votes + 1 };
  });

  /* ---------- Administration ---------- */
  app.get<{ Querystring: { status?: string } }>('/admin/feedback', async (req) => {
    requireAdmin(req);
    return prisma.feedback.findMany({
      where: req.query.status ? { status: req.query.status } : {},
      orderBy: [{ createdAt: 'desc' }],
      take: 300,
      include: { user: { select: { username: true, discriminator: true, email: true } } },
    });
  });

  app.patch<{ Params: { id: string } }>('/admin/feedback/:id', async (req) => {
    requireAdmin(req);
    const b = parse(z.object({ status: z.enum(STATUSES).optional(), adminReply: z.string().max(2000).nullable().optional() }), req.body);
    await prisma.feedback.update({ where: { id: req.params.id }, data: b });
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/admin/feedback/:id', async (req) => {
    requireAdmin(req);
    await prisma.feedback.delete({ where: { id: req.params.id } });
    return { ok: true };
  });
}
