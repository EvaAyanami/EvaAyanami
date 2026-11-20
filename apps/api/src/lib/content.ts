/**
 * Format du contenu pédagogique (fichiers YAML dans /content) et import en base.
 *
 * Le contenu est versionné sous forme de fichiers structurés, importé en base
 * au démarrage (ou via `npm run db:seed`) puis modifiable dans l'administration.
 * Les éléments modifiés via l'administration sont marqués `customized` et ne
 * sont pas écrasés par un import ultérieur (sauf import forcé).
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

const LANGS = ['rust', 'cpp', 'java'] as const;

const testCase = z.object({
  name: z.string().optional(),
  input: z.string().default(''),
  output: z.string(),
  hidden: z.boolean().default(false),
  match: z.enum(['exact', 'trim', 'contains', 'regex']).default('trim'),
});
export type TestCase = z.infer<typeof testCase>;

const rule = z.object({ pattern: z.string(), message: z.string(), flags: z.string().optional() });
export type Rule = z.infer<typeof rule>;

const base = {
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, 'identifiant en minuscules'),
  title: z.string().optional(),
  prompt: z.string(),
  difficulty: z.number().int().min(1).max(3).default(1),
  concepts: z.array(z.string()).default([]),
  hints: z.array(z.string()).default([]),
  explanation: z.string().default(''),
  xp: z.number().int().optional(),
};

const mcq = z.object({
  ...base,
  type: z.literal('mcq'),
  choices: z.array(z.string()).min(2),
  answer: z.union([z.number().int(), z.array(z.number().int())]),
  code: z.string().optional(),
});
const fill = z.object({
  ...base,
  type: z.literal('fill'),
  code: z.string().refine((c) => c.includes('{{?}}'), 'le code doit contenir au moins un trou {{?}}'),
  blanks: z.array(z.array(z.string()).min(1)),
  tests: z.array(testCase).optional(),
});
const order = z.object({
  ...base,
  type: z.literal('order'),
  lines: z.array(z.string()).min(2),
  alternatives: z.array(z.array(z.number().int())).optional(),
});
const predict = z.object({
  ...base,
  type: z.literal('predict'),
  code: z.string(),
  input: z.string().optional(),
  output: z.string(),
});
const bugfix = z.object({
  ...base,
  type: z.literal('bugfix'),
  code: z.string(),
  bugLines: z.array(z.number().int().min(1)).min(1),
  choices: z.array(z.string()).min(2),
  answer: z.number().int(),
  solution: z.string(),
  tests: z.array(testCase).min(1),
});
const code = z.object({
  ...base,
  type: z.literal('code'),
  starter: z.string(),
  solution: z.string(),
  tests: z.array(testCase).min(1),
  require: z.array(rule).default([]),
  forbid: z.array(rule).default([]),
});

export const exerciseSchema = z.discriminatedUnion('type', [mcq, fill, order, predict, bugfix, code]);
export type ExerciseDef = z.infer<typeof exerciseSchema>;

const section = z.object({ title: z.string(), body: z.string() });

const chapterSchema = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  minutes: z.number().int().default(20),
  concepts: z.array(z.string()).default([]),
  sections: z.array(section).min(1),
  exercises: z.array(exerciseSchema).min(1),
  project: code.extend({ title: z.string() }),
  exam: z.object({ pass: z.number().int().default(70), questions: z.array(exerciseSchema).min(3) }),
});
export type ChapterDef = z.infer<typeof chapterSchema>;

const levelFileSchema = z.object({
  language: z.enum(LANGS),
  level: z.number().int().min(1).max(5),
  chapters: z.array(chapterSchema),
});

const perLang = z.object({ rust: z.string().optional(), cpp: z.string().optional(), java: z.string().optional() });

const projectStep = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  hints: z.array(z.string()).default([]),
  starters: perLang,
  solutions: perLang,
  tests: z.array(testCase).min(1),
  xp: z.number().int().default(30),
});

const projectSchema = z.object({
  slug: z.string(),
  level: z.number().int().min(1).max(5),
  title: z.string(),
  summary: z.string(),
  description: z.string(),
  objectives: z.array(z.string()),
  constraints: z.array(z.string()),
  languages: z.array(z.enum(LANGS)),
  steps: z.array(projectStep).min(1),
});
export type ProjectDef = z.infer<typeof projectSchema>;

const languageSchema = z.object({
  id: z.string(),
  name: z.string(),
  tagline: z.string(),
  description: z.string(),
  color: z.string(),
  version: z.string(),
  fileName: z.string(),
  order: z.number().int(),
});

const placementSchema = z.object({
  language: z.enum(LANGS),
  questions: z.array(exerciseSchema.and(z.object({ level: z.number().int().min(1).max(5) }))),
});

const achievementSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  icon: z.string(),
  xp: z.number().int().default(20),
  hidden: z.boolean().default(false),
  condition: z.object({ type: z.string(), threshold: z.number().default(1), language: z.string().optional(), concept: z.string().optional() }),
});

export interface ContentBundle {
  languages: z.infer<typeof languageSchema>[];
  levels: (z.infer<typeof levelFileSchema> & { file: string })[];
  projects: (ProjectDef & { file: string })[];
  placement: z.infer<typeof placementSchema>[];
  achievements: z.infer<typeof achievementSchema>[];
  glossary: GlossaryEntry[];
}

export interface GlossaryEntry {
  concept: string;
  title: string;
  keywords: string[];
  summary: string;
  rust?: string;
  cpp?: string;
  java?: string;
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)));
    else if (/\.ya?ml$/.test(name)) out.push(p);
  }
  return out.sort();
}

function fmtZod(file: string, e: z.ZodError) {
  return e.issues.map((i) => `${file}: ${i.path.join('.')} — ${i.message}`).join('\n');
}

/** Charge et valide l'ensemble du contenu. Lève une erreur détaillée si invalide. */
export async function loadContent(dir: string): Promise<ContentBundle> {
  const bundle: ContentBundle = { languages: [], levels: [], projects: [], placement: [], achievements: [], glossary: [] };
  const errors: string[] = [];
  for (const file of await walk(dir)) {
    const rel = relative(dir, file);
    let data: unknown;
    try {
      data = YAML.parse(await readFile(file, 'utf8'));
    } catch (e) {
      errors.push(`${rel}: YAML invalide — ${(e as Error).message}`);
      continue;
    }
    const parse = <S extends z.ZodTypeAny>(schema: S, d: unknown): z.output<S> | undefined => {
      const r = schema.safeParse(d);
      if (!r.success) errors.push(fmtZod(rel, r.error));
      return r.success ? r.data : undefined;
    };
    if (rel === 'languages.yaml') bundle.languages = parse(z.array(languageSchema), data) ?? [];
    else if (rel === 'achievements.yaml') bundle.achievements = parse(z.array(achievementSchema), data) ?? [];
    else if (rel === 'glossary.yaml') bundle.glossary = (data as GlossaryEntry[]) ?? [];
    else if (rel.startsWith('placement')) {
      const p = parse(placementSchema, data);
      if (p) bundle.placement.push(p);
    } else if (rel.startsWith('projects')) {
      const p = parse(z.array(projectSchema), data);
      if (p) bundle.projects.push(...p.map((x) => ({ ...x, file: rel })));
    } else {
      const l = parse(levelFileSchema, data);
      if (l) bundle.levels.push({ ...l, file: rel });
    }
  }
  // Unicité des identifiants
  const ids = new Map<string, string>();
  const slugs = new Set<string>();
  const check = (id: string, where: string) => {
    if (ids.has(id)) errors.push(`Identifiant d'exercice dupliqué « ${id} » (${where} et ${ids.get(id)})`);
    ids.set(id, where);
  };
  for (const lvl of bundle.levels) {
    for (const ch of lvl.chapters) {
      if (slugs.has(ch.slug)) errors.push(`Slug de chapitre dupliqué « ${ch.slug} »`);
      slugs.add(ch.slug);
      for (const ex of [...ch.exercises, ch.project, ...ch.exam.questions]) check(ex.id, lvl.file);
      for (const ex of [...ch.exercises, ...ch.exam.questions]) {
        if ((ex.type === 'mcq' || ex.type === 'bugfix') && ![ex.answer].flat().every((a) => a >= 0 && a < ex.choices.length))
          errors.push(`${lvl.file}: ${ex.id} — index de réponse hors limites`);
        if (ex.type === 'fill' && ex.blanks.length !== ex.code.split('{{?}}').length - 1)
          errors.push(`${lvl.file}: ${ex.id} — nombre de trous (${ex.code.split('{{?}}').length - 1}) ≠ nombre de réponses (${ex.blanks.length})`);
      }
    }
  }
  for (const p of bundle.projects) for (const s of p.steps) check(s.id, p.file);
  for (const p of bundle.placement) for (const q of p.questions) check(q.id, `placement-${p.language}`);
  if (errors.length) throw new Error(`Contenu invalide :\n${errors.join('\n')}`);
  return bundle;
}

