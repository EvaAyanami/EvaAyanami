import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Reorder, motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { Check, X, Play, Hammer, RotateCcw, Send, Lightbulb, Maximize2, Minimize2, GripVertical, EyeOff, Loader2, Save, Terminal, ChevronRight } from 'lucide-react';
import { api, ApiError, TYPE_LABEL, LANG_META } from '../lib/api';
import { useFeedback, type Rewards } from '../lib/feedback';
import Markdown from './Markdown';
import { MascotSays } from './ui';
import type { Mood } from './Mascot';
import type { EditorDiagnostic } from './CodeEditor';

const CodeEditor = lazy(() => import('./CodeEditor'));

export interface PublicExercise {
  id: string;
  kind: string;
  type: 'mcq' | 'fill' | 'order' | 'predict' | 'bugfix' | 'code';
  language: string | null;
  title: string;
  prompt: string;
  difficulty: number;
  level: number;
  concepts: string[];
  xp: number;
  hintCount: number;
  choices?: string[];
  multiple?: boolean;
  code?: string;
  blankCount?: number;
  compiled?: boolean;
  items?: { id: number; text: string }[];
  input?: string;
  starter?: string;
  visibleTests?: { input: string; output: string; name?: string }[];
  rules?: string[];
  state?: { solved: boolean; attempts: number; draft: string | null; hintsUsed: number };
  generated?: boolean;
}

export type Answer = { choice?: number | number[]; blanks?: string[]; order?: number[]; output?: string; line?: number; code?: string };

export interface GradeResult {
  correct: boolean;
  score: number;
  feedback: string;
  explanation?: string;
  reveal?: { answer?: number | number[]; output?: string; blanks?: string[]; order?: number[] };
  compile?: { ok: boolean; stderr: string; stdout: string; diagnostics: EditorDiagnostic[]; timeMs: number };
  tests?: { name: string; passed: boolean; hidden: boolean; input?: string; expected?: string; got?: string; stderr?: string; timeMs: number; timedOut: boolean; exitCode: number }[];
  rules?: { message: string; passed: boolean }[];
  parts?: Record<string, boolean>;
  help?: { title: string; explanation: string; tip: string }[];
  rewards?: Rewards;
  failStreak?: number;
  firstSolve?: boolean;
  chapterCompleted?: boolean;
  projectCompleted?: boolean;
}

interface RunResult {
  compile: { ok: boolean; stderr: string; stdout: string; diagnostics: EditorDiagnostic[]; timeMs: number; exitCode: number };
  runs?: { index: number; stdout: string; stderr: string; exitCode: number; timeMs: number; timedOut: boolean; input?: string; expected?: string }[];
  run?: { stdout: string; stderr: string; exitCode: number; timeMs: number; timedOut: boolean } | null;
  help: { title: string; explanation: string; tip: string }[];
  error?: string;
}

interface Props {
  exercise: PublicExercise;
  language: string;
  /** practice : notation immédiate ; review : révision espacée ; collect : simple saisie (examen, placement). */
  mode?: 'practice' | 'review' | 'collect';
  onAnswerChange?: (a: Answer) => void;
  onGraded?: (r: GradeResult) => void;
  /** Soumission personnalisée (placement, exercices générés) */
  submitter?: (a: Answer) => Promise<GradeResult>;
  compact?: boolean;
}

const CHEERS = ['Excellent ! 🎉', 'Bien joué !', 'Parfait, tu as compris !', 'Super, continue comme ça !', 'Bravo, c’est exactement ça !'];
const RETRY = ['Presque ! Relis la consigne.', 'Pas tout à fait… essaie encore !', 'Une petite erreur, tu vas trouver.'];
const ENCOURAGE = [
  'Ne lâche rien : chaque erreur t’apprend quelque chose. Tu veux un indice ?',
  'C’est normal de bloquer, même les experts se trompent. Essaie l’aide niveau 1 !',
  'Respire un coup. Découpe le problème en petites étapes, et teste chaque étape.',
];
const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];

