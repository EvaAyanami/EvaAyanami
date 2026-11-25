import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Check, X, Clock, Trophy, ArrowLeft, Swords } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useFeedback } from '../lib/feedback';
import { useI18n } from '../lib/i18n';
import { Loading, ErrorBox } from '../components/ui';
import Avatar, { type AvatarData } from '../components/Avatar';
import Mascot from '../components/Mascot';
import Duo from '../components/Duo';

interface Player { id: string; displayName: string; tag: string; avatar: AvatarData }
interface Q {
  id: string; theme: string; q: string; code: string | null; choices: string[];
  answer?: number; explain?: string; mine?: { choice: number | null; correct: boolean; points: number; ms: number } | null; theirs?: { choice: number | null; correct: boolean; points: number } | null;
}
interface Duel {
  id: string; theme: string; status: string; solo: boolean; me: 'creator' | 'opponent'; played: boolean; creator: Player; opponent: Player | null;
  myScore: number | null; theirScore: number | null; secondsPerQuestion: number; questions: Q[];
}

export const THEME_LABEL: Record<string, { label: string; icon: string }> = {
  mix: { label: 'Tout mélangé', icon: '🎲' },
  code: { label: 'Culture code', icon: '💻' },
  hardware: { label: 'Hardware', icon: '🔌' },
  blind: { label: 'Devine le langage', icon: '🎧' },
};

