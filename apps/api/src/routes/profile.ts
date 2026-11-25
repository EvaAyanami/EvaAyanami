import { consumeRun, planStatus } from '../lib/plan.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { destroySession, publicUser, requireUser, verifyPassword } from '../lib/auth.js';
import { badRequest, forbidden } from '../lib/http.js';
import { runCode } from '../lib/runner.js';
import { explainError, parseDiagnostics } from '../lib/diagnostics.js';
import { logActivity, checkAchievements } from '../lib/gamification.js';
import { LEVEL_NAMES } from '../lib/levels.js';
import { parse } from './auth.js';
import { applySkillLevel } from './placement.js';
import { LANGS } from './exercises.js';

/** Modèles de fichiers de l'IDE. */
export const TEMPLATES: Record<string, { fileName: string; code: string }> = {
  rust: {
    fileName: 'main.rs',
    code: `use std::io::{self, Read};

fn main() {
    // Lecture de toute l'entrée standard
    let mut entree = String::new();
    io::stdin().read_to_string(&mut entree).unwrap();

    println!("Bonjour depuis Rust ! 🦀");
    if !entree.trim().is_empty() {
        println!("Tu as saisi : {}", entree.trim());
    }
}
`,
  },
  cpp: {
    fileName: 'main.cpp',
    code: `#include <iostream>
#include <string>

int main() {
    std::cout << "Bonjour depuis C++ !" << std::endl;

    std::string ligne;
    while (std::getline(std::cin, ligne)) {
        std::cout << "Tu as saisi : " << ligne << '\\n';
    }
    return 0;
}
`,
  },
  java: {
    fileName: 'Main.java',
    code: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        System.out.println("Bonjour depuis Java !");

        Scanner sc = new Scanner(System.in);
        while (sc.hasNextLine()) {
            System.out.println("Tu as saisi : " + sc.nextLine());
        }
    }
}
`,
  },
};

export default async function profileRoutes(app: FastifyInstance) {
  app.patch('/me', async (req) => {
    const user = requireUser(req);
    const body = parse(
      z.object({
        displayName: z.string().min(1).max(40).optional(),
        theme: z.enum(['light', 'dark', 'system']).optional(),
        timezone: z.string().max(60).optional(),
        dailyGoalXp: z.number().int().min(10).max(500).optional(),
        leaderboardOptIn: z.boolean().optional(),
      }),
      req.body,
    );
    if (body.timezone) {
      try {
        new Intl.DateTimeFormat('fr', { timeZone: body.timezone });
      } catch {
        throw badRequest('Fuseau horaire invalide');
      }
    }
    const u = await prisma.user.update({ where: { id: user.id }, data: body });
    return { user: publicUser(u) };
  });

  app.get('/me/skills', async (req) => {
    const user = requireUser(req);
    const skills = await prisma.skillProfile.findMany({ where: { userId: user.id } });
    return LANGS.map((l) => {
      const s = skills.find((x) => x.languageId === l);
      return { language: l, level: s?.level ?? 1, levelName: LEVEL_NAMES[s?.level ?? 1], source: s?.source ?? 'default', details: s?.details ?? null, updatedAt: s?.updatedAt ?? null };
    });
  });

  /** Le niveau d'un langage ne se modifie plus à la main (anti-triche) : évaluation, examens, ou administrateur. */
  app.put<{ Params: { lang: string } }>('/me/skills/:lang', async (req) => {
    const user = requireUser(req);
    if (user.role !== 'ADMIN') throw forbidden("Ton niveau évolue avec l'évaluation et les examens. Seul un administrateur peut le modifier.");
    if (!LANGS.includes(req.params.lang)) throw badRequest('Langage inconnu');
    const body = parse(z.object({ level: z.number().int().min(1).max(5) }), req.body);
    await applySkillLevel(user.id, req.params.lang, body.level, 'manual');
    await logActivity(user.id, 'skill', `Niveau ${req.params.lang} réglé sur « ${LEVEL_NAMES[body.level]} »`);
    return { ok: true };
  });

  /** Réinitialise la progression d'un chapitre (pour le refaire). */
  app.post<{ Params: { slug: string } }>('/me/chapters/:slug/reset', async (req) => {
    const user = requireUser(req);
    const ch = await prisma.chapter.findUnique({ where: { slug: req.params.slug } });
    if (!ch) throw badRequest('Chapitre inconnu');
    await prisma.chapterProgress.deleteMany({ where: { userId: user.id, chapterId: ch.id } });
    await prisma.exerciseProgress.updateMany({ where: { userId: user.id, exercise: { chapterId: ch.id } }, data: { draft: null } });
    return { ok: true };
  });

  app.post('/me/delete', async (req, reply) => {
    const user = requireUser(req);
    const body = parse(z.object({ password: z.string() }), req.body);
    if (!(await verifyPassword(user.passwordHash, body.password))) throw badRequest('Mot de passe incorrect');
    if (user.role === 'ADMIN' && (await prisma.user.count({ where: { role: 'ADMIN' } })) <= 1) throw badRequest('Impossible de supprimer le dernier administrateur');
    await destroySession(req, reply);
    await prisma.user.delete({ where: { id: user.id } });
    return { ok: true };
  });

  /* ---------------- IDE libre ---------------- */
  app.get('/ide/templates', async () => TEMPLATES);

  app.post('/ide/run', { config: { rateLimit: { max: config.runLimitPerMinute, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ language: z.enum(['rust', 'cpp', 'java']), code: z.string().min(1).max(100_000), stdin: z.string().max(100_000).default(''), compileOnly: z.boolean().default(false) }), req.body);
    await consumeRun(user);
    const raw = await runCode(body.language, body.code, body.compileOnly ? [] : [body.stdin]);
    const run = raw.tests[0];
    const ok = raw.compile.ok && (body.compileOnly || run?.exitCode === 0);
    if (ok) {
      await logActivity(user.id, 'ide_run_ok', `Programme ${body.language} exécuté dans l'IDE`);
      await checkAchievements(user);
    }
    return {
      compile: { ...raw.compile, diagnostics: parseDiagnostics(body.language, raw.compile.stderr) },
      run: run ?? null,
      help: !raw.compile.ok ? explainError(body.language, raw.compile.stderr, raw.compile.exitCode) : run && run.exitCode !== 0 ? explainError(body.language, run.stderr, run.exitCode) : [],
      error: raw.error,
      plan: await planStatus(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })),
    };
  });

  app.get('/ide/snippets', async (req) => {
    const user = requireUser(req);
    return prisma.snippet.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' } });
  });

  app.post('/ide/snippets', async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ id: z.string().optional(), language: z.enum(['rust', 'cpp', 'java']), name: z.string().min(1).max(80), code: z.string().max(100_000) }), req.body);
    if (body.id) {
      const s = await prisma.snippet.findFirst({ where: { id: body.id, userId: user.id } });
      if (s) return prisma.snippet.update({ where: { id: s.id }, data: { name: body.name, code: body.code, language: body.language } });
    }
    if ((await prisma.snippet.count({ where: { userId: user.id } })) >= 100) throw badRequest('Limite de 100 fichiers atteinte');
    return prisma.snippet.create({ data: { userId: user.id, language: body.language, name: body.name, code: body.code } });
  });

  app.delete<{ Params: { id: string } }>('/ide/snippets/:id', async (req) => {
    const user = requireUser(req);
    await prisma.snippet.deleteMany({ where: { id: req.params.id, userId: user.id } });
    return { ok: true };
  });
}
