import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireUser } from '../lib/auth.js';
import { badRequest, notFound } from '../lib/http.js';
import { grade, publicExercise, type Answer } from '../lib/grading.js';
import { getSettings } from '../lib/settings.js';
import { logActivity, reward } from '../lib/gamification.js';
import { LEVEL_NAMES } from '../lib/levels.js';
import { parse } from './auth.js';
import { LANGS } from './exercises.js';

/** Questionnaire d'auto-évaluation présenté à la première connexion. */
export const QUESTIONNAIRE = [
  { id: 'programmed', question: 'As-tu déjà programmé ?', type: 'single', options: ['Jamais', 'Un peu (tutoriels, école)', 'Régulièrement', 'C’est mon métier'] },
  { id: 'languages', question: 'Quels langages connais-tu ?', type: 'multi', options: ['Rust', 'C++', 'Java', 'C', 'Python', 'JavaScript / TypeScript', 'C#', 'Go', 'Autre'] },
  { id: 'duration', question: 'Depuis combien de temps programmes-tu ?', type: 'single', options: ['Je débute', 'Moins de 6 mois', '6 mois à 2 ans', 'Plus de 2 ans'] },
  { id: 'ide', question: 'As-tu déjà utilisé un IDE (VS Code, IntelliJ, CLion…) ?', type: 'yesno' },
  { id: 'variables', question: 'Connais-tu les variables ?', type: 'yesno' },
  { id: 'conditions', question: 'Connais-tu les conditions (if / else) ?', type: 'yesno' },
  { id: 'loops', question: 'Sais-tu utiliser les boucles ?', type: 'yesno' },
  { id: 'functions', question: 'Connais-tu les fonctions ?', type: 'yesno' },
  { id: 'oop', question: 'As-tu déjà utilisé des classes et des objets ?', type: 'yesno' },
  { id: 'pointers', question: 'Connais-tu les pointeurs ?', type: 'yesno' },
  { id: 'git', question: 'As-tu déjà utilisé Git ?', type: 'yesno' },
  { id: 'debug', question: 'Sais-tu déboguer un programme ?', type: 'yesno' },
] as const;

const LANG_LABEL: Record<string, string> = { rust: 'Rust', cpp: 'C++', java: 'Java' };

/** Niveau de départ du test adaptatif, déduit du questionnaire, pour chaque langage. */
export function startLevels(a: Record<string, unknown>): Record<string, number> {
  const yes = (k: string) => a[k] === true || a[k] === 'yes';
  const prog = Number(a.programmed ?? 0);
  const dur = Number(a.duration ?? 0);
  const known = (a.languages as number[] | undefined) ?? [];
  const knownNames: string[] = known.map((i) => QUESTIONNAIRE[1].options[i] as string);
  let general = 1;
  const basics = ['variables', 'conditions', 'loops', 'functions'].filter(yes).length;
  if (prog >= 1 && basics >= 3) general = 2;
  if (prog >= 2 && basics === 4 && (yes('oop') || dur >= 2)) general = 2;
  const out: Record<string, number> = {};
  for (const l of LANGS) {
    let lv = general;
    if (knownNames.includes(LANG_LABEL[l])) lv = Math.min(5, general + (dur >= 3 ? 2 : 1));
    if (l === 'cpp' && yes('pointers') && lv >= 2) lv = Math.min(5, lv + (knownNames.includes('C') ? 1 : 0));
    out[l] = Math.max(1, Math.min(4, lv));
  }
  return out;
}

/** Niveau final : plus haut niveau où l'apprenant a au moins 50 % de réussite (et au moins une bonne réponse). */
export function computeLevel(answers: { level: number; correct: boolean }[]): number {
  let best = 1;
  for (let L = 1; L <= 5; L++) {
    const at = answers.filter((a) => a.level === L);
    const ok = at.filter((a) => a.correct).length;
    if (ok >= 1 && ok / at.length >= 0.5) best = L;
  }
  // Un échec total aux niveaux inférieurs empêche un placement trop haut
  const low = answers.filter((a) => a.level < best);
  if (low.length >= 2 && low.every((a) => !a.correct)) best = Math.max(1, best - 1);
  return best;
}

export function nextLevel(start: number, history: { correct: boolean }[]) {
  let cur = start;
  for (const h of history) cur = h.correct ? Math.min(5, cur + 1) : Math.max(1, cur - 1);
  return cur;
}

async function pickQuestion(userId: string, runId: string, language: string, start: number) {
  const settings = await getSettings();
  const history = await prisma.placementAnswer.findMany({ where: { userId, runId, languageId: language }, orderBy: { createdAt: 'asc' } });
  if (history.length >= settings.placementQuestionsPerLanguage) return null;
  const level = nextLevel(start, history);
  const asked = history.map((h) => h.exerciseId);
  for (const d of [0, -1, 1, -2, 2, -3, 3]) {
    const L = level + d;
    if (L < 1 || L > 5) continue;
    const pool = await prisma.exercise.findMany({ where: { kind: 'placement', language, level: L, id: { notIn: asked } } });
    if (pool.length) {
      const q = pool[Math.floor(Math.random() * pool.length)];
      return { question: publicExercise(q), index: history.length + 1, total: settings.placementQuestionsPerLanguage, level: L };
    }
  }
  return null;
}

