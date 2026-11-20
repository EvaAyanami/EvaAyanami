/**
 * Notation des exercices côté serveur. Les réponses et tests cachés ne
 * quittent jamais le serveur ; le code est réellement compilé et exécuté
 * dans le bac à sable.
 */
import type { Exercise } from '@prisma/client';
import type { Rule, TestCase } from './content.js';
import { runCode, type RunnerResult } from './runner.js';
import { parseDiagnostics, explainError, type Diagnostic, type Explanation } from './diagnostics.js';
import { badRequest } from './http.js';

export interface TestReport {
  name: string;
  passed: boolean;
  hidden: boolean;
  input?: string;
  expected?: string;
  got?: string;
  stderr?: string;
  timeMs: number;
  timedOut: boolean;
  exitCode: number;
}

export interface GradeResult {
  correct: boolean;
  score: number; // 0..100
  feedback: string;
  explanation?: string;
  reveal?: unknown; // bonne réponse révélée après validation (exercices non compilés)
  compile?: { ok: boolean; stderr: string; stdout: string; diagnostics: Diagnostic[]; timeMs: number };
  tests?: TestReport[];
  rules?: { message: string; passed: boolean }[];
  parts?: Record<string, boolean>;
  help?: Explanation[];
  compiled?: boolean;
}

/* ---------- Normalisation et comparaison des sorties ---------- */

export function normalizeOutput(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n+$/, '')
    .replace(/^\n+/, '');
}

export function outputMatches(expected: string, got: string, mode: TestCase['match'] = 'trim'): boolean {
  switch (mode) {
    case 'exact':
      return expected === got;
    case 'contains':
      return normalizeOutput(got).includes(normalizeOutput(expected));
    case 'regex':
      return new RegExp(expected, 'm').test(got);
    default:
      return normalizeOutput(expected) === normalizeOutput(got);
  }
}

export const normalizeToken = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/\s*([(){}\[\];,.<>:&*=])\s*/g, '$1');

