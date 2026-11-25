import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { aiAllowed } from '../lib/plan.js';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { requireUser } from '../lib/auth.js';
import { notFound } from '../lib/http.js';
import { explainError, parseDiagnostics } from '../lib/diagnostics.js';
import { aiAvailable, aiChat, tutorSystemPrompt } from '../lib/ai.js';
import { findGlossary, getGlossary } from '../lib/glossary.js';
import { publicExercise } from '../lib/grading.js';
import { LEVEL_NAMES } from '../lib/levels.js';
import { parse } from './auth.js';

export const MASCOT = 'Kiri';
const LABEL: Record<string, string> = { rust: 'Rust', cpp: 'C++', java: 'Java' };

/** Exercices générés par IA : conservés en mémoire (notation côté serveur). */
const generated = new Map<string, { answer: number; explanation: string; expires: number }>();

async function context(userId: string, ctx: { language?: string; chapterSlug?: string; exerciseId?: string }) {
  const chapter = ctx.chapterSlug ? await prisma.chapter.findUnique({ where: { slug: ctx.chapterSlug } }) : null;
  const exercise = ctx.exerciseId ? await prisma.exercise.findUnique({ where: { id: ctx.exerciseId } }) : null;
  const language = ctx.language ?? chapter?.languageId ?? exercise?.language ?? undefined;
  const skill = language ? await prisma.skillProfile.findUnique({ where: { userId_languageId: { userId, languageId: language } } }) : null;
  return { chapter, exercise, language, level: LEVEL_NAMES[skill?.level ?? 1] };
}

function comparisonMarkdown(g: Awaited<ReturnType<typeof getGlossary>>[number]) {
  return [`### ${g.title}`, g.summary, g.rust && `**Rust** — ${g.rust}`, g.cpp && `**C++** — ${g.cpp}`, g.java && `**Java** — ${g.java}`].filter(Boolean).join('\n\n');
}