/* ------------------------------------------------------------------ */
/* Conversion définition → lignes Exercise (public / privé)            */
/* ------------------------------------------------------------------ */

const DEFAULT_XP: Record<string, number> = { mcq: 5, order: 8, predict: 8, fill: 10, bugfix: 15, code: 20 };

export function splitExercise(ex: ExerciseDef): { content: Prisma.InputJsonValue; solution: Prisma.InputJsonValue } {
  switch (ex.type) {
    case 'mcq':
      return {
        content: { choices: ex.choices, multiple: Array.isArray(ex.answer), code: ex.code ?? null },
        solution: { answer: ex.answer, explanation: ex.explanation },
      };
    case 'fill':
      return {
        content: { code: ex.code, blankCount: ex.blanks.length, compiled: !!ex.tests?.length },
        solution: { blanks: ex.blanks, tests: ex.tests ?? [], explanation: ex.explanation },
      };
    case 'order':
      return {
        content: { lines: ex.lines },
        solution: { alternatives: ex.alternatives ?? [], explanation: ex.explanation },
      };
    case 'predict':
      return {
        content: { code: ex.code, input: ex.input ?? '' },
        solution: { output: ex.output, explanation: ex.explanation },
      };
    case 'bugfix':
      return {
        content: { code: ex.code, choices: ex.choices, visibleTests: ex.tests.filter((t) => !t.hidden) },
        solution: { bugLines: ex.bugLines, answer: ex.answer, solution: ex.solution, tests: ex.tests, explanation: ex.explanation },
      };
    case 'code':
      return {
        content: { starter: ex.starter, visibleTests: ex.tests.filter((t) => !t.hidden), rules: ex.require.map((r) => r.message) },
        solution: { solution: ex.solution, tests: ex.tests, require: ex.require, forbid: ex.forbid, explanation: ex.explanation },
      };
  }
}

