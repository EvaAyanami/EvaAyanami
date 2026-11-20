/**
 * Vérifie le contenu pédagogique en EXÉCUTANT réellement le code via le
 * service d'exécution : solutions des exercices, sorties des « prédire le
 * résultat », codes bogués (qui doivent échouer), étapes de projets.
 *
 * Usage : RUNNER_URL=http://localhost:4100 npm run content:verify -- [--lang rust] [--filter mot]
 */
import { config } from '../config.js';
import { loadContent, type ExerciseDef, type TestCase } from '../lib/content.js';
import { fillTemplate, normalizeOutput, outputMatches } from '../lib/grading.js';
import { runCode } from '../lib/runner.js';

const args = process.argv.slice(2);
const langFilter = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : undefined;
const textFilter = args.includes('--filter') ? args[args.indexOf('--filter') + 1] : undefined;
const parallel = Number(process.env.VERIFY_PARALLEL ?? 6);

type Job = { id: string; run: () => Promise<string | null> };
const jobs: Job[] = [];

async function passes(lang: string, src: string, tests: TestCase[]) {
  const r = await runCode(lang, src, tests.map((t) => t.input));
  if (!r.compile.ok) return `ne compile pas :\n${r.compile.stderr.slice(0, 1500)}`;
  const fails = tests
    .map((t, i) => ({ t, r: r.tests[i] }))
    .filter(({ t, r }) => !r || r.exitCode !== 0 || !outputMatches(t.output, r.stdout, t.match));
  if (fails.length)
    return fails
      .map(({ t, r }) => `test « ${t.name ?? t.input.slice(0, 30)} » : attendu ${JSON.stringify(t.output)} obtenu ${JSON.stringify(r?.stdout)} ${r?.stderr ? `stderr=${r.stderr.slice(0, 300)}` : ''} exit=${r?.exitCode}`)
      .join('\n');
  return null;
}

function addExercise(lang: string, ex: ExerciseDef) {
  if (textFilter && !ex.id.includes(textFilter)) return;
  switch (ex.type) {
    case 'code':
      jobs.push({ id: ex.id, run: () => passes(lang, ex.solution, ex.tests) });
      break;
    case 'bugfix':
      jobs.push({
        id: ex.id,
        run: async () => {
          const good = await passes(lang, ex.solution, ex.tests);
          if (good) return `solution : ${good}`;
          const bad = await passes(lang, ex.code, ex.tests);
          return bad ? null : 'le code bogué passe les tests (il devrait échouer)';
        },
      });
      break;
    case 'fill':
      if (ex.tests?.length) jobs.push({ id: ex.id, run: () => passes(lang, fillTemplate(ex.code, ex.blanks.map((b) => b[0])), ex.tests!) });
      break;
    case 'predict':
      jobs.push({
        id: ex.id,
        run: async () => {
          const r = await runCode(lang, ex.code, [ex.input ?? '']);
          if (!r.compile.ok) return `ne compile pas :\n${r.compile.stderr.slice(0, 1500)}`;
          const got = r.tests[0]?.stdout ?? '';
          return normalizeOutput(got) === normalizeOutput(ex.output) ? null : `sortie attendue ${JSON.stringify(ex.output)} ≠ réelle ${JSON.stringify(got)}`;
        },
      });
      break;
  }
}

const bundle = await loadContent(config.contentDir);
for (const lvl of bundle.levels) {
  if (langFilter && lvl.language !== langFilter) continue;
  for (const ch of lvl.chapters) for (const ex of [...ch.exercises, ch.project, ...ch.exam.questions]) addExercise(lvl.language, ex);
}
for (const pl of bundle.placement) {
  if (langFilter && pl.language !== langFilter) continue;
  for (const q of pl.questions) addExercise(pl.language, q);
}
for (const p of bundle.projects) {
  for (const s of p.steps) {
    for (const lang of p.languages) {
      if (langFilter && lang !== langFilter) continue;
      if (textFilter && !s.id.includes(textFilter)) continue;
      const sol = s.solutions[lang];
      if (!sol) {
        jobs.push({ id: `${s.id}[${lang}]`, run: async () => 'solution manquante' });
        continue;
      }
      jobs.push({ id: `${s.id}[${lang}]`, run: () => passes(lang, sol, s.tests) });
    }
  }
}

console.log(`Vérification de ${jobs.length} éléments exécutables (runner : ${config.runnerUrl})…`);
const failures: { id: string; msg: string }[] = [];
let done = 0;
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const j = jobs[next++];
    let msg: string | null;
    try {
      msg = await j.run();
    } catch (e) {
      msg = `erreur : ${(e as Error).message}`;
    }
    if (msg) {
      failures.push({ id: j.id, msg });
      console.log(`✘ ${j.id}\n  ${msg.replace(/\n/g, '\n  ')}`);
    }
    done++;
    if (done % 50 === 0) console.log(`  … ${done}/${jobs.length}`);
  }
}
await Promise.all(Array.from({ length: parallel }, worker));
console.log(failures.length ? `\n${failures.length} échec(s) sur ${jobs.length}.` : `\n✔ ${jobs.length} éléments vérifiés, tout est correct.`);
process.exit(failures.length ? 1 : 0);