/** Retire commentaires et littéraux de chaînes pour vérifier les règles sur le code « réel ». */
export function stripCommentsAndStrings(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

export function checkRules(code: string, require: Rule[], forbid: Rule[]) {
  const clean = stripCommentsAndStrings(code);
  const results: { message: string; passed: boolean }[] = [];
  for (const r of require) results.push({ message: r.message, passed: new RegExp(r.pattern, r.flags ?? 'm').test(clean) });
  for (const r of forbid) results.push({ message: r.message, passed: !new RegExp(r.pattern, r.flags ?? 'm').test(clean) });
  return results;
}

/* ---------- Exécution de tests ---------- */

export async function runTests(language: string, source: string, tests: TestCase[]): Promise<Pick<GradeResult, 'compile' | 'tests' | 'help'> & { allPassed: boolean; raw: RunnerResult }> {
  const raw = await runCode(language, source, tests.map((t) => t.input));
  const diagnostics = parseDiagnostics(language, raw.compile.stderr);
  const compile = { ok: raw.compile.ok, stderr: raw.compile.stderr, stdout: raw.compile.stdout, diagnostics, timeMs: raw.compile.timeMs };
  if (raw.error && !raw.compile.ok && !raw.compile.stderr) compile.stderr = raw.error;
  const reports: TestReport[] = [];
  let helpText = raw.compile.ok ? '' : raw.compile.stderr;
  let exitForHelp: number | undefined = raw.compile.ok ? undefined : raw.compile.exitCode;
  if (raw.compile.ok) {
    tests.forEach((t, i) => {
      const r = raw.tests.find((x) => x.index === i);
      const passed = !!r && r.exitCode === 0 && !r.timedOut && outputMatches(t.output, r.stdout, t.match);
      if (r && !passed && !helpText) {
        helpText = r.stderr;
        exitForHelp = r.exitCode;
      }
      reports.push({
        name: t.name ?? `Test ${i + 1}`,
        passed,
        hidden: t.hidden,
        // Les tests cachés ne révèlent ni l'entrée ni la sortie attendue.
        input: t.hidden ? undefined : t.input,
        expected: t.hidden ? undefined : t.output,
        got: t.hidden ? undefined : r?.stdout.slice(0, 4000),
        stderr: r?.stderr.slice(0, 4000),
        timeMs: r?.timeMs ?? 0,
        timedOut: r?.timedOut ?? false,
        exitCode: r?.exitCode ?? -1,
      });
    });
  }
  const help = helpText || exitForHelp ? explainError(language, helpText, exitForHelp) : undefined;
  return { compile, tests: reports, help, allPassed: raw.compile.ok && reports.every((r) => r.passed), raw };
}

/* ---------- Notation par type ---------- */

export type Answer = {
  choice?: number | number[];
  blanks?: string[];
  order?: number[];
  output?: string;
  line?: number;
  code?: string;
};

type Sol = Record<string, any>;
type Content = Record<string, any>;

export function fillTemplate(template: string, blanks: string[]): string {
  let i = 0;
  return template.replace(/\{\{\?\}\}/g, () => blanks[i++] ?? '');
}

export async function grade(ex: Exercise, answer: Answer, language: string): Promise<GradeResult> {
  const sol = ex.solution as Sol;
  const content = ex.content as Content;
  const explanation = sol.explanation || undefined;

  switch (ex.type) {
    case 'mcq': {
      const expected = sol.answer as number | number[];
      if (answer.choice === undefined) throw badRequest('Choisis une réponse');
      // Les choix sont présentés mélangés : on ramène les positions affichées aux indices d'origine.
      const perm = choiceOrder(ex);
      const byNum = (a: number, b: number) => a - b;
      const want = [expected].flat().sort(byNum);
      const got = [answer.choice].flat().map((p) => perm[p] ?? -1).sort(byNum);
      const correct = want.length === got.length && want.every((v, i) => v === got[i]);
      const shown = (o: number) => perm.indexOf(o);
      return {
        correct,
        score: correct ? 100 : 0,
        feedback: correct ? 'Bonne réponse !' : 'Ce n’est pas la bonne réponse.',
        explanation,
        reveal: { answer: Array.isArray(expected) ? expected.map(shown) : shown(expected) },
      };
    }
    case 'predict': {
      if (typeof answer.output !== 'string') throw badRequest('Indique la sortie attendue');
      const correct = normalizeOutput(answer.output) === normalizeOutput(sol.output);
      return {
        correct,
        score: correct ? 100 : 0,
        feedback: correct ? 'Exactement ce qu’affiche le programme !' : 'La sortie réelle est différente.',
        explanation,
        reveal: { output: sol.output },
      };
    }
    case 'order': {
      const lines: string[] = content.lines;
      const got = answer.order;
      if (!Array.isArray(got) || got.length !== lines.length) throw badRequest('Ordre incomplet');
      const candidates: number[][] = [lines.map((_, i) => i), ...(sol.alternatives ?? [])];
      // Deux lignes identiques sont interchangeables : on compare le texte.
      const asText = (o: number[]) => o.map((i) => lines[i].trim()).join('\n');
      const correct = candidates.some((c) => asText(c) === asText(got));
      let wellPlaced = 0;
      got.forEach((v, i) => {
        if (lines[v]?.trim() === lines[i].trim()) wellPlaced++;
      });
      return {
        correct,
        score: correct ? 100 : Math.round((wellPlaced / lines.length) * 100),
        feedback: correct ? 'Le programme est dans le bon ordre !' : `${wellPlaced}/${lines.length} lignes sont bien placées.`,
        explanation,
        reveal: correct ? { order: lines.map((_, i) => i) } : undefined,
      };
    }
    case 'fill': {
      const blanks = answer.blanks;
      if (!Array.isArray(blanks) || blanks.length !== content.blankCount) throw badRequest('Remplis tous les trous');
      const accepted: string[][] = sol.blanks;
      const perBlank = blanks.map((b, i) => (accepted[i] ?? []).some((a) => normalizeToken(a) === normalizeToken(b)));
      if (sol.tests?.length) {
        // Exercice compilé : le programme complété doit compiler et passer les tests.
        const source = fillTemplate(content.code, blanks);
        const r = await runTests(language, source, sol.tests);
        const passed = r.tests!.filter((t) => t.passed).length;
        return {
          correct: r.allPassed,
          score: r.allPassed ? 100 : Math.round((passed / sol.tests.length) * 100),
          feedback: !r.compile!.ok
            ? 'Le programme complété ne compile pas.'
            : r.allPassed
              ? 'Le programme compile et donne le bon résultat !'
              : 'Le programme compile mais le résultat est incorrect.',
          explanation: r.allPassed ? explanation : undefined,
          compile: r.compile,
          tests: r.tests,
          help: r.help,
          compiled: true,
          parts: Object.fromEntries(perBlank.map((ok, i) => [`trou ${i + 1}`, ok])),
        };
      }
      const correct = perBlank.every(Boolean);
      return {
        correct,
        score: Math.round((perBlank.filter(Boolean).length / perBlank.length) * 100),
        feedback: correct ? 'Tous les trous sont correctement complétés !' : `${perBlank.filter(Boolean).length}/${perBlank.length} trous corrects.`,
        explanation,
        parts: Object.fromEntries(perBlank.map((ok, i) => [`trou ${i + 1}`, ok])),
        reveal: correct ? { blanks: accepted.map((a) => a[0]) } : undefined,
      };
    }
    case 'bugfix': {
      const parts: Record<string, boolean> = {};
      parts['ligne'] = typeof answer.line === 'number' && (sol.bugLines as number[]).includes(answer.line);
      parts['explication'] = typeof answer.choice === 'number' && choiceOrder(ex)[answer.choice] === sol.answer;
      let compile: GradeResult['compile'];
      let tests: TestReport[] | undefined;
      let help: Explanation[] | undefined;
      if (typeof answer.code === 'string' && answer.code.trim()) {
        const r = await runTests(language, answer.code, sol.tests);
        parts['correction'] = r.allPassed;
        compile = r.compile;
        tests = r.tests;
        help = r.help;
      } else parts['correction'] = false;
      const ok = Object.values(parts).filter(Boolean).length;
      const correct = ok === 3;
      return {
        correct,
        score: Math.round((ok / 3) * 100),
        feedback: correct
          ? 'Bug identifié, expliqué et corrigé !'
          : [
              !parts['ligne'] && 'la ligne fautive n’est pas la bonne',
              !parts['explication'] && 'l’explication choisie est incorrecte',
              !parts['correction'] && 'la correction ne passe pas les tests',
            ]
              .filter(Boolean)
              .join(' ; ')
              .replace(/^./, (c) => c.toUpperCase()) + '.',
        explanation: correct ? explanation : undefined,
        parts,
        compile,
        tests,
        help,
        compiled: true,
      };
    }
    case 'code': {
      if (typeof answer.code !== 'string' || !answer.code.trim()) throw badRequest('Écris ton programme avant de valider');
      const rules = checkRules(answer.code, sol.require ?? [], sol.forbid ?? []);
      const r = await runTests(language, answer.code, sol.tests);
      const passed = r.tests!.filter((t) => t.passed).length;
      const rulesOk = rules.every((x) => x.passed);
      const correct = r.allPassed && rulesOk;
      let feedback: string;
      if (!r.compile!.ok) feedback = 'Erreur de compilation — consulte les explications ci-dessous.';
      else if (!r.allPassed) feedback = `${passed}/${sol.tests.length} tests réussis.`;
      else if (!rulesOk) feedback = 'Tous les tests passent, mais certaines consignes ne sont pas respectées.';
      else feedback = `Bravo ! ${passed}/${sol.tests.length} tests réussis (dont tests cachés).`;
      return {
        correct,
        score: Math.round(((passed / sol.tests.length) * 0.8 + (rulesOk ? 0.2 : 0)) * 100),
        feedback,
        explanation: correct ? explanation : undefined,
        compile: r.compile,
        tests: r.tests,
        rules,
        help: r.help,
        compiled: true,
      };
    }
  }
  throw badRequest(`Type d'exercice inconnu : ${ex.type}`);
}

/** Pour les projets multi-langages, la solution/les tests dépendent du langage. */
export function projectSolution(ex: Exercise, language: string) {
  const sol = ex.solution as Sol;
  return sol.solutions?.[language] as string | undefined;
}

/* ---------- Vue publique (sans réponses) ---------- */

function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  // Évite de présenter l'ordre déjà correct
  if (out.every((v, i) => v === arr[i]) && out.length > 1) [out[0], out[1]] = [out[1], out[0]];
  return out;
}

