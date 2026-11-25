import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Check, ChevronRight, Loader2 } from 'lucide-react';
import { api, ApiError, LANG_META, LEVEL_NAMES } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFeedback, type Rewards } from '../lib/feedback';
import Mascot from '../components/Mascot';
import { MascotSays, ProgressBar } from '../components/ui';
import Exercise, { type Answer, type PublicExercise } from '../components/Exercise';
import { Logo } from '../components/Layout';

interface Q {
  id: string;
  question: string;
  type: 'single' | 'multi' | 'yesno';
  options?: string[];
}

type Step = 'welcome' | 'questionnaire' | 'choose' | 'test' | 'result';

export default function Onboarding() {
  const nav = useNavigate();
  const { refresh, user } = useAuth();
  const { celebrate, toast } = useFeedback();
  const [step, setStep] = useState<Step>('welcome');
  const [questions, setQuestions] = useState<Q[]>([]);
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [langs, setLangs] = useState<string[]>(['rust', 'cpp', 'java']);
  const [startLevels, setStartLevels] = useState<Record<string, number>>({});
  const [run, setRun] = useState<{ runId: string; language: string; question: PublicExercise; index: number; total: number } | null>(null);
  const [answer, setAnswer] = useState<Answer>({});
  const [feedback, setFeedback] = useState<{ correct: boolean; explanation?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, { level: number; levelName: string; score: number; answered: number }> | null>(null);

  useEffect(() => {
    api<Q[]>('/placement/questionnaire').then(setQuestions);
  }, []);

  const q = questions[qi];
  const answered = q && answers[q.id] !== undefined && !(Array.isArray(answers[q.id]) && (answers[q.id] as unknown[]).length === 0);

  async function finishQuestionnaire() {
    const r = await api<{ startLevels: Record<string, number> }>('/placement/questionnaire', { body: answers });
    setStartLevels(r.startLevels);
    setStep('choose');
  }

  async function startTest() {
    if (!langs.length) return;
    setBusy(true);
    try {
      const r = await api<any>('/placement/start', { body: { languages: langs } });
      setRun({ runId: r.runId, language: r.language, question: r.question, index: r.index, total: r.total });
      setStep('test');
    } catch (e) {
      ((e as ApiError).status !== 402 && toast((e as ApiError).message, 'error'));
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(a: Answer = answer) {
    if (!run) return;
    setBusy(true);
    try {
      const r = await api<any>('/placement/answer', { body: { runId: run.runId, language: run.language, exerciseId: run.question.id, answer: a, languages: langs } });
      setFeedback({ correct: r.correct, explanation: r.explanation });
      setTimeout(async () => {
        setFeedback(null);
        setAnswer({});
        if (r.next) setRun({ runId: run.runId, language: r.next.language, question: r.next.question, index: r.next.index, total: r.next.total });
        else await finishTest();
      }, r.correct ? 900 : 1800);
    } catch (e) {
      ((e as ApiError).status !== 402 && toast((e as ApiError).message, 'error'));
    } finally {
      setBusy(false);
    }
  }

  async function finishTest() {
    if (!run) return;
    const r = await api<{ result: typeof result; rewards: Rewards }>('/placement/finish', { body: { runId: run.runId } });
    setResult(r.result);
    setStep('result');
    celebrate(r.rewards);
  }

  async function startFromZero() {
    await api('/placement/skip', { body: {} });
    await refresh();
    nav('/apprendre');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-violet-50 px-4 py-6 dark:from-ink-950 dark:via-ink-900 dark:to-brand-950">
      <div className="mx-auto max-w-3xl">
        <Logo className="mb-6" />
        <AnimatePresence mode="wait">
          {step === 'welcome' && (
            <motion.div key="w" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card flex flex-col items-center p-8 text-center">
              <Mascot mood="happy" size={200} />
              <h1 className="mt-4 text-3xl">Bienvenue{user ? `, ${user.displayName}` : ''} !</h1>
              <p className="muted mt-2 max-w-lg text-lg">
                Je suis <b className="text-brand-500">Kiri</b>, ton accompagnatrice. Avant de commencer, faisons connaissance : quelques questions sur ton expérience, puis un petit test qui s’adapte à tes réponses. Ainsi, tu ne perdras pas de temps sur ce que tu sais déjà !
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button className="btn-primary px-6 py-3 text-lg" onClick={() => setStep('questionnaire')}>
                  C’est parti ! <ChevronRight />
                </button>
                <button className="btn-outline px-6 py-3" onClick={startFromZero}>
                  Je débute complètement
                </button>
              </div>
            </motion.div>
          )}

          {step === 'questionnaire' && q && (
            <motion.div key={`q${qi}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <ProgressBar value={(qi + 1) / questions.length} className="mb-6" />
              <MascotSays mood="explain" size={110}>
                <span className="text-lg">{q.question}</span>
              </MascotSays>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {(q.type === 'yesno' ? ['Oui', 'Non'] : q.options!).map((opt, i) => {
                  const val = q.type === 'yesno' ? i === 0 : i;
                  const cur = answers[q.id];
                  const selected = q.type === 'multi' ? ((cur as number[]) ?? []).includes(i) : cur === val;
                  return (
                    <button
                      key={opt}
                      onClick={() =>
                        setAnswers((a) => ({
                          ...a,
                          [q.id]: q.type === 'multi' ? (((cur as number[]) ?? []).includes(i) ? (cur as number[]).filter((x) => x !== i) : [...((cur as number[]) ?? []), i]) : val,
                        }))
                      }
                      className={clsx('flex items-center gap-3 rounded-2xl border-2 bg-white px-4 py-3 text-left text-lg font-bold transition dark:bg-ink-900', selected ? 'border-brand-400 shadow-glow' : 'border-ink-200 hover:border-brand-200 dark:border-ink-700')}
                    >
                      <span className={clsx('flex h-6 w-6 items-center justify-center rounded-lg border-2', selected ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-300')}>{selected && <Check size={14} />}</span>
                      {opt}
                    </button>
                  );
                })}
              </div>
              {q.type === 'multi' && <p className="muted mt-2 text-sm">Plusieurs choix possibles. Aucun ? Choisis « Autre » ou passe.</p>}
              <div className="mt-6 flex justify-between">
                <button className="btn-ghost" onClick={() => (qi ? setQi(qi - 1) : setStep('welcome'))}>
                  Retour
                </button>
                <button
                  className="btn-primary px-6"
                  disabled={!answered && q.type !== 'multi'}
                  onClick={() => (qi < questions.length - 1 ? setQi(qi + 1) : finishQuestionnaire())}
                >
                  {qi < questions.length - 1 ? 'Suivant' : 'Terminer'} <ChevronRight size={18} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 'choose' && (
            <motion.div key="c" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <MascotSays mood="happy" size={110}>
                Merci ! Maintenant, un petit test adaptatif : les questions deviennent plus difficiles quand tu réussis, plus simples sinon. Choisis les langages à évaluer.
              </MascotSays>
              <div className="grid gap-3 sm:grid-cols-3">
                {Object.entries(LANG_META).map(([id, m]) => {
                  const on = langs.includes(id);
                  return (
                    <button key={id} onClick={() => setLangs((l) => (on ? l.filter((x) => x !== id) : [...l, id]))} className={clsx('card text-left transition', on ? 'ring-4 ring-brand-300' : 'opacity-60')}>
                      <div className={`mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-2xl ${m.gradient}`}>{m.icon}</div>
                      <div className="text-lg font-black">{m.name}</div>
                      <div className="muted text-sm">Départ estimé : {LEVEL_NAMES[startLevels[id] ?? 1]}</div>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="btn-primary px-6 py-3" disabled={!langs.length || busy} onClick={startTest}>
                  {busy ? <Loader2 className="animate-spin" /> : null} Lancer le test
                </button>
                <button className="btn-outline" onClick={startFromZero}>
                  Passer et commencer de zéro
                </button>
              </div>
            </motion.div>
          )}

          {step === 'test' && run && (
            <motion.div key={run.question.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="chip text-sm">
                  {LANG_META[run.language].icon} {LANG_META[run.language].name}
                </span>
                <ProgressBar value={run.index / run.total} className="flex-1" />
                <span className="text-sm font-bold">
                  {run.index}/{run.total}
                </span>
              </div>
              <Exercise exercise={run.question} language={run.language} mode="collect" onAnswerChange={setAnswer} compact />
              <AnimatePresence>
                {feedback && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <MascotSays mood={feedback.correct ? 'happy' : 'sad'} size={80}>
                      {feedback.correct ? 'Bonne réponse !' : 'Ce n’est pas grave, on ajuste la difficulté.'}
                    </MascotSays>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="flex justify-between">
                <button className="btn-ghost" disabled={busy || !!feedback} onClick={() => submitAnswer({})}>
                  Je ne sais pas
                </button>
                <button className="btn-primary px-6" disabled={busy || !!feedback} onClick={() => submitAnswer()}>
                  {busy ? <Loader2 className="animate-spin" size={18} /> : null} Valider
                </button>
              </div>
            </motion.div>
          )}

          {step === 'result' && result && (
            <motion.div key="r" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card p-8 text-center">
              <Mascot mood="celebrate" size={170} />
              <h1 className="mt-2 text-3xl">Ton profil de compétences</h1>
              <p className="muted">Un niveau distinct pour chaque langage. Tu pourras le modifier à tout moment dans ton profil.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {Object.entries(result).map(([l, r]) => (
                  <div key={l} className="rounded-3xl bg-ink-50 p-4 dark:bg-ink-800">
                    <div className="text-3xl">{LANG_META[l].icon}</div>
                    <div className="text-lg font-black">{LANG_META[l].name}</div>
                    <div className="mt-1 font-extrabold text-brand-500">{r.levelName}</div>
                    <div className="muted text-sm">
                      {r.score} % de réussite ({r.answered} questions)
                    </div>
                  </div>
                ))}
              </div>
              <p className="muted mt-4 text-sm">Les chapitres des niveaux inférieurs sont marqués comme « passés » : tu peux toujours les ouvrir pour réviser.</p>
              <button
                className="btn-primary mt-6 px-8 py-3 text-lg"
                onClick={async () => {
                  await refresh();
                  nav('/apprendre');
                }}
              >
                Découvrir mes parcours <ChevronRight />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