export default function Exercise({ exercise: ex, language, mode = 'practice', onAnswerChange, onGraded, submitter, compact }: Props) {
  const { celebrate, toast, setAssistant } = useFeedback();
  const lang = ex.language ?? language;
  const initialCode = ex.type === 'bugfix' ? ex.code ?? '' : ex.state?.draft ?? ex.starter ?? '';
  const [choice, setChoice] = useState<number[]>([]);
  const [blanks, setBlanks] = useState<string[]>(() => Array(ex.blankCount ?? 0).fill(''));
  const [order, setOrder] = useState(ex.items ?? []);
  const [output, setOutput] = useState('');
  const [line, setLine] = useState<number | undefined>();
  const [code, setCode] = useState(initialCode);
  const [bugStep, setBugStep] = useState(0);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [run, setRun] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState<'submit' | 'run' | 'compile' | null>(null);
  const [hints, setHints] = useState<{ level: number; title: string; text: string; solution?: string; note?: string }[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const [stdin, setStdin] = useState('');
  const [useStdin, setUseStdin] = useState(false);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle');
  const started = useRef(Date.now());
  const codeRef = useRef(code);
  codeRef.current = code;

  // Réinitialisation quand l'exercice change
  useEffect(() => {
    setChoice([]);
    setBlanks(Array(ex.blankCount ?? 0).fill(''));
    setOrder(ex.items ?? []);
    setOutput('');
    setLine(undefined);
    setCode(ex.type === 'bugfix' ? ex.code ?? '' : ex.state?.draft ?? ex.starter ?? '');
    setBugStep(0);
    setResult(null);
    setRun(null);
    setHints([]);
    started.current = Date.now();
  }, [ex.id, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Contexte de l'assistante
  useEffect(() => {
    if (mode === 'collect') return;
    setAssistant({ language: lang, exerciseId: ex.generated ? undefined : ex.id, getCode: () => codeRef.current, label: ex.title || TYPE_LABEL[ex.type] });
  }, [ex.id, lang, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer: Answer = useMemo(() => {
    switch (ex.type) {
      case 'mcq':
        return { choice: ex.multiple ? choice : choice[0] };
      case 'fill':
        return { blanks };
      case 'order':
        return { order: order.map((o) => o.id) };
      case 'predict':
        return { output };
      case 'bugfix':
        return { line, choice: choice[0], code };
      case 'code':
        return { code };
    }
  }, [ex.type, ex.multiple, choice, blanks, order, output, line, code]);

  useEffect(() => {
    onAnswerChange?.(answer);
  }, [answer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sauvegarde automatique du code (brouillon)
  useEffect(() => {
    if (mode === 'collect' || ex.generated || (ex.type !== 'code' && ex.type !== 'bugfix')) return;
    if (code === initialCode) return;
    setSaved('saving');
    const t = setTimeout(() => {
      api(`/exercises/${ex.id}/draft`, { method: 'PUT', body: { language: lang, code } })
        .then(() => setSaved('saved'))
        .catch(() => setSaved('idle'));
    }, 1500);
    return () => clearTimeout(t);
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = (() => {
    switch (ex.type) {
      case 'mcq':
        return choice.length > 0;
      case 'fill':
        return blanks.every((b) => b.trim());
      case 'order':
        return true;
      case 'predict':
        return output.trim().length > 0;
      case 'bugfix':
        return line !== undefined && choice.length > 0 && code.trim().length > 0;
      case 'code':
        return code.trim().length > 0;
    }
  })();

  async function submit() {
    if (!ready || busy) return;
    setBusy('submit');
    try {
      const r = submitter
        ? await submitter(answer)
        : await api<GradeResult>(`/exercises/${ex.id}/submit`, { body: { language: lang, answer, mode: mode === 'review' ? 'review' : 'practice', timeMs: Date.now() - started.current } });
      setResult(r);
      onGraded?.(r);
      if (r.rewards) {
        if (r.chapterCompleted) celebrate(r.rewards, { title: 'Chapitre terminé ! 🎓', text: 'Examen et mini-projet validés. Le chapitre suivant est débloqué.' });
        else if (r.projectCompleted) celebrate(r.rewards, { title: 'Projet terminé ! 🚀', text: 'Toutes les étapes sont validées. Superbe travail !' });
        else celebrate(r.rewards);
      }
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function execute(compileOnly = false) {
    if (busy) return;
    setBusy(compileOnly ? 'compile' : 'run');
    setResult(null);
    try {
      const r =
        compileOnly || ex.generated
          ? await api<RunResult>('/ide/run', { body: { language: lang, code, stdin: useStdin ? stdin : '', compileOnly } })
          : await api<RunResult>(`/exercises/${ex.id}/run`, { body: { language: lang, code: ex.type === 'fill' ? undefined : code, blanks: ex.type === 'fill' ? blanks : undefined, stdin: useStdin ? stdin : undefined } });
      setRun(r);
      if (compileOnly && r.compile.ok) toast('Compilation réussie ✔', 'success');
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function hint() {
    const level = hints.length + 1;
    if (level > 3) return;
    try {
      const h = await api<{ level: number; title: string; text: string; solution?: string; note?: string }>(`/exercises/${ex.id}/hint`, { body: { level, language: lang } });
      setHints((x) => [...x, h]);
    } catch (e) {
      toast((e as ApiError).message, 'info');
    }
  }

  const mood: Mood = !result ? (busy ? 'thinking' : ex.type === 'code' ? 'coding' : 'neutral') : result.correct ? (result.firstSolve ? 'celebrate' : 'happy') : (result.failStreak ?? 0) >= 3 ? 'sad' : 'thinking';
  const mascotText = !result
    ? null
    : result.correct
      ? pick(CHEERS)
      : (result.failStreak ?? 0) >= 3
        ? pick(ENCOURAGE)
        : pick(RETRY);

  const isCodeLike = ex.type === 'code' || (ex.type === 'bugfix' && bugStep >= 2);
  const diagnostics = result?.compile?.diagnostics ?? run?.compile.diagnostics;
  const canHint = mode !== 'collect' && !ex.generated && ex.kind !== 'exam';

  /* ------------------------------ rendu ------------------------------ */
  const header = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="chip bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">{TYPE_LABEL[ex.type]}</span>
      {ex.kind === 'miniproject' && <span className="chip bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">Mini-projet</span>}
      <span className="chip">{'★'.repeat(ex.difficulty)}{'☆'.repeat(3 - ex.difficulty)}</span>
      {mode !== 'collect' && <span className="chip bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">+{ex.xp} XP</span>}
      {ex.state?.solved && (
        <span className="chip bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
          <Check size={12} /> Réussi
        </span>
      )}
      {lang && <span className="chip">{LANG_META[lang]?.icon} {LANG_META[lang]?.name}</span>}
    </div>
  );

  const prompt = (
    <div>
      {ex.title && <h3 className="mb-1 text-xl text-ink-900 dark:text-white">{ex.title}</h3>}
      <Markdown>{ex.prompt}</Markdown>
    </div>
  );

  const hintsBlock = canHint && (
    <div className="mt-4 space-y-2">
      <AnimatePresence>
        {hints.map((h) => (
          <motion.div key={h.level} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={clsx('rounded-2xl border-2 p-3', h.level === 3 ? 'border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30' : 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20')}>
            <div className="mb-1 flex items-center gap-1 text-sm font-extrabold">
              <Lightbulb size={14} /> Aide {h.level}/3 — {h.title}
            </div>
            <Markdown className="text-sm">{h.text}</Markdown>
            {h.solution && <Markdown className="text-sm">{'```' + (lang === 'cpp' ? 'cpp' : lang) + '\n' + h.solution + '\n```'}</Markdown>}
            {h.note && <p className="muted mt-1 text-xs italic">{h.note}</p>}
          </motion.div>
        ))}
      </AnimatePresence>
      {hints.length < 3 && (
        <button className="btn-ghost btn-sm text-amber-600 dark:text-amber-400" onClick={hint}>
          <Lightbulb size={16} /> {['Petit indice', 'Expliquer la notion', 'Voir la solution commentée'][hints.length]}
        </button>
      )}
    </div>
  );

  const resultBlock = result && mode !== 'collect' && (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={clsx('mt-4 rounded-3xl border-2 p-4', result.correct ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/20')}>
      <div className={clsx('flex items-center gap-2 text-lg font-black', result.correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
        {result.correct ? <Check /> : <X />} {result.feedback}
      </div>
      {result.parts && (
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(result.parts).map(([k, v]) => (
            <span key={k} className={clsx('chip', v ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300')}>
              {v ? <Check size={12} /> : <X size={12} />} {k}
            </span>
          ))}
        </div>
      )}
      {result.reveal?.output !== undefined && !result.correct && (
        <div className="mt-2 text-sm">
          <div className="font-bold">Sortie réelle du programme :</div>
          <pre className="mt-1 rounded-xl bg-ink-900 p-3 font-mono text-ink-100">{result.reveal.output}</pre>
        </div>
      )}
      {result.explanation && <Markdown className="mt-2 text-sm">{result.explanation}</Markdown>}
      <CompileAndTests result={result} />
      {mascotText && <MascotSays mood={mood} size={70} className="mt-3">{mascotText}</MascotSays>}
    </motion.div>
  );

  /* ---- Exercices de type code / bugfix (étape 3) : disposition IDE en 3 zones ---- */
  if (isCodeLike) {
    const consoleOut = (
      <div className="flex h-full min-h-[180px] flex-col bg-ink-950 text-ink-100">
        <div className="flex items-center gap-2 border-b border-ink-800 px-3 py-1.5 text-xs font-bold text-ink-400">
          <Terminal size={14} /> Console
          <div className="flex-1" />
          <label className="flex cursor-pointer items-center gap-1">
            <input type="checkbox" checked={useStdin} onChange={(e) => setUseStdin(e.target.checked)} /> Entrée personnalisée
          </label>
        </div>
        {useStdin && <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} placeholder="Entrée standard (stdin)…" className="h-16 resize-none border-b border-ink-800 bg-ink-900 p-2 font-mono text-xs text-ink-100 outline-none" />}
        <div className="scrollbar-thin flex-1 overflow-auto p-3 font-mono text-xs leading-5">
          {busy && (
            <div className="flex items-center gap-2 text-cyan-400">
              <Loader2 size={14} className="animate-spin" /> {busy === 'submit' ? 'Compilation et tests cachés en cours…' : busy === 'compile' ? 'Compilation…' : 'Compilation et exécution…'}
            </div>
          )}
          {!busy && !run && !result && <div className="text-ink-500">Clique sur « Exécuter » (Ctrl+Entrée) pour lancer ton programme, ou « Valider » pour le soumettre aux tests.</div>}
          {!busy && run && <RunOutput run={run} />}
          {!busy && result && <CompileAndTests result={result} dark />}
        </div>
      </div>
    );
    return (
      <div className={clsx(fullscreen && 'fixed inset-0 z-50 overflow-auto bg-ink-50 p-3 dark:bg-ink-950')}>
        <div className={clsx('grid gap-4', !compact && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
          {/* Zone 1 : consignes */}
          <div className="card scrollbar-thin lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto">
            {header}
            {prompt}
            {ex.type === 'bugfix' && (
              <div className="mt-3 rounded-2xl bg-ink-50 p-3 text-sm dark:bg-ink-800/50">
                <b>Étape 3/3 :</b> corrige le programme pour qu’il passe les tests.
                <button className="btn-ghost btn-sm ml-2" onClick={() => setBugStep(0)}>
                  Revenir aux étapes 1–2
                </button>
              </div>
            )}
            {!!ex.rules?.length && (
              <div className="mt-3 text-sm">
                <div className="font-extrabold">Consignes vérifiées :</div>
                <ul className="mt-1 list-disc pl-5">
                  {ex.rules.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {!!ex.visibleTests?.length && (
              <div className="mt-3">
                <div className="text-sm font-extrabold">Exemples :</div>
                <div className="mt-1 space-y-2">
                  {ex.visibleTests.map((t, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="muted font-bold">Entrée</div>
                        <pre className="mt-0.5 min-h-[2rem] whitespace-pre-wrap rounded-xl bg-ink-100 p-2 font-mono dark:bg-ink-800">{t.input || '(vide)'}</pre>
                      </div>
                      <div>
                        <div className="muted font-bold">Sortie attendue</div>
                        <pre className="mt-0.5 min-h-[2rem] whitespace-pre-wrap rounded-xl bg-ink-100 p-2 font-mono dark:bg-ink-800">{t.output}</pre>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="muted mt-2 flex items-center gap-1 text-xs">
                  <EyeOff size={12} /> D’autres tests cachés vérifient ta solution : n’écris pas le résultat en dur !
                </p>
              </div>
            )}
            {hintsBlock}
            {result && mode !== 'collect' && (
              <div className={clsx('mt-4 rounded-2xl p-3 font-black', result.correct ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30' : 'bg-rose-50 text-rose-600 dark:bg-rose-950/20')}>
                {result.correct ? '✔ ' : '✘ '}
                {result.feedback}
                {result.explanation && <Markdown className="mt-2 text-sm font-normal text-ink-700 dark:text-ink-200">{result.explanation}</Markdown>}
                {mascotText && <MascotSays mood={mood} size={64} className="mt-2 font-semibold text-ink-700 dark:text-ink-100">{mascotText}</MascotSays>}
              </div>
            )}
          </div>
          {/* Zones 2 et 3 : éditeur + console */}
          <div className="card flex flex-col overflow-hidden !p-0">
            <div className="flex flex-wrap items-center gap-1 border-b border-ink-200 px-3 py-2 dark:border-ink-800">
              <span className="mr-2 rounded-lg bg-ink-100 px-2 py-1 font-mono text-xs font-bold dark:bg-ink-800">{LANG_META[lang]?.file}</span>
              {saved !== 'idle' && (
                <span className="muted flex items-center gap-1 text-xs">
                  <Save size={12} /> {saved === 'saving' ? 'Sauvegarde…' : 'Sauvegardé'}
                </span>
              )}
              <div className="flex-1" />
              <button className="btn-ghost btn-sm" onClick={() => execute(true)} disabled={!!busy} title="Compiler">
                <Hammer size={16} /> <span className="hidden sm:inline">Compiler</span>
              </button>
              <button className="btn-ghost btn-sm" onClick={() => execute(false)} disabled={!!busy} title="Exécuter (Ctrl+Entrée)">
                <Play size={16} /> <span className="hidden sm:inline">Exécuter</span>
              </button>
              <button
                className="btn-ghost btn-sm"
                onClick={() => {
                  if (confirm('Revenir au code de départ ?')) setCode(ex.type === 'bugfix' ? ex.code ?? '' : ex.starter ?? '');
                }}
                title="Réinitialiser"
              >
                <RotateCcw size={16} />
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setFullscreen((f) => !f)} title="Agrandir">
                {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              {mode !== 'collect' && (
                <button className="btn-success btn-sm" onClick={submit} disabled={!ready || !!busy}>
                  {busy === 'submit' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Valider
                </button>
              )}
            </div>
            <Suspense fallback={<div className="h-[360px] p-4 text-sm text-ink-400">Chargement de l’éditeur…</div>}>
              <CodeEditor value={code} onChange={setCode} language={lang} height={fullscreen ? 'calc(100vh - 330px)' : compact ? 300 : 420} diagnostics={diagnostics} onRun={() => execute(false)} />
            </Suspense>
            <div className="h-56 border-t border-ink-200 dark:border-ink-800">{consoleOut}</div>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Autres types ---- */
  return (
    <div className="card">
      {header}
      {prompt}

      {ex.type === 'mcq' && (
        <>
          {ex.code && <Markdown>{'```' + lang + '\n' + ex.code + '\n```'}</Markdown>}
          <div className="mt-3 grid gap-2">
            {ex.multiple && <p className="muted text-sm font-bold">Plusieurs réponses possibles.</p>}
            {ex.choices!.map((c, i) => {
              const selected = choice.includes(i);
              const correctReveal = result?.reveal?.answer !== undefined && [result.reveal.answer].flat().includes(i);
              return (
                <button
                  key={i}
                  disabled={!!result && mode !== 'collect'}
                  onClick={() => setChoice((s) => (ex.multiple ? (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]) : [i]))}
                  className={clsx(
                    'flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left font-semibold transition',
                    result && correctReveal
                      ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30'
                      : result && selected
                        ? 'border-rose-300 bg-rose-50 dark:bg-rose-950/20'
                        : selected
                          ? 'border-brand-400 bg-brand-50 shadow-glow dark:bg-brand-900/30'
                          : 'border-ink-200 bg-white hover:border-brand-300 dark:border-ink-700 dark:bg-ink-900',
                  )}
                >
                  <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-xs font-black', selected ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-300 dark:border-ink-600')}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <Markdown className="[&_p]:my-0">{c}</Markdown>
                </button>
              );
            })}
          </div>
        </>
      )}

      {ex.type === 'fill' && (
        <div className="mt-3">
          <pre className="overflow-x-auto rounded-2xl bg-ink-900 p-4 font-mono text-sm leading-8 text-ink-100">
            {ex.code!.split('{{?}}').map((part, i, arr) => (
              <span key={i}>
                {part}
                {i < arr.length - 1 && (
                  <input
                    value={blanks[i] ?? ''}
                    onChange={(e) => setBlanks((b) => b.map((x, j) => (j === i ? e.target.value : x)))}
                    disabled={!!result?.correct && mode !== 'collect'}
                    spellCheck={false}
                    autoCapitalize="off"
                    className={clsx(
                      'mx-0.5 inline-block rounded-md border-b-2 bg-ink-800 px-1.5 py-0.5 text-center font-mono text-cyan-300 outline-none focus:border-cyan-400',
                      result?.parts && result.parts[`trou ${i + 1}`] === false ? 'border-rose-400' : 'border-brand-400',
                    )}
                    style={{ width: `${Math.max(3, (blanks[i] ?? '').length + 1)}ch` }}
                    aria-label={`Trou ${i + 1}`}
                  />
                )}
              </span>
            ))}
          </pre>
          {ex.compiled && <p className="muted mt-2 text-xs">Ce programme sera réellement compilé et exécuté pour vérifier ta réponse.</p>}
        </div>
      )}

      {ex.type === 'order' && (
        <Reorder.Group axis="y" values={order} onReorder={setOrder} className="mt-3 space-y-2">
          {order.map((it) => (
            <Reorder.Item key={it.id} value={it} className="flex cursor-grab items-center gap-2 rounded-2xl border-2 border-ink-200 bg-white px-3 py-2 font-mono text-sm shadow-sm active:cursor-grabbing dark:border-ink-700 dark:bg-ink-900">
              <GripVertical size={16} className="shrink-0 text-ink-400" />
              <span className="whitespace-pre">{it.text}</span>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}

      {ex.type === 'predict' && (
        <div className="mt-3">
          <Markdown>{'```' + lang + '\n' + ex.code + '\n```'}</Markdown>
          {ex.input && (
            <div className="text-sm">
              <b>Entrée fournie au programme :</b>
              <pre className="mt-1 rounded-xl bg-ink-100 p-2 font-mono dark:bg-ink-800">{ex.input}</pre>
            </div>
          )}
          <label className="label mt-3">Que va afficher ce programme ?</label>
          <textarea value={output} onChange={(e) => setOutput(e.target.value)} rows={4} className="input font-mono" placeholder="Écris la sortie exacte, ligne par ligne…" spellCheck={false} />
        </div>
      )}

      {ex.type === 'bugfix' && (
        <div className="mt-3">
          <div className="mb-2 flex gap-2 text-xs font-bold">
            {['1. Trouve la ligne', '2. Explique', '3. Corrige'].map((s, i) => (
              <span key={s} className={clsx('rounded-full px-3 py-1', bugStep === i ? 'bg-brand-500 text-white' : 'bg-ink-100 dark:bg-ink-800')}>
                {s}
              </span>
            ))}
          </div>
          {bugStep === 0 && (
            <>
              <p className="muted mb-2 text-sm">Clique sur la ligne qui contient l’erreur.</p>
              <div className="overflow-x-auto rounded-2xl bg-ink-900 py-2 font-mono text-sm text-ink-100">
                {(ex.code ?? '').split('\n').map((l, i) => (
                  <button key={i} onClick={() => setLine(i + 1)} className={clsx('flex w-full gap-3 px-3 text-left hover:bg-ink-800', line === i + 1 && 'bg-amber-500/30')}>
                    <span className="w-6 shrink-0 select-none text-right text-ink-500">{i + 1}</span>
                    <span className="whitespace-pre">{l || ' '}</span>
                  </button>
                ))}
              </div>
              <button className="btn-primary mt-3" disabled={line === undefined} onClick={() => setBugStep(1)}>
                Suivant <ChevronRight size={16} />
              </button>
            </>
          )}
          {bugStep === 1 && (
            <>
              <p className="muted mb-2 text-sm">Pourquoi la ligne {line} pose-t-elle problème ?</p>
              <div className="grid gap-2">
                {ex.choices!.map((c, i) => (
                  <button key={i} onClick={() => setChoice([i])} className={clsx('rounded-2xl border-2 px-4 py-3 text-left font-semibold', choice[0] === i ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/30' : 'border-ink-200 dark:border-ink-700')}>
                    <Markdown className="[&_p]:my-0">{c}</Markdown>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button className="btn-outline" onClick={() => setBugStep(0)}>
                  Retour
                </button>
                <button className="btn-primary" disabled={!choice.length} onClick={() => setBugStep(2)}>
                  Corriger le code <ChevronRight size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {mode !== 'collect' && ex.type !== 'bugfix' && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className="btn-success" onClick={submit} disabled={!ready || !!busy || (!!result?.correct && ex.type !== 'fill')}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Valider
          </button>
          {ex.type === 'fill' && ex.compiled && (
            <button className="btn-outline" onClick={() => execute(false)} disabled={!ready || !!busy}>
              <Play size={16} /> Exécuter
            </button>
          )}
          {result && !result.correct && (
            <button
              className="btn-outline"
              onClick={() => {
                setResult(null);
                setChoice([]);
              }}
            >
              <RotateCcw size={16} /> Réessayer
            </button>
          )}
        </div>
      )}
      {run && ex.type === 'fill' && (
        <div className="mt-3 rounded-2xl bg-ink-950 p-3 font-mono text-xs text-ink-100">
          <RunOutput run={run} />
        </div>
      )}
      {resultBlock}
      {hintsBlock}
    </div>
  );
}

function HelpCards({ help }: { help?: { title: string; explanation: string; tip: string }[] }) {
  if (!help?.length) return null;
  return (
    <div className="mt-2 space-y-2 font-sans">
      {help.map((h) => (
        <div key={h.title} className="rounded-xl border border-violet-400/40 bg-violet-500/10 p-2 text-[13px]">
          <div className="font-extrabold text-violet-500 dark:text-violet-300">💡 {h.title}</div>
          <Markdown className="text-[13px] [&_p]:my-1">{h.explanation}</Markdown>
          <Markdown className="text-[13px] [&_p]:my-1">{`**Astuce :** ${h.tip}`}</Markdown>
        </div>
      ))}
    </div>
  );
}

function RunOutput({ run }: { run: RunResult }) {
  if (run.error && !run.compile.stderr) return <div className="text-rose-400">{run.error}</div>;
  if (!run.compile.ok) {
    return (
      <div>
        <div className="font-bold text-rose-400">✘ Erreur de compilation</div>
        <pre className="mt-1 whitespace-pre-wrap text-rose-200">{run.compile.stderr}</pre>
        <HelpCards help={run.help} />
      </div>
    );
  }
  const runs = run.runs ?? (run.run ? [{ ...run.run, index: 0 }] : []);
  return (
    <div className="space-y-3">
      <div className="text-emerald-400">✔ Compilé en {run.compile.timeMs} ms</div>
      {run.compile.stderr && <pre className="whitespace-pre-wrap text-amber-300">{run.compile.stderr}</pre>}
      {runs.map((r) => (
        <div key={r.index}>
          {'input' in r && (r as any).input !== undefined && runs.length > 1 && <div className="text-ink-500">— Exécution {r.index + 1} (entrée : {JSON.stringify((r as any).input)})</div>}
          <pre className="whitespace-pre-wrap">{r.stdout || <span className="text-ink-500">(aucune sortie)</span>}</pre>
          {r.stderr && <pre className="whitespace-pre-wrap text-rose-300">{r.stderr}</pre>}
          <div className={clsx('text-[11px]', r.exitCode === 0 ? 'text-ink-500' : 'text-rose-400')}>
            {r.timedOut ? '⏱ Délai dépassé' : `code de sortie ${r.exitCode}`} · {r.timeMs} ms
            {'expected' in r && (r as any).expected !== undefined && (
              <span className="ml-2 text-cyan-400">attendu : {JSON.stringify((r as any).expected)}</span>
            )}
          </div>
        </div>
      ))}
      <HelpCards help={run.help} />
    </div>
  );
}

function CompileAndTests({ result, dark }: { result: GradeResult; dark?: boolean }) {
  if (!result.compile && !result.tests) return null;
  return (
    <div className={clsx('mt-2 space-y-2 font-mono text-xs', !dark && 'rounded-2xl bg-ink-950 p-3 text-ink-100')}>
      {result.compile && !result.compile.ok && (
        <div>
          <div className="font-bold text-rose-400">✘ Erreur de compilation</div>
          <pre className="mt-1 whitespace-pre-wrap text-rose-200">{result.compile.stderr}</pre>
        </div>
      )}
      {result.tests?.map((t, i) => (
        <div key={i} className="rounded-lg bg-white/5 p-2">
          <div className={clsx('font-bold', t.passed ? 'text-emerald-400' : 'text-rose-400')}>
            {t.passed ? '✔' : '✘'} {t.name} {t.hidden && <span className="text-ink-500">(test caché)</span>} <span className="font-normal text-ink-500">· {t.timeMs} ms</span>
          </div>
          {!t.passed && !t.hidden && (
            <div className="mt-1 grid gap-1 sm:grid-cols-3">
              <div>
                <span className="text-ink-500">entrée</span>
                <pre className="whitespace-pre-wrap">{t.input || '(vide)'}</pre>
              </div>
              <div>
                <span className="text-ink-500">attendu</span>
                <pre className="whitespace-pre-wrap text-emerald-300">{t.expected}</pre>
              </div>
              <div>
                <span className="text-ink-500">obtenu</span>
                <pre className="whitespace-pre-wrap text-rose-300">{t.got || '(rien)'}</pre>
              </div>
            </div>
          )}
          {!t.passed && t.timedOut && <div className="text-amber-300">⏱ Délai dépassé (boucle infinie ?)</div>}
          {!t.passed && t.stderr && <pre className="mt-1 whitespace-pre-wrap text-rose-300">{t.stderr.slice(0, 600)}</pre>}
        </div>
      ))}
      {result.rules?.map((r) => (
        <div key={r.message} className={r.passed ? 'text-emerald-400' : 'text-amber-300'}>
          {r.passed ? '✔' : '✘'} Consigne : {r.message}
        </div>
      ))}
      <HelpCards help={result.help} />
    </div>
  );
}