export default function QuizPlay() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const { toast, celebrate } = useFeedback();
  const [duel, setDuel] = useState<Duel | null>(null);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'intro' | 'play' | 'sending' | 'results'>('intro');
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<{ choice: number | null; ms: number }[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [left, setLeft] = useState(15);
  const started = useRef(0);

  const load = () =>
    api<Duel>(`/quiz/duels/${id}`)
      .then((d) => {
        setDuel(d);
        if (d.played) setPhase('results');
      })
      .catch((e) => setError((e as ApiError).message));
  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chrono de la question en cours
  useEffect(() => {
    if (phase !== 'play' || !duel) return;
    started.current = performance.now();
    setLeft(duel.secondsPerQuestion);
    setPicked(null);
    const iv = setInterval(() => {
      const remain = duel.secondsPerQuestion - (performance.now() - started.current) / 1000;
      setLeft(Math.max(0, remain));
      if (remain <= 0) {
        clearInterval(iv);
        answer(null);
      }
    }, 100);
    return () => clearInterval(iv);
  }, [phase, i, duel]); // eslint-disable-line react-hooks/exhaustive-deps

  function answer(choice: number | null) {
    if (!duel || picked !== null) return;
    setPicked(choice ?? -1);
    const ms = Math.round(performance.now() - started.current);
    const next = [...answers, { choice, ms }];
    setAnswers(next);
    setTimeout(() => {
      if (next.length >= duel.questions.length) send(next);
      else setI((x) => x + 1);
    }, 450);
  }

  async function send(all: { choice: number | null; ms: number }[]) {
    setPhase('sending');
    try {
      const r = await api<{ score: number; finished: boolean; rewards?: any }>(`/quiz/duels/${id}/answers`, { body: { answers: all } });
      await load();
      setPhase('results');
      if (r.rewards) celebrate(r.rewards);
    } catch (e) {
      toast((e as ApiError).message, 'error');
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (!duel) return <Loading />;
  const other = duel.me === 'creator' ? duel.opponent : duel.creator;
  const theme = THEME_LABEL[duel.theme] ?? THEME_LABEL.mix;

  if (phase === 'intro')
    return (
      <div className="mx-auto max-w-xl">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card flex flex-col items-center text-center">
          <div className="text-5xl">{theme.icon}</div>
          <h1 className="mt-2 text-2xl font-black">{t('Blind test')} · {t(theme.label)}</h1>
          {other ? (
            <div className="my-4 flex items-center gap-4">
              <Avatar avatar={duel.me === 'creator' ? duel.creator.avatar : duel.opponent?.avatar} size={64} />
              <Swords className="text-rose-500" />
              <Avatar avatar={other.avatar} size={64} />
            </div>
          ) : (
            <Mascot mood="happy" size={110} />
          )}
          <p className="muted">
            {t('{n} questions, {s} secondes chacune. Plus tu réponds vite, plus tu gagnes de points !', { n: duel.questions.length, s: duel.secondsPerQuestion })}
          </p>
          {other && <p className="mt-1 text-sm font-bold">{t('Contre {nom}', { nom: other.displayName })}</p>}
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="btn-primary mt-5 px-8 py-3 text-lg" onClick={() => setPhase('play')}>
            {t('C’est parti !')}
          </motion.button>
        </motion.div>
      </div>
    );

  if (phase === 'play' || phase === 'sending') {
    const q = duel.questions[Math.min(i, duel.questions.length - 1)];
    const ratio = left / duel.secondsPerQuestion;
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-3 flex items-center gap-3">
          <span className="chip">{i + 1} / {duel.questions.length}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
            <motion.div className={clsx('h-full rounded-full', ratio > 0.5 ? 'bg-emerald-400' : ratio > 0.2 ? 'bg-amber-400' : 'bg-rose-500')} animate={{ width: `${ratio * 100}%` }} transition={{ duration: 0.1, ease: 'linear' }} />
          </div>
          <span className={clsx('flex w-14 items-center gap-1 font-mono font-black', ratio < 0.2 && 'animate-pulse text-rose-500')}><Clock size={14} /> {Math.ceil(left)}s</span>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={q.id} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} className="card">
            <div className="muted mb-1 text-xs font-black uppercase">{THEME_LABEL[q.theme]?.icon} {t(THEME_LABEL[q.theme]?.label ?? q.theme)}</div>
            <h2 className="text-xl font-black">{q.q}</h2>
            {q.code && <pre className="mt-3 overflow-x-auto rounded-2xl bg-ink-900 p-4 font-mono text-sm leading-6 text-ink-100">{q.code}</pre>}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {q.choices.map((c, k) => (
                <motion.button
                  key={k}
                  whileHover={{ scale: picked === null ? 1.02 : 1 }}
                  whileTap={{ scale: 0.97 }}
                  disabled={picked !== null || phase === 'sending'}
                  onClick={() => answer(k)}
                  className={clsx(
                    'rounded-2xl border-2 px-4 py-3 text-left font-bold transition',
                    picked === k ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-200 hover:border-brand-300 dark:border-ink-700',
                  )}
                >
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-ink-100 text-xs font-black text-ink-600 dark:bg-ink-800 dark:text-ink-300">{'ABCD'[k]}</span>
                  {c}
                </motion.button>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
        {phase === 'sending' && <p className="muted mt-3 text-center font-bold">{t('Calcul des scores…')}</p>}
      </div>
    );
  }

  // Résultats
  const finished = duel.status === 'finished';
  const result = !duel.solo && finished ? (duel.myScore! > duel.theirScore! ? 'win' : duel.myScore! < duel.theirScore! ? 'lose' : 'draw') : null;
  const good = duel.questions.filter((q) => q.mine?.correct).length;
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/communaute" className="btn-ghost btn-sm mb-3"><ArrowLeft size={16} /> {t('Communauté')}</Link>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card mb-4 flex flex-col items-center text-center">
        <Duo scene={result === 'lose' ? 'comfort' : result === 'win' || good >= 7 ? 'trophy' : 'cheer'} size={90} />
        <h1 className="mt-2 text-2xl font-black">
          {result === 'win' ? t('Victoire !') : result === 'lose' ? t('Défaite… la revanche ?') : result === 'draw' ? t('Égalité parfaite !') : !duel.solo && !finished ? t('Bien joué ! En attente de ton ami…') : t('Partie terminée')}
        </h1>
        <div className="mt-3 flex items-center gap-6">
          <div>
            <div className="muted text-xs font-bold">{t('Toi')}</div>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-4xl font-black text-brand-500">{duel.myScore}</motion.div>
          </div>
          {!duel.solo && (
            <>
              <Swords className="text-ink-400" />
              <div>
                <div className="muted text-xs font-bold">{other?.displayName}</div>
                <div className="text-4xl font-black text-rose-500">{finished ? duel.theirScore : '?'}</div>
              </div>
            </>
          )}
        </div>
        <p className="muted mt-2 text-sm">{t('{n} bonnes réponses sur {total}', { n: good, total: duel.questions.length })}</p>
      </motion.div>
      <div className="space-y-2">
        {duel.questions.map((q, k) => (
          <motion.div key={q.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.04 }} className="card !p-4">
            <div className="flex items-start gap-2">
              {q.mine?.correct ? <Check className="mt-0.5 shrink-0 text-emerald-500" size={18} /> : <X className="mt-0.5 shrink-0 text-rose-500" size={18} />}
              <div className="flex-1">
                <div className="font-bold">{q.q}</div>
                {q.code && <pre className="mt-1 overflow-x-auto rounded-xl bg-ink-900 p-2 font-mono text-xs text-ink-100">{q.code}</pre>}
                <div className="mt-1 text-sm">
                  <span className="font-black text-emerald-600 dark:text-emerald-400">{q.choices[q.answer!]}</span>
                  {q.mine && q.mine.choice !== q.answer && <span className="ml-2 text-rose-500 line-through">{q.mine.choice === null ? t('pas de réponse') : q.choices[q.mine.choice]}</span>}
                </div>
                {q.explain && <p className="muted mt-1 text-xs">{q.explain}</p>}
              </div>
              <div className="text-right text-xs font-black">
                <div className="text-brand-500">+{q.mine?.points ?? 0}</div>
                {q.theirs && <div className="text-rose-500">{other?.displayName.slice(0, 10)} +{q.theirs.points}</div>}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="mt-4 flex justify-center">
        <Link to="/communaute" className="btn-primary"><Trophy size={16} /> {t('Nouvelle partie')}</Link>
      </div>
    </div>
  );
}
