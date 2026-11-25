import { consumeRun, gainEnergy, planStatus, requireEnergy, spendEnergy } from '../lib/plan.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Exercise, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { requireUser } from '../lib/auth.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { grade, publicExercise, fillTemplate, type Answer } from '../lib/grading.js';
import { runCode } from '../lib/runner.js';
import { explainError, parseDiagnostics } from '../lib/diagnostics.js';
import { logActivity, reward, type Rewards } from '../lib/gamification.js';
import { getSettings } from '../lib/settings.js';
import { addDays, sm2 } from '../lib/srs.js';
import { maybeCompleteChapter, touchChapter } from '../lib/progress.js';
import { glossaryFor } from '../lib/glossary.js';
import { parse } from './auth.js';

export const LANGS = ['rust', 'cpp', 'java'];

export function mergeRewards(a: Rewards, b: Rewards): Rewards {
  return {
    ...b,
    xp: a.xp + b.xp,
    levelUp: a.levelUp || b.levelUp,
    streakIncreased: a.streakIncreased || b.streakIncreased,
    dailyGoalReached: a.dailyGoalReached || b.dailyGoalReached,
    achievements: [...a.achievements, ...b.achievements],
    challenges: [...a.challenges, ...b.challenges],
  };
}

export async function scheduleReviewOnError(userId: string, exerciseId: string, language: string) {
  await prisma.reviewItem.upsert({
    where: { userId_exerciseId: { userId, exerciseId } },
    create: { userId, exerciseId, language, dueAt: addDays(new Date(), 1), interval: 1, reason: 'error' },
    update: { dueAt: addDays(new Date(), 1), interval: 1, repetitions: 0, reason: 'error' },
  });
}

function resolveLanguage(ex: Exercise, requested?: string) {
  if (ex.language) return ex.language;
  const starters = (ex.content as any).starters ?? {};
  const lang = requested && starters[requested] !== undefined ? requested : undefined;
  if (!lang) throw badRequest('Choisis un langage pour cet exercice');
  return lang;
}

const answerSchema = z.object({
  choice: z.union([z.number().int(), z.array(z.number().int())]).optional(),
  blanks: z.array(z.string().max(500)).max(30).optional(),
  order: z.array(z.number().int()).max(100).optional(),
  output: z.string().max(20000).optional(),
  line: z.number().int().optional(),
  code: z.string().max(100_000).optional(),
});

