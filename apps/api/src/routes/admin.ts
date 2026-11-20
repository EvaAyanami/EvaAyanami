import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Exercise, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { hashPassword, requireAdmin } from '../lib/auth.js';
import { badRequest, notFound } from '../lib/http.js';
import { exerciseSchema, importContent, loadContent, splitExercise } from '../lib/content.js';
import { fillTemplate, runTests, normalizeOutput } from '../lib/grading.js';
import { runCode, runnerHealth } from '../lib/runner.js';
import { getSettings, saveSettings, DEFAULT_SETTINGS } from '../lib/settings.js';
import { levelFromXp } from '../lib/levels.js';
import { addDays } from '../lib/srs.js';
import { parse } from './auth.js';

/** Reconstitue la définition éditable d'un exercice à partir des colonnes publiques/privées. */
export function rowToDef(e: Exercise) {
  const c = e.content as Record<string, any>;
  const s = e.solution as Record<string, any>;
  const base = { id: e.id, type: e.type, title: e.title, prompt: e.prompt, difficulty: e.difficulty, concepts: e.concepts, hints: e.hints, explanation: s.explanation ?? '', xp: e.xp };
  switch (e.type) {
    case 'mcq':
      return { ...base, choices: c.choices, answer: s.answer, code: c.code ?? undefined };
    case 'fill':
      return { ...base, code: c.code, blanks: s.blanks, tests: s.tests?.length ? s.tests : undefined };
    case 'order':
      return { ...base, lines: c.lines, alternatives: s.alternatives };
    case 'predict':
      return { ...base, code: c.code, input: c.input, output: s.output };
    case 'bugfix':
      return { ...base, code: c.code, bugLines: s.bugLines, choices: c.choices, answer: s.answer, solution: s.solution, tests: s.tests };
    case 'code':
      if (c.starters) return { ...base, starters: c.starters, solutions: s.solutions, tests: s.tests };
      return { ...base, starter: c.starter, solution: s.solution, tests: s.tests, require: s.require ?? [], forbid: s.forbid ?? [] };
  }
  return base;
}

/** Vérifie qu'un exercice est cohérent en exécutant réellement sa solution. */
async function verifyExercise(e: Exercise) {
  const d = rowToDef(e) as any;
  const lang = e.language;
  const out: { ok: boolean; message: string }[] = [];
  if (e.type === 'code' && d.starters) {
    for (const l of Object.keys(d.solutions ?? {})) {
      const r = await runTests(l, d.solutions[l], d.tests);
      out.push({ ok: r.allPassed, message: `${l} : ${r.allPassed ? 'solution valide' : r.compile!.ok ? 'tests échoués' : 'ne compile pas'}` });
    }
    return out;
  }
  if (!lang) return [{ ok: true, message: 'Rien à exécuter' }];
  if (e.type === 'code') {
    const r = await runTests(lang, d.solution, d.tests);
    out.push({ ok: r.allPassed, message: r.allPassed ? 'La solution passe tous les tests' : `Échec : ${r.compile!.ok ? r.tests!.filter((t) => !t.passed).map((t) => t.name).join(', ') : r.compile!.stderr.slice(0, 500)}` });
  } else if (e.type === 'bugfix') {
    const good = await runTests(lang, d.solution, d.tests);
    const bad = await runTests(lang, d.code, d.tests);
    out.push({ ok: good.allPassed, message: good.allPassed ? 'Le code corrigé passe les tests' : 'Le code corrigé échoue' });
    out.push({ ok: !bad.allPassed, message: !bad.allPassed ? 'Le code bogué échoue bien' : 'Attention : le code bogué passe les tests !' });
  } else if (e.type === 'fill' && d.tests?.length) {
    const r = await runTests(lang, fillTemplate(d.code, d.blanks.map((b: string[]) => b[0])), d.tests);
    out.push({ ok: r.allPassed, message: r.allPassed ? 'Le modèle complété passe les tests' : 'Le modèle complété échoue' });
  } else if (e.type === 'predict') {
    const r = await runCode(lang, d.code, [d.input ?? '']);
    const got = r.tests[0]?.stdout ?? '';
    const ok = r.compile.ok && normalizeOutput(got) === normalizeOutput(d.output);
    out.push({ ok, message: ok ? 'La sortie attendue est correcte' : `Sortie réelle : ${r.compile.ok ? JSON.stringify(got) : 'erreur de compilation'}` });
  } else out.push({ ok: true, message: 'Exercice non compilé : aucune vérification d’exécution nécessaire' });
  return out;
}

const chapterBody = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  languageId: z.string(),
  level: z.number().int().min(1).max(5),
  order: z.number().int().min(0),
  title: z.string().min(1),
  summary: z.string(),
  concepts: z.array(z.string()),
  sections: z.array(z.object({ title: z.string(), body: z.string() })).min(1),
  minutes: z.number().int().min(1).max(600),
  published: z.boolean(),
  examPass: z.number().int().min(1).max(100),
});

