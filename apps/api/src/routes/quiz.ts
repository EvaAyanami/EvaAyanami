import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { QuizDuel, User } from '@prisma/client';
import { prisma } from '../db.js';
import { requireUser } from '../lib/auth.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { reward } from '../lib/gamification.js';
import { utcDay } from '../lib/flames.js';
import { effectiveAvatar } from '../lib/avatar.js';
import { hasPremium } from '../lib/plan.js';
import { QUESTIONS_PER_DUEL, SECONDS_PER_QUESTION, answerScore, pickQuestions, quizBank, shuffledChoices } from '../lib/quiz.js';
import { parse } from './auth.js';

const THEMES = ['mix', 'code', 'hardware', 'blind'] as const;
const MAX_REWARDED_PER_DAY = 5;
const XP = { win: 20, draw: 10, lose: 5 };

type StoredAnswer = { choice: number | null; ms: number; correct: boolean; points: number };

const mini = (u: Pick<User, 'id' | 'displayName' | 'username' | 'discriminator' | 'avatar' | 'premiumUntil'> | null) =>
  u ? { id: u.id, displayName: u.displayName, tag: `${u.username}#${u.discriminator}`, avatar: effectiveAvatar(u.avatar, hasPremium(u as User)) } : null;

const userSel = { id: true, displayName: true, username: true, discriminator: true, avatar: true, premiumUntil: true } as const;

async function areFriends(a: string, b: string) {
  return !!(await prisma.friendship.findFirst({ where: { status: 'ACCEPTED', OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] } }));
}

function role(d: QuizDuel, userId: string): 'creator' | 'opponent' | null {
  return d.creatorId === userId ? 'creator' : d.opponentId === userId ? 'opponent' : null;
}