export default async function assistantRoutes(app: FastifyInstance) {
  app.get('/assistant/status', async (req) => {
    const configured = await aiAvailable();
    const allowed = req.user ? await aiAllowed(req.user) : false;
    return { ai: configured && allowed, aiConfigured: configured, premiumOnly: configured && !allowed, mascot: MASCOT, provider: config.ai.provider };
  });

  /** Explication pédagogique d'une erreur de compilation / d'exécution. */
  app.post('/assistant/explain', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ language: z.enum(['rust', 'cpp', 'java']), stderr: z.string().max(20000), exitCode: z.number().int().optional(), code: z.string().max(50000).optional() }), req.body);
    const local = explainError(body.language, body.stderr, body.exitCode);
    let ai: string | null = null;
    if (body.code && (await aiAvailable()) && (await aiAllowed(user))) {
      const ctx = await context(user.id, { language: body.language });
      ai = await aiChat([
        { role: 'system', content: tutorSystemPrompt({ appName: config.appName, mascot: MASCOT, language: LABEL[body.language], level: ctx.level }) },
        {
          role: 'user',
          content: `Explique simplement cette erreur et indique comment la corriger SANS réécrire tout le programme.\n\nCode :\n\`\`\`\n${body.code.slice(0, 6000)}\n\`\`\`\n\nErreur :\n\`\`\`\n${body.stderr.slice(0, 3000)}\n\`\`\``,
        },
      ]);
    }
    return { explanations: local, diagnostics: parseDiagnostics(body.language, body.stderr), ai };
  });

  /** Discussion libre avec l'assistante, contextualisée (chapitre, exercice, niveau). */
  app.post('/assistant/ask', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireUser(req);
    const body = parse(
      z.object({
        message: z.string().min(1).max(4000),
        history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) })).max(12).default([]),
        context: z.object({ language: z.string().optional(), chapterSlug: z.string().optional(), exerciseId: z.string().optional(), code: z.string().max(20000).optional() }).default({}),
      }),
      req.body,
    );
    const ctx = await context(user.id, body.context);
    if ((await aiAvailable()) && (await aiAllowed(user))) {
      const exText = ctx.exercise ? `${ctx.exercise.title}\n${ctx.exercise.prompt}${body.context.code ? `\n\nCode actuel de l'apprenant :\n${body.context.code.slice(0, 6000)}` : ''}` : undefined;
      const answer = await aiChat([
        {
          role: 'system',
          content: tutorSystemPrompt({ appName: config.appName, mascot: MASCOT, chapter: ctx.chapter?.title, language: ctx.language ? LABEL[ctx.language] : undefined, level: ctx.level, exercise: exText }),
        },
        ...body.history,
        { role: 'user', content: body.message },
      ]);
      if (answer) return { answer, source: 'ai' };
    }
    // ---- Mode sans IA : réponses construites à partir du contenu de la plateforme ----
    const msg = body.message.toLowerCase();
    const parts: string[] = [];
    const errorLike = /error|erreur|exception|panicked|expected|cannot|undefined reference/i.test(body.message) && body.message.length > 30;
    if (errorLike && ctx.language) {
      const ex = explainError(ctx.language, body.message);
      parts.push(...ex.map((e) => `### ${e.title}\n${e.explanation}\n\n💡 ${e.tip}`));
    }
    const entries = await findGlossary(body.message + ' ' + (ctx.exercise?.concepts.join(' ') ?? ''));
    const wantsCompare = /compar|différence|difference|vs|versus|entre/.test(msg);
    for (const g of entries.slice(0, wantsCompare ? 2 : 1)) {
      if (wantsCompare || !ctx.language) parts.push(comparisonMarkdown(g));
      else parts.push(`### ${g.title}\n${g.summary}\n\n${(g as any)[ctx.language] ?? ''}`);
    }
    if (!parts.length && ctx.chapter) {
      const sections = ctx.chapter.sections as { title: string; body: string }[];
      parts.push(`Dans le chapitre **${ctx.chapter.title}**, retiens l'essentiel :\n\n${ctx.chapter.summary}\n\nSections à relire : ${sections.map((s) => `« ${s.title} »`).join(', ')}.`);
    }
    if (!parts.length) {
      parts.push(
        `Je n'ai pas trouvé de notion précise dans ta question. Essaie de mentionner un mot-clé (par exemple *ownership*, *pointeur*, *interface*, *boucle*), ou colle directement le message d'erreur du compilateur : je l'expliquerai.\n\nTu peux aussi utiliser le bouton **Indice** de l'exercice : il propose trois niveaux d'aide progressifs.`,
      );
    }
    return { answer: parts.join('\n\n---\n\n'), source: 'local' };
  });

  app.get('/assistant/glossary', async () => {
    const list = await getGlossary();
    return list.map((g) => ({ concept: g.concept, title: g.title, summary: g.summary, rust: g.rust, cpp: g.cpp, java: g.java }));
  });

  /** Reformulation d'une section de cours. */
  app.post('/assistant/reformulate', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ chapterSlug: z.string(), section: z.number().int().min(0) }), req.body);
    const ctx = await context(user.id, { chapterSlug: body.chapterSlug });
    if (!ctx.chapter) throw notFound('Chapitre');
    const section = (ctx.chapter.sections as { title: string; body: string }[])[body.section];
    if (!section) throw notFound('Section');
    if ((await aiAvailable()) && (await aiAllowed(user))) {
      const answer = await aiChat(
        [
          { role: 'system', content: tutorSystemPrompt({ appName: config.appName, mascot: MASCOT, chapter: ctx.chapter.title, language: LABEL[ctx.language!], level: ctx.level }) },
          { role: 'user', content: `Reformule plus simplement cette partie du cours, avec une analogie de la vie courante et un petit exemple différent :\n\n${section.body.slice(0, 6000)}` },
        ],
        900,
      );
      if (answer) return { answer, source: 'ai' };
    }
    const entries = await findGlossary(`${section.title} ${section.body.slice(0, 1500)} ${ctx.chapter.concepts.join(' ')}`);
    const answer = [
      `**En bref :** ${ctx.chapter.summary}`,
      ...entries.slice(0, 2).map((g) => `### ${g.title}\n${g.summary}\n\n${(g as any)[ctx.language!] ?? ''}`),
      'Astuce : relis les exemples de code de la section, puis modifie-les dans l’IDE pour observer ce qui change. Expérimenter est la meilleure façon de comprendre !',
    ].join('\n\n');
    return { answer, source: 'local' };
  });

  /** Exercices supplémentaires : générés par IA si disponible, sinon sélectionnés dans la banque. */
  app.post('/assistant/practice', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ chapterSlug: z.string() }), req.body);
    const ctx = await context(user.id, { chapterSlug: body.chapterSlug });
    if (!ctx.chapter) throw notFound('Chapitre');
    if ((await aiAvailable()) && (await aiAllowed(user))) {
      const raw = await aiChat(
        [
          { role: 'system', content: 'Tu génères des QCM de programmation en français. Réponds UNIQUEMENT avec du JSON valide.' },
          {
            role: 'user',
            content: `Génère 3 questions à choix multiples sur le chapitre « ${ctx.chapter.title} » (${LABEL[ctx.language!]}, niveau ${ctx.level}). Notions : ${ctx.chapter.concepts.join(', ')}.
Format : [{"prompt": "...", "code": "code optionnel ou null", "choices": ["a","b","c","d"], "answer": 0, "explanation": "..."}]`,
          },
        ],
        1500,
      );
      try {
        const json = JSON.parse((raw ?? '').replace(/^```(json)?|```$/gm, '').trim()) as { prompt: string; code?: string | null; choices: string[]; answer: number; explanation: string }[];
        const items = json
          .filter((q) => q.prompt && Array.isArray(q.choices) && q.choices.length >= 2 && Number.isInteger(q.answer) && q.answer < q.choices.length)
          .slice(0, 5)
          .map((q) => {
            const id = `gen-${randomUUID()}`;
            generated.set(id, { answer: q.answer, explanation: q.explanation, expires: Date.now() + 3600_000 });
            return { id, type: 'mcq', generated: true, prompt: q.prompt, code: q.code ?? null, choices: q.choices, multiple: false, language: ctx.language };
          });
        if (items.length) return { items, source: 'ai' };
      } catch {
        /* repli sur la banque */
      }
    }
    // Sans IA : exercices liés aux mêmes notions, en priorité non résolus
    const pool = await prisma.exercise.findMany({
      where: {
        language: ctx.language,
        kind: 'practice',
        type: { in: ['mcq', 'predict', 'fill', 'order'] },
        OR: [{ concepts: { hasSome: ctx.chapter.concepts } }, { chapterId: ctx.chapter.id }],
        progress: { none: { userId: user.id, solved: true } },
      },
      take: 30,
    });
    const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 4);
    return { items: shuffled.map((e) => ({ ...publicExercise(e), generated: false })), source: 'local' };
  });

  app.post<{ Params: { id: string } }>('/assistant/practice/:id/answer', async (req) => {
    requireUser(req);
    const body = parse(z.object({ choice: z.number().int() }), req.body);
    for (const [k, v] of generated) if (v.expires < Date.now()) generated.delete(k);
    const g = generated.get(req.params.id);
    if (!g) throw notFound('Question');
    return { correct: g.answer === body.choice, reveal: { answer: g.answer }, explanation: g.explanation };
  });
}