export default async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    requireAdmin(req);
  });

  app.get('/admin/overview', async () => {
    const now = new Date();
    const [users, active7, attemptsToday, attempts7, exercises, chapters, projects, errors] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { lastActiveAt: { gte: addDays(now, -7) } } }),
      prisma.attempt.count({ where: { createdAt: { gte: addDays(now, -1) } } }),
      prisma.attempt.count({ where: { createdAt: { gte: addDays(now, -7) } } }),
      prisma.exercise.count(),
      prisma.chapter.count(),
      prisma.project.count(),
      prisma.errorLog.count({ where: { createdAt: { gte: addDays(now, -7) } } }),
    ]);
    const dbSize = await prisma.$queryRaw<{ size: string }[]>`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`;
    const hardest = await prisma.$queryRaw<{ id: string; title: string; language: string; total: bigint; ok: bigint }[]>`
      SELECT e.id, e.title, e.language, COUNT(*) total, SUM(CASE WHEN a.correct THEN 1 ELSE 0 END) ok
      FROM "Attempt" a JOIN "Exercise" e ON e.id = a."exerciseId" WHERE a.mode = 'practice'
      GROUP BY e.id HAVING COUNT(*) >= 3 ORDER BY SUM(CASE WHEN a.correct THEN 1 ELSE 0 END)::float / COUNT(*) ASC LIMIT 10`;
    const perDay = await prisma.$queryRaw<{ day: string; attempts: bigint; users: bigint }[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, COUNT(*) attempts, COUNT(DISTINCT "userId") users
      FROM "Attempt" WHERE "createdAt" > now() - interval '30 days' GROUP BY 1 ORDER BY 1`;
    const mem = process.memoryUsage();
    return {
      counts: { users, active7, attemptsToday, attempts7, exercises, chapters, projects, errors },
      runner: await runnerHealth(),
      system: { uptimeSec: Math.round(process.uptime()), rssMb: Math.round(mem.rss / 1e6), heapMb: Math.round(mem.heapUsed / 1e6), node: process.version, dbSize: dbSize[0]?.size, ai: config.ai.provider },
      hardest: hardest.map((h) => ({ id: h.id, title: h.title, language: h.language, attempts: Number(h.total), successRate: Number(h.ok) / Number(h.total) })),
      perDay: perDay.map((d) => ({ day: d.day, attempts: Number(d.attempts), users: Number(d.users) })),
    };
  });

  /* ---------------- Utilisateurs ---------------- */
  app.get<{ Querystring: { search?: string; page?: string } }>('/admin/users', async (req) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const where: Prisma.UserWhereInput = req.query.search
      ? { OR: [{ email: { contains: req.query.search, mode: 'insensitive' } }, { username: { contains: req.query.search, mode: 'insensitive' } }] }
      : {};
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 50, take: 50 }),
    ]);
    return {
      total,
      users: users.map((u) => ({
        id: u.id, email: u.email, username: u.username, displayName: u.displayName, role: u.role, disabled: u.disabled,
        xp: u.xp, level: levelFromXp(u.xp).level, streak: u.streak, createdAt: u.createdAt, lastActiveAt: u.lastActiveAt, lockedUntil: u.lockedUntil,
      })),
    };
  });

  app.patch<{ Params: { id: string } }>('/admin/users/:id', async (req) => {
    const admin = requireAdmin(req);
    const body = parse(
      z.object({ role: z.enum(['USER', 'ADMIN']).optional(), disabled: z.boolean().optional(), password: z.string().min(8).optional(), unlock: z.boolean().optional(), resetProgress: z.boolean().optional() }),
      req.body,
    );
    const u = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!u) throw notFound('Utilisateur');
    if (u.id === admin.id && (body.role === 'USER' || body.disabled)) throw badRequest('Tu ne peux pas retirer tes propres droits');
    if (body.resetProgress) {
      await prisma.$transaction([
        prisma.attempt.deleteMany({ where: { userId: u.id } }),
        prisma.exerciseProgress.deleteMany({ where: { userId: u.id } }),
        prisma.chapterProgress.deleteMany({ where: { userId: u.id } }),
        prisma.projectProgress.deleteMany({ where: { userId: u.id } }),
        prisma.reviewItem.deleteMany({ where: { userId: u.id } }),
        prisma.userAchievement.deleteMany({ where: { userId: u.id } }),
        prisma.userChallenge.deleteMany({ where: { userId: u.id } }),
        prisma.dailyActivity.deleteMany({ where: { userId: u.id } }),
        prisma.skillProfile.deleteMany({ where: { userId: u.id } }),
        prisma.user.update({ where: { id: u.id }, data: { xp: 0, streak: 0, lastStreakDate: null, onboardingDone: false, learningTimeMs: 0 } }),
      ]);
    }
    await prisma.user.update({
      where: { id: u.id },
      data: {
        ...(body.role ? { role: body.role } : {}),
        ...(body.disabled !== undefined ? { disabled: body.disabled } : {}),
        ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
        ...(body.unlock ? { lockedUntil: null, failedLogins: 0 } : {}),
      },
    });
    if (body.disabled || body.password) await prisma.session.deleteMany({ where: { userId: u.id } });
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/admin/users/:id', async (req) => {
    const admin = requireAdmin(req);
    if (req.params.id === admin.id) throw badRequest('Tu ne peux pas supprimer ton propre compte ici');
    await prisma.user.delete({ where: { id: req.params.id } });
    return { ok: true };
  });

  /* ---------------- Cours ---------------- */
  app.get<{ Querystring: { language?: string } }>('/admin/chapters', async (req) => {
    return prisma.chapter.findMany({
      where: req.query.language ? { languageId: req.query.language } : {},
      orderBy: [{ languageId: 'asc' }, { level: 'asc' }, { order: 'asc' }],
      select: { id: true, slug: true, title: true, languageId: true, level: true, order: true, published: true, customized: true, _count: { select: { exercises: true } } },
    });
  });

  app.get<{ Params: { id: string } }>('/admin/chapters/:id', async (req) => {
    const c = await prisma.chapter.findUnique({ where: { id: req.params.id }, include: { exercises: { orderBy: [{ kind: 'asc' }, { order: 'asc' }] } } });
    if (!c) throw notFound('Chapitre');
    return { ...c, exercises: c.exercises.map((e) => ({ id: e.id, kind: e.kind, type: e.type, title: e.title, prompt: e.prompt.slice(0, 140), order: e.order, customized: e.customized })) };
  });

  app.post('/admin/chapters', async (req) => {
    const body = parse(chapterBody, req.body);
    return prisma.chapter.create({ data: { ...body, customized: true } });
  });

  app.put<{ Params: { id: string } }>('/admin/chapters/:id', async (req) => {
    const body = parse(chapterBody.partial(), req.body);
    return prisma.chapter.update({ where: { id: req.params.id }, data: { ...body, customized: true } });
  });

  app.delete<{ Params: { id: string } }>('/admin/chapters/:id', async (req) => {
    await prisma.chapter.delete({ where: { id: req.params.id } });
    return { ok: true };
  });

  /* ---------------- Exercices ---------------- */
  app.get<{ Params: { id: string } }>('/admin/exercises/:id', async (req) => {
    const e = await prisma.exercise.findUnique({ where: { id: req.params.id } });
    if (!e) throw notFound('Exercice');
    return { meta: { id: e.id, kind: e.kind, language: e.language, chapterId: e.chapterId, projectId: e.projectId, level: e.level, order: e.order, customized: e.customized }, def: rowToDef(e) };
  });

  const exMeta = z.object({
    kind: z.enum(['practice', 'exam', 'miniproject', 'placement']),
    chapterId: z.string().nullable().optional(),
    language: z.enum(['rust', 'cpp', 'java']),
    level: z.number().int().min(1).max(5),
    order: z.number().int().min(0).default(0),
  });

  app.post('/admin/exercises', async (req) => {
    const body = parse(z.object({ meta: exMeta, def: exerciseSchema }), req.body);
    if (await prisma.exercise.findUnique({ where: { id: body.def.id } })) throw badRequest('Cet identifiant existe déjà');
    const { content, solution } = splitExercise(body.def);
    return prisma.exercise.create({
      data: {
        id: body.def.id, kind: body.meta.kind, type: body.def.type, language: body.meta.language, chapterId: body.meta.chapterId ?? null,
        level: body.meta.level, order: body.meta.order, difficulty: body.def.difficulty, title: body.def.title ?? '', prompt: body.def.prompt,
        concepts: body.def.concepts, hints: body.def.hints, xp: body.def.xp ?? 10, content, solution, customized: true,
      },
    });
  });

  app.put<{ Params: { id: string } }>('/admin/exercises/:id', async (req) => {
    const existing = await prisma.exercise.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Exercice');
    if (existing.kind === 'project') {
      // Étape de projet multi-langages
      const body = parse(
        z.object({ def: z.object({ title: z.string(), prompt: z.string(), hints: z.array(z.string()), xp: z.number().int(), starters: z.record(z.string()), solutions: z.record(z.string()), tests: z.array(z.any()).min(1) }) }),
        req.body,
      );
      return prisma.exercise.update({
        where: { id: existing.id },
        data: {
          title: body.def.title, prompt: body.def.prompt, hints: body.def.hints, xp: body.def.xp, customized: true,
          content: { starters: body.def.starters, visibleTests: body.def.tests.filter((t: any) => !t.hidden), rules: [] },
          solution: { solutions: body.def.solutions, tests: body.def.tests, require: [], forbid: [], explanation: '' },
        },
      });
    }
    const body = parse(z.object({ def: exerciseSchema, meta: exMeta.partial().optional() }), req.body);
    if (body.def.id !== existing.id) throw badRequest("L'identifiant ne peut pas être modifié");
    const { content, solution } = splitExercise(body.def);
    return prisma.exercise.update({
      where: { id: existing.id },
      data: {
        type: body.def.type, title: body.def.title ?? '', prompt: body.def.prompt, difficulty: body.def.difficulty, concepts: body.def.concepts,
        hints: body.def.hints, xp: body.def.xp ?? existing.xp, content, solution, customized: true,
        ...(body.meta?.order !== undefined ? { order: body.meta.order } : {}),
        ...(body.meta?.level !== undefined ? { level: body.meta.level } : {}),
      },
    });
  });

  app.delete<{ Params: { id: string } }>('/admin/exercises/:id', async (req) => {
    await prisma.exercise.delete({ where: { id: req.params.id } });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/admin/exercises/:id/verify', async (req) => {
    const e = await prisma.exercise.findUnique({ where: { id: req.params.id } });
    if (!e) throw notFound('Exercice');
    return { checks: await verifyExercise(e) };
  });

  /* ---------------- Projets ---------------- */
  app.get('/admin/projects', async () =>
    prisma.project.findMany({ orderBy: [{ level: 'asc' }, { order: 'asc' }], include: { steps: { select: { id: true, title: true, order: true }, orderBy: { order: 'asc' } } } }),
  );

  app.put<{ Params: { id: string } }>('/admin/projects/:id', async (req) => {
    const body = parse(
      z.object({ title: z.string(), summary: z.string(), description: z.string(), objectives: z.array(z.string()), constraints: z.array(z.string()), published: z.boolean(), level: z.number().int().min(1).max(5) }).partial(),
      req.body,
    );
    return prisma.project.update({ where: { id: req.params.id }, data: { ...body, customized: true } });
  });

  /* ---------------- Récompenses ---------------- */
  const achBody = z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string(),
    description: z.string(),
    icon: z.string().max(8),
    xp: z.number().int().min(0),
    hidden: z.boolean().default(false),
    order: z.number().int().default(0),
    condition: z.object({ type: z.string(), threshold: z.number(), language: z.string().optional(), concept: z.string().optional() }),
  });
  app.get('/admin/achievements', async () => prisma.achievement.findMany({ orderBy: { order: 'asc' }, include: { _count: { select: { users: true } } } }));
  app.post('/admin/achievements', async (req) => {
    const body = parse(achBody, req.body);
    return prisma.achievement.upsert({ where: { id: body.id }, create: body, update: body });
  });
  app.delete<{ Params: { id: string } }>('/admin/achievements/:id', async (req) => {
    await prisma.achievement.delete({ where: { id: req.params.id } });
    return { ok: true };
  });

  /* ---------------- Paramètres pédagogiques ---------------- */
  app.get('/admin/settings', async () => ({ settings: await getSettings(), defaults: DEFAULT_SETTINGS }));
  app.put('/admin/settings', async (req) => {
    const body = parse(z.record(z.any()), req.body);
    const allowed = Object.keys(DEFAULT_SETTINGS);
    const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
    return { settings: await saveSettings(patch) };
  });

  /* ---------------- Journaux ---------------- */
  app.get('/admin/errors', async () => prisma.errorLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }));
  app.delete('/admin/errors', async () => {
    await prisma.errorLog.deleteMany({});
    return { ok: true };
  });

  /* ---------------- Contenu (import / export) ---------------- */
  app.post('/admin/content/import', async (req) => {
    const body = parse(z.object({ force: z.boolean().default(false) }), req.body ?? {});
    const logs: string[] = [];
    const bundle = await loadContent(config.contentDir);
    await importContent(bundle, { force: body.force, log: (m) => logs.push(m) });
    return { ok: true, logs };
  });

  app.get('/admin/content/export', async (_req, reply) => {
    const chapters = await prisma.chapter.findMany({ include: { exercises: true }, orderBy: [{ languageId: 'asc' }, { level: 'asc' }, { order: 'asc' }] });
    const data = {
      exportedAt: new Date().toISOString(),
      chapters: chapters.map((c) => ({ ...c, exercises: c.exercises.map((e) => ({ kind: e.kind, ...rowToDef(e) })) })),
      achievements: await prisma.achievement.findMany(),
      settings: await getSettings(),
    };
    reply.header('content-disposition', 'attachment; filename="codemori-contenu.json"');
    return data;
  });
}