export default async function quizRoutes(app: FastifyInstance) {
  app.get('/quiz/info', async () => {
    const bank = await quizBank();
    return {
      perDuel: QUESTIONS_PER_DUEL,
      secondsPerQuestion: SECONDS_PER_QUESTION,
      themes: THEMES.map((t) => ({ id: t, count: t === 'mix' ? bank.length : bank.filter((q) => q.theme === t).length })),
      xp: XP,
      maxRewardedPerDay: MAX_REWARDED_PER_DAY,
    };
  });

  app.get('/quiz/duels', async (req) => {
    const me = requireUser(req);
    const rows = await prisma.quizDuel.findMany({
      where: { OR: [{ creatorId: me.id }, { opponentId: me.id }], status: { not: 'declined' } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { creator: { select: userSel }, opponent: { select: userSel } },
    });
    return rows.map((d) => {
      const r = role(d, me.id)!;
      const myScore = r === 'creator' ? d.creatorScore : d.opponentScore;
      const theirScore = r === 'creator' ? d.opponentScore : d.creatorScore;
      return {
        id: d.id,
        theme: d.theme,
        status: d.status,
        solo: !d.opponentId,
        createdAt: d.createdAt,
        me: r,
        opponent: mini(r === 'creator' ? d.opponent : d.creator),
        myTurn: myScore === null && d.status !== 'finished',
        myScore,
        theirScore: d.status === 'finished' ? theirScore : theirScore !== null ? 'hidden' : null,
        result: d.status === 'finished' && d.opponentId ? (myScore! > theirScore! ? 'win' : myScore! < theirScore! ? 'lose' : 'draw') : null,
      };
    });
  });

  app.post('/quiz/duels', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
    const me = requireUser(req);
    const b = parse(z.object({ theme: z.enum(THEMES).default('mix'), opponentId: z.string().nullish() }), req.body);
    if (b.opponentId) {
      if (b.opponentId === me.id) throw badRequest('Choisis un ami');
      if (!(await areFriends(me.id, b.opponentId))) throw forbidden('Tu ne peux défier que tes amis');
    }
    const questions = pickQuestions(await quizBank(), b.theme);
    const d = await prisma.quizDuel.create({ data: { creatorId: me.id, opponentId: b.opponentId ?? null, theme: b.theme, questions: questions.map((q) => q.id) } });
    return { id: d.id };
  });

  /** État d'un duel ; si c'est mon tour, les questions (sans les réponses). */
  app.get<{ Params: { id: string } }>('/quiz/duels/:id', async (req) => {
    const me = requireUser(req);
    const d = await prisma.quizDuel.findUnique({ where: { id: req.params.id }, include: { creator: { select: userSel }, opponent: { select: userSel } } });
    if (!d) throw notFound('Partie');
    const r = role(d, me.id);
    if (!r) throw forbidden();
    const bank = await quizBank();
    const byId = new Map(bank.map((q) => [q.id, q]));
    const mine = (r === 'creator' ? d.creatorAnswers : d.opponentAnswers) as StoredAnswer[] | null;
    const theirs = (r === 'creator' ? d.opponentAnswers : d.creatorAnswers) as StoredAnswer[] | null;
    const finished = d.status === 'finished';
    const questions = d.questions.map((qid, i) => {
      const q = byId.get(qid)!;
      const order = shuffledChoices(q, d.id);
      const base = { id: q.id, theme: q.theme, q: q.q, code: q.code ?? null, choices: order.map((k) => q.choices[k]) };
      if (!mine) return base;
      return {
        ...base,
        answer: order.indexOf(q.answer),
        explain: q.explain,
        mine: mine[i] ? { choice: mine[i].choice === null ? null : order.indexOf(mine[i].choice!), correct: mine[i].correct, points: mine[i].points, ms: mine[i].ms } : null,
        theirs: finished && theirs?.[i] ? { choice: theirs[i].choice === null ? null : order.indexOf(theirs[i].choice!), correct: theirs[i].correct, points: theirs[i].points } : null,
      };
    });
    return {
      id: d.id,
      theme: d.theme,
      status: d.status,
      solo: !d.opponentId,
      me: r,
      played: !!mine,
      creator: mini(d.creator),
      opponent: mini(d.opponent),
      myScore: r === 'creator' ? d.creatorScore : d.opponentScore,
      theirScore: finished ? (r === 'creator' ? d.opponentScore : d.creatorScore) : null,
      secondsPerQuestion: SECONDS_PER_QUESTION,
      questions,
    };
  });

  app.post<{ Params: { id: string } }>('/quiz/duels/:id/answers', async (req) => {
    const me = requireUser(req);
    const b = parse(z.object({ answers: z.array(z.object({ choice: z.number().int().min(0).max(5).nullable(), ms: z.number().int().min(0).max(600_000) })) }), req.body);
    const d = await prisma.quizDuel.findUnique({ where: { id: req.params.id } });
    if (!d) throw notFound('Partie');
    const r = role(d, me.id);
    if (!r) throw forbidden();
    if ((r === 'creator' ? d.creatorAnswers : d.opponentAnswers) !== null) throw badRequest('Tu as déjà joué cette partie');
    if (b.answers.length !== d.questions.length) throw badRequest('Réponds à toutes les questions');
    const bank = new Map((await quizBank()).map((q) => [q.id, q]));
    const stored: StoredAnswer[] = d.questions.map((qid, i) => {
      const q = bank.get(qid)!;
      const order = shuffledChoices(q, d.id);
      const a = b.answers[i];
      const original = a.choice === null ? null : order[a.choice] ?? null;
      const ms = Math.max(300, Math.min(a.ms, SECONDS_PER_QUESTION * 1000));
      const correct = original === q.answer;
      return { choice: original, ms, correct, points: answerScore(correct, a.choice === null ? SECONDS_PER_QUESTION * 1000 : ms) };
    });
    const score = stored.reduce((s, x) => s + x.points, 0);
    const time = stored.reduce((s, x) => s + x.ms, 0);
    const otherDone = (r === 'creator' ? d.opponentScore : d.creatorScore) !== null;
    const finished = !d.opponentId || otherDone;
    const updated = await prisma.quizDuel.update({
      where: { id: d.id },
      data: {
        ...(r === 'creator' ? { creatorAnswers: stored, creatorScore: score, creatorTimeMs: time } : { opponentAnswers: stored, opponentScore: score, opponentTimeMs: time }),
        status: finished ? 'finished' : 'waiting',
        ...(finished ? { finishedAt: new Date() } : {}),
      },
    });

    // Récompenses (duels entre amis uniquement, limitées par jour)
    let rewards;
    if (finished && d.opponentId) {
      const a = updated.creatorScore!;
      const o = updated.opponentScore!;
      const since = new Date(`${utcDay()}T00:00:00Z`);
      for (const uid of [updated.creatorId, updated.opponentId!]) {
        const count = await prisma.activityLog.count({ where: { userId: uid, type: 'duel', createdAt: { gte: since } } });
        const mine = uid === updated.creatorId ? a : o;
        const theirs = uid === updated.creatorId ? o : a;
        const outcome = mine > theirs ? 'win' : mine < theirs ? 'lose' : 'draw';
        await prisma.activityLog.create({ data: { userId: uid, type: 'duel', message: `Blind test : ${outcome === 'win' ? 'victoire' : outcome === 'lose' ? 'défaite' : 'égalité'} (${mine} - ${theirs})`, meta: { duelId: d.id } } });
        if (count < MAX_REWARDED_PER_DAY) {
          const u = await prisma.user.findUniqueOrThrow({ where: { id: uid } });
          const rw = await reward(u, { xp: XP[outcome] });
          if (uid === me.id) rewards = rw;
        }
      }
    }
    return { score, finished, rewards };
  });

  app.post<{ Params: { id: string } }>('/quiz/duels/:id/decline', async (req) => {
    const me = requireUser(req);
    const d = await prisma.quizDuel.findUnique({ where: { id: req.params.id } });
    if (!d || d.opponentId !== me.id || d.opponentScore !== null) throw notFound('Défi');
    await prisma.quizDuel.update({ where: { id: d.id }, data: { status: 'declined' } });
    return { ok: true };
  });
}