/**
 * Ordre de présentation des choix (QCM, explications des bugs) : une permutation stable,
 * propre à chaque exercice, pour que la bonne réponse ne soit pas toujours au même endroit.
 * La position affichée p correspond au choix d'origine perm[p].
 */
export function choiceOrder(ex: Exercise): number[] {
  const n = ((ex.content as Content).choices as unknown[] | undefined)?.length ?? 0;
  return seededShuffle(Array.from({ length: n }, (_, i) => i), `${ex.id}#choix`);
}

export function publicExercise(ex: Exercise, language?: string) {
  const c = ex.content as Content;
  const base = {
    id: ex.id,
    kind: ex.kind,
    type: ex.type,
    language: ex.language ?? language ?? null,
    title: ex.title,
    prompt: ex.prompt,
    difficulty: ex.difficulty,
    level: ex.level,
    concepts: ex.concepts,
    xp: ex.xp,
    hintCount: Math.min(2, ex.hints.length) + 1,
  };
  switch (ex.type) {
    case 'mcq':
      return { ...base, choices: choiceOrder(ex).map((i) => c.choices[i]), multiple: c.multiple, code: c.code };
    case 'fill':
      return { ...base, code: c.code, blankCount: c.blankCount, compiled: c.compiled };
    case 'order': {
      const items = (c.lines as string[]).map((text, id) => ({ id, text }));
      return { ...base, items: seededShuffle(items, ex.id) };
    }
    case 'predict':
      return { ...base, code: c.code, input: c.input };
    case 'bugfix':
      return { ...base, code: c.code, choices: choiceOrder(ex).map((i) => c.choices[i]), visibleTests: c.visibleTests };
    case 'code': {
      const starter = c.starters ? (c.starters[language ?? 'rust'] ?? '') : c.starter;
      return { ...base, starter, visibleTests: c.visibleTests, rules: c.rules ?? [], languages: c.starters ? Object.keys(c.starters) : undefined };
    }
  }
  return base;
}