function exerciseRow(
  ex: ExerciseDef,
  extra: { kind: string; language: string | null; level: number; order: number; chapterId?: string; projectId?: string },
) {
  const { content, solution } = splitExercise(ex);
  return {
    id: ex.id,
    kind: extra.kind,
    type: ex.type,
    language: extra.language,
    chapterId: extra.chapterId ?? null,
    projectId: extra.projectId ?? null,
    level: extra.level,
    difficulty: ex.difficulty,
    order: extra.order,
    title: ex.title ?? '',
    prompt: ex.prompt,
    concepts: ex.concepts,
    content,
    solution,
    hints: ex.hints,
    xp: ex.xp ?? DEFAULT_XP[ex.type] * (extra.kind === 'miniproject' ? 3 : 1) + (ex.difficulty - 1) * 5,
  };
}

async function upsertExercise(row: Omit<ReturnType<typeof exerciseRow>, 'type'> & { type: string }, force: boolean) {
  const existing = await prisma.exercise.findUnique({ where: { id: row.id }, select: { customized: true } });
  if (existing?.customized && !force) return;
  await prisma.exercise.upsert({ where: { id: row.id }, create: row, update: { ...row, customized: false } });
}

/** Importe le contenu en base de façon idempotente. */
export async function importContent(bundle: ContentBundle, { force = false, log = console.log } = {}) {
  let chapters = 0;
  let exercises = 0;
  for (const l of bundle.languages) {
    await prisma.language.upsert({ where: { id: l.id }, create: l, update: l });
  }
  const orderCounter = new Map<string, number>();
  for (const lvl of bundle.levels) {
    for (const ch of lvl.chapters) {
      const key = `${lvl.language}-${lvl.level}`;
      const i = orderCounter.get(key) ?? 0;
      orderCounter.set(key, i + 1);
      const existing = await prisma.chapter.findUnique({ where: { slug: ch.slug } });
      const data = {
        slug: ch.slug,
        languageId: lvl.language,
        level: lvl.level,
        order: i,
        title: ch.title,
        summary: ch.summary,
        concepts: ch.concepts,
        sections: ch.sections,
        minutes: ch.minutes,
        examPass: ch.exam.pass,
      };
      let chapterId = existing?.id;
      if (!existing) chapterId = (await prisma.chapter.create({ data })).id;
      else if (!existing.customized || force) await prisma.chapter.update({ where: { id: existing.id }, data: { ...data, customized: false } });
      chapters++;
      const common = { language: lvl.language, level: lvl.level, chapterId };
      for (const [j, ex] of ch.exercises.entries()) {
        await upsertExercise(exerciseRow(ex, { ...common, kind: 'practice', order: j }), force);
        exercises++;
      }
      await upsertExercise(exerciseRow(ch.project, { ...common, kind: 'miniproject', order: 100 }), force);
      for (const [j, ex] of ch.exam.questions.entries()) {
        await upsertExercise(exerciseRow(ex, { ...common, kind: 'exam', order: 200 + j }), force);
        exercises++;
      }
    }
  }
  for (const [i, p] of bundle.projects.entries()) {
    const data = {
      slug: p.slug,
      level: p.level,
      order: i,
      title: p.title,
      summary: p.summary,
      description: p.description,
      objectives: p.objectives,
      constraints: p.constraints,
      languages: p.languages,
    };
    const existing = await prisma.project.findUnique({ where: { slug: p.slug } });
    let projectId = existing?.id;
    if (!existing) projectId = (await prisma.project.create({ data })).id;
    else if (!existing.customized || force) await prisma.project.update({ where: { id: existing.id }, data });
    for (const [j, s] of p.steps.entries()) {
      const row = {
        id: s.id,
        kind: 'project',
        type: 'code',
        language: null,
        chapterId: null,
        projectId: projectId!,
        level: p.level,
        difficulty: Math.min(3, Math.max(1, p.level - 1)),
        order: j,
        title: s.title,
        prompt: s.prompt,
        concepts: [],
        content: { starters: s.starters, visibleTests: s.tests.filter((t) => !t.hidden), rules: [] },
        solution: { solutions: s.solutions, tests: s.tests, require: [], forbid: [], explanation: '' },
        hints: s.hints,
        xp: s.xp,
      };
      await upsertExercise(row, force);
      exercises++;
    }
  }
  for (const pl of bundle.placement) {
    for (const [j, q] of pl.questions.entries()) {
      await upsertExercise(exerciseRow(q, { kind: 'placement', language: pl.language, level: q.level, order: j }), force);
    }
  }
  for (const [i, a] of bundle.achievements.entries()) {
    await prisma.achievement.upsert({ where: { id: a.id }, create: { ...a, order: i }, update: { ...a, order: i } });
  }
  if (bundle.glossary.length) {
    const value = bundle.glossary as unknown as Prisma.InputJsonValue;
    await prisma.setting.upsert({ where: { key: 'glossary' }, create: { key: 'glossary', value }, update: { value } });
  }
  log(`Contenu importé : ${bundle.languages.length} langages, ${chapters} chapitres, ${exercises} exercices, ${bundle.projects.length} projets.`);
}