export default async function placementRoutes(app: FastifyInstance) {
  app.get('/placement/questionnaire', async () => QUESTIONNAIRE);

  app.post('/placement/questionnaire', async (req) => {
    const user = requireUser(req);
    const answers = parse(z.record(z.union([z.boolean(), z.number(), z.array(z.number()), z.string()])), req.body);
    const levels = startLevels(answers);
    await prisma.user.update({ where: { id: user.id }, data: { questionnaire: { answers, startLevels: levels } } });
    return { startLevels: levels };
  });

  app.post('/placement/start', async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ languages: z.array(z.enum(['rust', 'cpp', 'java'])).min(1) }), req.body);
    const runId = randomUUID();
    const starts = ((user.questionnaire as any)?.startLevels ?? {}) as Record<string, number>;
    const first = await pickQuestion(user.id, runId, body.languages[0], starts[body.languages[0]] ?? 1);
    return { runId, languages: body.languages, language: body.languages[0], ...first };
  });

  app.post('/placement/answer', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireUser(req);
    const body = parse(
      z.object({ runId: z.string().uuid(), language: z.enum(['rust', 'cpp', 'java']), exerciseId: z.string(), answer: z.record(z.any()), languages: z.array(z.string()) }),
      req.body,
    );
    const ex = await prisma.exercise.findUnique({ where: { id: body.exerciseId } });
    if (!ex || ex.kind !== 'placement' || ex.language !== body.language) throw notFound('Question');
    const already = await prisma.placementAnswer.findFirst({ where: { userId: user.id, runId: body.runId, exerciseId: ex.id } });
    if (already) throw badRequest('Question déjà répondue');
    let r;
    try {
      r = await grade(ex, body.answer as Answer, body.language);
    } catch (e) {
      if ((e as any).statusCode === 400) r = { correct: false, score: 0, explanation: undefined, feedback: 'Réponse vide' };
      else throw e;
    }
    await prisma.placementAnswer.create({ data: { userId: user.id, runId: body.runId, languageId: body.language, exerciseId: ex.id, level: ex.level, correct: r.correct } });
    const starts = ((user.questionnaire as any)?.startLevels ?? {}) as Record<string, number>;
    let language = body.language;
    let next = await pickQuestion(user.id, body.runId, language, starts[language] ?? 1);
    if (!next) {
      const idx = body.languages.indexOf(language);
      const rest = body.languages.slice(idx + 1);
      for (const l of rest) {
        next = await pickQuestion(user.id, body.runId, l, starts[l] ?? 1);
        if (next) {
          language = l as typeof language;
          break;
        }
      }
    }
    return { correct: r.correct, feedback: r.feedback, explanation: r.explanation, compile: (r as any).compile, tests: (r as any).tests, next: next ? { language, ...next } : null };
  });

  app.post('/placement/finish', async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ runId: z.string().uuid() }), req.body);
    const answers = await prisma.placementAnswer.findMany({ where: { userId: user.id, runId: body.runId } });
    if (!answers.length) throw badRequest('Aucune réponse enregistrée');
    const result: Record<string, { level: number; levelName: string; score: number; answered: number }> = {};
    for (const l of LANGS) {
      const a = answers.filter((x) => x.languageId === l);
      if (!a.length) continue;
      const level = computeLevel(a);
      const score = Math.round((a.filter((x) => x.correct).length / a.length) * 100);
      result[l] = { level, levelName: LEVEL_NAMES[level], score, answered: a.length };
      await applySkillLevel(user.id, l, level, 'placement', { score, answered: a.length });
    }
    await prisma.user.update({ where: { id: user.id }, data: { onboardingDone: true } });
    await logActivity(user.id, 'placement', 'Évaluation de niveau terminée', result);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const rewards = await reward(fresh, { xp: 20 });
    return { result, rewards };
  });

  /** « Commencer de zéro » : tous les langages au niveau débutant absolu. */
  app.post('/placement/skip', async (req) => {
    const user = requireUser(req);
    for (const l of LANGS) await applySkillLevel(user.id, l, 1, 'manual');
    await prisma.user.update({ where: { id: user.id }, data: { onboardingDone: true } });
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const rewards = await reward(fresh, { xp: 0 });
    return { ok: true, rewards };
  });
}

/**
 * Applique un niveau à un langage : les chapitres des catégories inférieures
 * sont marqués « passés » (accessibles, non comptés comme terminés).
 */
export async function applySkillLevel(userId: string, languageId: string, level: number, source: string, details?: object) {
  await prisma.skillProfile.upsert({
    where: { userId_languageId: { userId, languageId } },
    create: { userId, languageId, level, source, details: details as any },
    update: { level, source, details: details as any },
  });
  const below = await prisma.chapter.findMany({ where: { languageId, level: { lt: level } }, select: { id: true } });
  for (const c of below) {
    await prisma.chapterProgress.upsert({
      where: { userId_chapterId: { userId, chapterId: c.id } },
      create: { userId, chapterId: c.id, completedAt: new Date(), skipped: true },
      update: {},
    });
  }
  // Abaisser le niveau ré-ouvre les chapitres passés (non réellement terminés) des niveaux supérieurs
  await prisma.chapterProgress.deleteMany({
    where: { userId, skipped: true, examPassed: false, chapter: { languageId, level: { gte: level } } },
  });
}
