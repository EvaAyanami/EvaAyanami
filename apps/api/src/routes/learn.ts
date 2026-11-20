import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireUser } from '../lib/auth.js';
import { notFound } from '../lib/http.js';
import { grade, publicExercise, type Answer } from '../lib/grading.js';
import { chapterStatuses, maybeCompleteChapter, touchChapter } from '../lib/progress.js';
import { logActivity, reward } from '../lib/gamification.js';
import { getSettings } from '../lib/settings.js';
import { LEVEL_NAMES } from '../lib/levels.js';
import { mergeRewards, scheduleReviewOnError } from './exercises.js';
import { parse } from './auth.js';

export default async function learnRoutes(app: FastifyInstance) {
  app.get('/languages', async (req) => {
    const user = requireUser(req);
    const langs = await prisma.language.findMany({ where: { enabled: true }, orderBy: { order: 'asc' } });
    const out = [];
    for (const l of langs) {
      const st = await chapterStatuses(user.id, l.id);
      const skill = await prisma.skillProfile.findUnique({ where: { userId_languageId: { userId: user.id, languageId: l.id } } });
      const validated = st.filter((s) => s.status === 'done' || s.status === 'skipped').length;
      const next = st.find((s) => s.status === 'in_progress') ?? st.find((s) => s.status === 'available');
      out.push({
        ...l,
        chapterCount: st.length,
        completed: st.filter((s) => s.status === 'done').length,
        validated,
        progress: st.length ? validated / st.length : 0,
        skillLevel: skill?.level ?? 1,
        skillSource: skill?.source ?? 'default',
        next: next ? { slug: next.chapter.slug, title: next.chapter.title } : null,
      });
    }
    return out;
  });

  app.get<{ Params: { id: string } }>('/languages/:id/map', async (req) => {
    const user = requireUser(req);
    const lang = await prisma.language.findUnique({ where: { id: req.params.id } });
    if (!lang) throw notFound('Langage');
    const st = await chapterStatuses(user.id, lang.id);
    const counts = await prisma.exercise.groupBy({ by: ['chapterId'], where: { language: lang.id, kind: 'practice' }, _count: true });
    const solved = await prisma.exerciseProgress.findMany({
      where: { userId: user.id, solved: true, language: lang.id, exercise: { kind: 'practice' } },
      select: { exercise: { select: { chapterId: true } } },
    });
    const solvedBy = new Map<string, number>();
    for (const s of solved) solvedBy.set(s.exercise.chapterId!, (solvedBy.get(s.exercise.chapterId!) ?? 0) + 1);
    const countBy = new Map(counts.map((c) => [c.chapterId, c._count]));
    const levels = [1, 2, 3, 4, 5].map((lv) => ({
      level: lv,
      name: LEVEL_NAMES[lv],
      chapters: st
        .filter((s) => s.chapter.level === lv)
        .map((s) => ({
          slug: s.chapter.slug,
          title: s.chapter.title,
          summary: s.chapter.summary,
          minutes: s.chapter.minutes,
          status: s.status,
          exercises: countBy.get(s.chapter.id) ?? 0,
          solved: solvedBy.get(s.chapter.id) ?? 0,
          examPassed: s.progress?.examPassed ?? false,
          projectPassed: s.progress?.projectPassed ?? false,
        })),
    }));
    const skill = await prisma.skillProfile.findUnique({ where: { userId_languageId: { userId: user.id, languageId: lang.id } } });
    return { language: lang, levels, skillLevel: skill?.level ?? 1 };
  });

  app.get<{ Params: { slug: string } }>('/chapters/:slug', async (req) => {
    const user = requireUser(req);
    const chapter = await prisma.chapter.findUnique({ where: { slug: req.params.slug } });
    if (!chapter || !chapter.published) throw notFound('Chapitre');
    const st = await chapterStatuses(user.id, chapter.languageId);
    const idx = st.findIndex((s) => s.chapter.id === chapter.id);
    const me = st[idx];
    const exercises = await prisma.exercise.findMany({
      where: { chapterId: chapter.id, kind: { in: ['practice', 'miniproject'] } },
      orderBy: { order: 'asc' },
    });
    const ep = await prisma.exerciseProgress.findMany({ where: { userId: user.id, exerciseId: { in: exercises.map((e) => e.id) } } });
    const pmap = new Map(ep.map((p) => [p.exerciseId, p]));
    const examCount = await prisma.exercise.count({ where: { chapterId: chapter.id, kind: 'exam' } });
    const withState = (e: (typeof exercises)[number]) => {
      const p = pmap.get(e.id);
      return { ...publicExercise(e), state: { solved: p?.solved ?? false, attempts: p?.attempts ?? 0, draft: p?.draft ?? null, hintsUsed: p?.hintsUsed ?? 0 } };
    };
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLocation: { path: `/chapitre/${chapter.slug}`, label: chapter.title, language: chapter.languageId } },
    });
    return {
      chapter: {
        slug: chapter.slug,
        title: chapter.title,
        summary: chapter.summary,
        level: chapter.level,
        levelName: LEVEL_NAMES[chapter.level],
        language: chapter.languageId,
        concepts: chapter.concepts,
        sections: chapter.sections,
        minutes: chapter.minutes,
        examPass: chapter.examPass,
        examCount,
      },
      status: me?.status ?? 'available',
      progress: me?.progress ?? null,
      exercises: exercises.filter((e) => e.kind === 'practice').map(withState),
      project: exercises.filter((e) => e.kind === 'miniproject').map(withState)[0] ?? null,
      prev: idx > 0 ? { slug: st[idx - 1].chapter.slug, title: st[idx - 1].chapter.title } : null,
      next: idx >= 0 && idx < st.length - 1 ? { slug: st[idx + 1].chapter.slug, title: st[idx + 1].chapter.title, status: st[idx + 1].status } : null,
    };
  });

  app.post<{ Params: { slug: string } }>('/chapters/:slug/position', async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ position: z.number().int().min(0), sectionsRead: z.number().int().min(0).optional() }), req.body);
    const chapter = await prisma.chapter.findUnique({ where: { slug: req.params.slug } });
    if (!chapter) throw notFound('Chapitre');
    const p = await touchChapter(user.id, chapter.id);
    await prisma.chapterProgress.update({
      where: { id: p.id },
      data: { position: body.position, sectionsRead: Math.max(p.sectionsRead, body.sectionsRead ?? 0) },
    });
    return { ok: true };
  });

  app.get<{ Params: { slug: string } }>('/chapters/:slug/exam', async (req) => {
    const user = requireUser(req);
    const chapter = await prisma.chapter.findUnique({ where: { slug: req.params.slug } });
    if (!chapter) throw notFound('Chapitre');
    const questions = await prisma.exercise.findMany({ where: { chapterId: chapter.id, kind: 'exam' }, orderBy: { order: 'asc' } });
    const p = await prisma.chapterProgress.findUnique({ where: { userId_chapterId: { userId: user.id, chapterId: chapter.id } } });
    return {
      chapter: { slug: chapter.slug, title: chapter.title, language: chapter.languageId, examPass: chapter.examPass },
      questions: questions.map((q) => publicExercise(q)),
      best: p?.examScore ?? 0,
      passed: p?.examPassed ?? false,
    };
  });

  app.post<{ Params: { slug: string } }>('/chapters/:slug/exam', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ answers: z.record(z.any()), timeMs: z.number().int().min(0).max(36e5).optional() }), req.body);
    const chapter = await prisma.chapter.findUnique({ where: { slug: req.params.slug } });
    if (!chapter) throw notFound('Chapitre');
    const questions = await prisma.exercise.findMany({ where: { chapterId: chapter.id, kind: 'exam' }, orderBy: { order: 'asc' } });
    const results = [];
    let total = 0;
    for (const q of questions) {
      const ans = body.answers[q.id] as Answer | undefined;
      let r;
      try {
        r = ans ? await grade(q, ans, chapter.languageId) : null;
      } catch {
        r = null;
      }
      total += r?.score ?? 0;
      results.push({ id: q.id, correct: r?.correct ?? false, score: r?.score ?? 0, explanation: (q.solution as any).explanation ?? '', reveal: r?.reveal });
      await prisma.attempt.create({
        data: { userId: user.id, exerciseId: q.id, language: chapter.languageId, correct: r?.correct ?? false, score: r?.score ?? 0, mode: 'exam', answer: (ans ?? {}) as any },
      });
      if (!r?.correct) await scheduleReviewOnError(user.id, q.id, chapter.languageId);
    }
    const score = questions.length ? Math.round(total / questions.length) : 0;
    const passed = score >= chapter.examPass;
    const p = await touchChapter(user.id, chapter.id);
    const firstPass = passed && !p.examPassed;
    // Examen réussi sur un chapitre non commencé → chapitre « passé » (validé par test).
    const st = await chapterStatuses(user.id, chapter.languageId);
    const wasLocked = st.find((s) => s.chapter.id === chapter.id)?.status === 'locked';
    await prisma.chapterProgress.update({
      where: { id: p.id },
      data: {
        examPassed: p.examPassed || passed,
        examScore: Math.max(p.examScore, score),
        ...(passed && !p.completedAt && wasLocked ? { completedAt: new Date(), skipped: true } : {}),
      },
    });
    const settings = await getSettings();
    let rewards = await reward(user, { xp: firstPass ? settings.xpExamPassed : 0, exercises: questions.length, correct: results.filter((r) => r.correct).length });
    if (firstPass) await logActivity(user.id, 'exam', `Examen réussi : ${chapter.title} (${score} %)`, { slug: chapter.slug });
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const done = await maybeCompleteChapter(fresh, chapter);
    if (done.rewards) rewards = mergeRewards(rewards, done.rewards);
    return { score, passed, pass: chapter.examPass, results, chapterCompleted: done.completed, skipped: passed && wasLocked, rewards };
  });
}