export default async function exerciseRoutes(app: FastifyInstance) {
  app.get('/exercises', async (req) => {
    const user = requireUser(req);
    const q = parse(
      z.object({
        language: z.string().optional(),
        type: z.string().optional(),
        level: z.coerce.number().int().optional(),
        status: z.enum(['all', 'solved', 'todo']).default('all'),
        search: z.string().max(100).optional(),
        page: z.coerce.number().int().min(1).default(1),
      }),
      req.query,
    );
    const where: Prisma.ExerciseWhereInput = {
      kind: { in: ['practice', 'miniproject'] },
      chapter: { published: true },
      ...(q.language ? { language: q.language } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.level ? { level: q.level } : {}),
      ...(q.search
        ? { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { prompt: { contains: q.search, mode: 'insensitive' } }, { concepts: { has: q.search.toLowerCase() } }] }
        : {}),
      ...(q.status === 'solved' ? { progress: { some: { userId: user.id, solved: true } } } : {}),
      ...(q.status === 'todo' ? { progress: { none: { userId: user.id, solved: true } } } : {}),
    };
    const take = 30;
    const [total, rows] = await Promise.all([
      prisma.exercise.count({ where }),
      prisma.exercise.findMany({
        where,
        orderBy: [{ language: 'asc' }, { level: 'asc' }, { chapter: { order: 'asc' } }, { order: 'asc' }],
        skip: (q.page - 1) * take,
        take,
        include: { chapter: { select: { slug: true, title: true } }, progress: { where: { userId: user.id } } },
      }),
    ]);
    return {
      total,
      page: q.page,
      pages: Math.ceil(total / take),
      items: rows.map((e) => ({
        id: e.id,
        type: e.type,
        kind: e.kind,
        title: e.title || e.prompt.split('\n')[0].slice(0, 90),
        language: e.language,
        level: e.level,
        difficulty: e.difficulty,
        xp: e.xp,
        chapter: e.chapter,
        solved: e.progress[0]?.solved ?? false,
        attempts: e.progress[0]?.attempts ?? 0,
      })),
    };
  });

  app.get<{ Params: { id: string }; Querystring: { language?: string } }>('/exercises/:id', async (req) => {
    const user = requireUser(req);
    const ex = await prisma.exercise.findUnique({ where: { id: req.params.id }, include: { chapter: { select: { slug: true, title: true } } } });
    if (!ex || ex.kind === 'exam' || ex.kind === 'placement') throw notFound('Exercice');
    const language = ex.language ?? req.query.language ?? 'rust';
    const p = await prisma.exerciseProgress.findUnique({ where: { userId_exerciseId_language: { userId: user.id, exerciseId: ex.id, language } } });
    return {
      ...publicExercise(ex, language),
      chapter: ex.chapter,
      state: { solved: p?.solved ?? false, attempts: p?.attempts ?? 0, draft: p?.draft ?? null, hintsUsed: p?.hintsUsed ?? 0 },
    };
  });

  /* Soumission notée */
  app.post<{ Params: { id: string } }>('/exercises/:id/submit', { config: { rateLimit: { max: config.runLimitPerMinute, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireUser(req);
    const body = parse(
      z.object({ language: z.string().optional(), answer: answerSchema, timeMs: z.number().int().min(0).max(36e5).default(0), mode: z.enum(['practice', 'review']).default('practice') }),
      req.body,
    );
    const ex = await prisma.exercise.findUnique({ where: { id: req.params.id }, include: { chapter: true, project: true } });
    if (!ex) throw notFound('Exercice');
    if (ex.kind === 'exam' && body.mode !== 'review') throw forbidden("Les questions d'examen se valident depuis l'examen du chapitre");
    if (ex.kind === 'placement') throw forbidden();
    const language = resolveLanguage(ex, body.language);
    const settings0 = await getSettings();
    // Offre gratuite : plus d'énergie = plus de réponses en pratique (les révisions restent ouvertes).
    const costsEnergy = body.mode === 'practice' && (ex.type !== 'code' || settings0.codeCostsEnergy);
    if (costsEnergy) await requireEnergy(user);
    const result = await grade(ex, body.answer as Answer, language);
    const settings = await getSettings();
    let energyDelta = 0;
    if (costsEnergy && !result.correct) {
      await spendEnergy(user);
      energyDelta = -1;
    } else if (body.mode === 'review' && result.correct && settings.reviewRefillsEnergy) {
      await gainEnergy(user, 1);
      energyDelta = 1;
    }

    const key = { userId_exerciseId_language: { userId: user.id, exerciseId: ex.id, language } };
    const before = await prisma.exerciseProgress.findUnique({ where: key });
    const firstSolve = result.correct && !before?.solved;
    const attempts = (before?.attempts ?? 0) + 1;

    let xp = 0;
    if (body.mode === 'review') {
      const item = await prisma.reviewItem.findUnique({ where: { userId_exerciseId: { userId: user.id, exerciseId: ex.id } } });
      if (item) {
        const quality = result.correct ? (attempts <= 1 || (before?.solved && result.score === 100) ? 5 : 4) : 2;
        const next = sm2(item, quality);
        await prisma.reviewItem.update({
          where: { id: item.id },
          data: { ease: next.ease, interval: next.interval, repetitions: next.repetitions, lapses: next.lapses, dueAt: addDays(new Date(), next.nextInDays), lastReviewed: new Date() },
        });
        if (result.correct && item.dueAt <= new Date()) xp = settings.xpReview;
      }
    } else if (firstSolve) {
      let f = attempts > 2 ? settings.xpRetryFactor : 1;
      if ((before?.hintsUsed ?? 0) >= 3) f *= settings.xpSolutionFactor;
      xp = Math.max(1, Math.round(ex.xp * f));
    }

    await prisma.attempt.create({
      data: { userId: user.id, exerciseId: ex.id, language, correct: result.correct, score: result.score, mode: body.mode, answer: body.answer as any, timeMs: body.timeMs, xpAwarded: xp },
    });
    await prisma.exerciseProgress.upsert({
      where: key,
      create: {
        userId: user.id, exerciseId: ex.id, language, attempts, solved: result.correct, bestScore: result.score,
        firstSolvedAt: result.correct ? new Date() : null, draft: body.answer.code ?? null,
      },
      update: {
        attempts, solved: before?.solved || result.correct, bestScore: Math.max(before?.bestScore ?? 0, result.score),
        ...(firstSolve ? { firstSolvedAt: new Date() } : {}),
        ...(body.answer.code !== undefined ? { draft: body.answer.code } : {}),
      },
    });

    // Révisions : erreurs → révision demain ; notion acquise → révision dans 3 jours.
    if (body.mode === 'practice' && ex.kind !== 'project') {
      if (!result.correct) await scheduleReviewOnError(user.id, ex.id, language);
      else if (firstSolve && ex.type !== 'code')
        await prisma.reviewItem.upsert({
          where: { userId_exerciseId: { userId: user.id, exerciseId: ex.id } },
          create: { userId: user.id, exerciseId: ex.id, language, dueAt: addDays(new Date(), 3), interval: 3, repetitions: 1, reason: 'learned' },
          update: {},
        });
    }

    if (ex.chapter) await touchChapter(user.id, ex.chapter.id);
    let rewards = await reward(user, {
      xp,
      exercises: 1,
      correct: result.correct ? 1 : 0,
      reviews: body.mode === 'review' && result.correct ? 1 : 0,
      code: result.correct && result.compiled ? 1 : 0,
    });

    let chapterCompleted = false;
    let projectCompleted = false;
    if (result.correct && ex.kind === 'miniproject' && ex.chapter) {
      const p = await touchChapter(user.id, ex.chapter.id);
      if (!p.projectPassed) {
        await prisma.chapterProgress.update({ where: { id: p.id }, data: { projectPassed: true } });
        await logActivity(user.id, 'miniproject', `Mini-projet réussi : ${ex.title}`, { slug: ex.chapter.slug });
      }
      const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const done = await maybeCompleteChapter(fresh, ex.chapter);
      chapterCompleted = done.completed;
      if (done.rewards) rewards = mergeRewards(rewards, done.rewards);
    }
    if (result.correct && ex.kind === 'project' && ex.project) {
      const pp = await prisma.projectProgress.upsert({
        where: { userId_projectId_language: { userId: user.id, projectId: ex.project.id, language } },
        create: { userId: user.id, projectId: ex.project.id, language, stepsDone: [ex.id] },
        update: {},
      });
      const steps = new Set([...pp.stepsDone, ex.id]);
      const total = await prisma.exercise.count({ where: { projectId: ex.project.id } });
      const complete = steps.size >= total && !pp.completedAt;
      await prisma.projectProgress.update({ where: { id: pp.id }, data: { stepsDone: [...steps], ...(complete ? { completedAt: new Date() } : {}) } });
      if (complete) {
        projectCompleted = true;
        await logActivity(user.id, 'project', `Projet terminé : ${ex.project.title} (${language})`, { slug: ex.project.slug });
        const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
        rewards = mergeRewards(rewards, await reward(fresh, { xp: settings.xpProjectCompleted }));
      }
    }

    // Nombre d'échecs consécutifs récents sur cet exercice (pour l'encouragement de la mascotte)
    const recent = await prisma.attempt.findMany({ where: { userId: user.id, exerciseId: ex.id }, orderBy: { createdAt: 'desc' }, take: 5, select: { correct: true } });
    let failStreak = 0;
    for (const a of recent) {
      if (a.correct) break;
      failStreak++;
    }
    const plan = await planStatus(await prisma.user.findUniqueOrThrow({ where: { id: user.id } }));
    return { ...result, firstSolve, attempts, failStreak, rewards, chapterCompleted, projectCompleted, plan, energyDelta: plan.unlimited ? 0 : energyDelta };
  });

  /* Exécution libre (sans notation) avec les entrées des tests visibles ou une entrée personnalisée */
  app.post<{ Params: { id: string } }>('/exercises/:id/run', { config: { rateLimit: { max: config.runLimitPerMinute, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireUser(req);
    const body = parse(
      z.object({ language: z.string().optional(), code: z.string().max(100_000).optional(), blanks: z.array(z.string()).optional(), stdin: z.string().max(100_000).optional() }),
      req.body,
    );
    const ex = await prisma.exercise.findUnique({ where: { id: req.params.id } });
    if (!ex || ex.kind === 'placement') throw notFound('Exercice');
    const language = resolveLanguage(ex, body.language);
    const c = ex.content as any;
    let source = body.code ?? '';
    if (ex.type === 'fill') source = fillTemplate(c.code, body.blanks ?? []);
    if (ex.type === 'predict') throw badRequest("Pour cet exercice, il faut prédire la sortie sans exécuter le programme 😉");
    if (!source.trim()) throw badRequest('Aucun code à exécuter');
    await consumeRun(user);
    const visible: { input: string; output: string }[] = c.visibleTests ?? [];
    const inputs = body.stdin !== undefined ? [body.stdin] : visible.length ? visible.map((t) => t.input) : [''];
    const raw = await runCode(language, source, inputs);
    if (body.code !== undefined) {
      await prisma.exerciseProgress.upsert({
        where: { userId_exerciseId_language: { userId: user.id, exerciseId: ex.id, language } },
        create: { userId: user.id, exerciseId: ex.id, language, draft: body.code },
        update: { draft: body.code },
      });
    }
    const failing = raw.compile.ok ? raw.tests.find((t) => t.exitCode !== 0) : undefined;
    return {
      compile: { ...raw.compile, diagnostics: parseDiagnostics(language, raw.compile.stderr) },
      runs: raw.tests.map((t) => ({ ...t, input: inputs[t.index], expected: body.stdin === undefined ? visible[t.index]?.output : undefined })),
      help: !raw.compile.ok ? explainError(language, raw.compile.stderr, raw.compile.exitCode) : failing ? explainError(language, failing.stderr, failing.exitCode) : [],
      error: raw.error,
      plan: await planStatus(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })),
    };
  });

  app.put<{ Params: { id: string } }>('/exercises/:id/draft', async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ language: z.string(), code: z.string().max(100_000) }), req.body);
    const ex = await prisma.exercise.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!ex) throw notFound('Exercice');
    await prisma.exerciseProgress.upsert({
      where: { userId_exerciseId_language: { userId: user.id, exerciseId: ex.id, language: body.language } },
      create: { userId: user.id, exerciseId: ex.id, language: body.language, draft: body.code },
      update: { draft: body.code },
    });
    return { ok: true, savedAt: new Date() };
  });

  /* Aide progressive : 1 = petit indice, 2 = explication de la notion, 3 = solution commentée */
  app.post<{ Params: { id: string } }>('/exercises/:id/hint', async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ level: z.number().int().min(1).max(3), language: z.string().optional() }), req.body);
    const ex = await prisma.exercise.findUnique({ where: { id: req.params.id }, include: { chapter: true } });
    if (!ex || ex.kind === 'exam' || ex.kind === 'placement') throw notFound('Exercice');
    const language = resolveLanguage(ex, body.language);
    const key = { userId_exerciseId_language: { userId: user.id, exerciseId: ex.id, language } };
    const p = await prisma.exerciseProgress.findUnique({ where: key });
    const used = p?.hintsUsed ?? 0;
    if (body.level > used + 1) throw badRequest("Débloque d'abord les niveaux d'aide précédents");
    const settings = await getSettings();
    if (body.level === 3 && (p?.attempts ?? 0) < settings.solutionMinAttempts && !p?.solved) {
      throw badRequest(`Essaie encore au moins ${settings.solutionMinAttempts - (p?.attempts ?? 0)} fois avant de consulter la solution. Tu peux y arriver !`);
    }
    await prisma.exerciseProgress.upsert({
      where: key,
      create: { userId: user.id, exerciseId: ex.id, language, hintsUsed: body.level },
      update: { hintsUsed: Math.max(used, body.level) },
    });
    const sol = ex.solution as any;
    if (body.level === 1) {
      return { level: 1, title: 'Petit indice', text: ex.hints[0] ?? 'Relis attentivement la consigne et repère le mot-clé principal de la notion travaillée.' };
    }
    if (body.level === 2) {
      const g = await glossaryFor(ex.concepts, language);
      const text =
        ex.hints[1] ??
        (g ? `**${g.title}** — ${g.summary}\n\n${g.langText ?? ''}` : `Cet exercice porte sur : ${ex.concepts.join(', ') || ex.chapter?.title}. Relis la section correspondante du cours.`);
      return { level: 2, title: 'Explication de la notion', text };
    }
    let solution: string | undefined;
    let text = sol.explanation || 'Voici la solution commentée.';
    switch (ex.type) {
      case 'mcq':
        text = `Bonne réponse : ${[sol.answer].flat().map((i: number) => `« ${(ex.content as any).choices[i]} »`).join(', ')}.\n\n${sol.explanation ?? ''}`;
        break;
      case 'predict':
        solution = sol.output;
        break;
      case 'fill':
        text = `Réponses attendues : ${sol.blanks.map((b: string[], i: number) => `trou ${i + 1} → \`${b[0]}\``).join(', ')}.\n\n${sol.explanation ?? ''}`;
        break;
      case 'order':
        solution = ((ex.content as any).lines as string[]).join('\n');
        break;
      case 'bugfix':
        text = `Le bug se trouve ligne ${sol.bugLines.join(', ')}. ${(ex.content as any).choices[sol.answer]}\n\n${sol.explanation ?? ''}`;
        solution = sol.solution;
        break;
      case 'code':
        solution = sol.solutions ? sol.solutions[language] : sol.solution;
        break;
    }
    await logActivity(user.id, 'solution', `Solution consultée : ${ex.title || ex.id}`);
    return { level: 3, title: 'Solution commentée', text, solution, note: 'Consulter la solution réduit l’XP gagnée sur cet exercice. Essaie de la réécrire toi-même sans regarder !' };
  });
}
