import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Check, X, ChevronLeft, ChevronRight, Loader2, FileCheck2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useFeedback, type Rewards } from '../lib/feedback';
import { Loading, ErrorBox, MascotSays, ProgressBar, PageTitle } from '../components/ui';
import Exercise, { type Answer, type PublicExercise } from '../components/Exercise';
import Markdown from '../components/Markdown';
import Mascot from '../components/Mascot';

interface ExamData {
  chapter: { slug: string; title: string; language: string; examPass: number };
  questions: PublicExercise[];
  best: number;
  passed: boolean;
}

interface ExamResult {
  score: number;
  passed: boolean;
  pass: number;
  results: { id: string; correct: boolean; score: number; explanation: string }[];
  chapterCompleted: boolean;
  skipped: boolean;
  rewards: Rewards;
}

export default function Exam() {
  const { slug } = useParams();
  const { celebrate, toast } = useFeedback();
  const { data, error, loading, reload } = useApi<ExamData>(`/chapters/${slug}/exam`, [slug]);
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const answers = useRef<Record<string, Answer>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExamResult | null>(null);
  const t0 = useRef(Date.now());

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Erreur'} onRetry={reload} />;

  async function submit() {
    if (!data) return;
    setBusy(true);
    try {
      const r = await api<ExamResult>(`/chapters/${slug}/exam`, { body: { answers: answers.current, timeMs: Date.now() - t0.current } });
      setResult(r);
      if (r.chapterCompleted) celebrate(r.rewards, { title: 'Chapitre terminé ! 🎓', text: `Examen réussi avec ${r.score} %. Le chapitre suivant est débloqué.` });
      else if (r.skipped) celebrate(r.rewards, { title: 'Chapitre validé par l’examen !', text: 'Tu maîtrises déjà cette notion : le chapitre suivant est débloqué.' });
      else celebrate(r.rewards);
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="card text-center">
          <Mascot mood={result.passed ? 'celebrate' : 'sad'} size={150} />
          <h1 className="text-3xl">{result.passed ? 'Examen réussi !' : 'Pas encore…'}</h1>
          <div className={clsx('mt-2 text-5xl font-black', result.passed ? 'text-emerald-500' : 'text-rose-500')}>{result.score} %</div>
          <p className="muted mt-1">Seuil de réussite : {result.pass} %</p>
          {!result.passed && <p className="mt-3 font-semibold">Les questions manquées ont été ajoutées à tes révisions. Relis le cours, entraîne-toi, puis retente ta chance : tu vas y arriver !</p>}
          {result.passed && !result.chapterCompleted && !result.skipped && <p className="mt-3 font-semibold">Il ne te reste plus qu’à réussir le mini-projet pour terminer le chapitre.</p>}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link to={`/chapitre/${slug}`} className="btn-outline">
              Retour au chapitre
            </Link>
            {!result.passed && (
              <button
                className="btn-primary"
                onClick={() => {
                  setResult(null);
                  setStarted(false);
                  setI(0);
                  answers.current = {};
                }}
              >
                Recommencer l’examen
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {data.questions.map((qq, k) => {
            const r = result.results.find((x) => x.id === qq.id);
            return (
              <div key={qq.id} className="card">
                <div className={clsx('flex items-center gap-2 font-black', r?.correct ? 'text-emerald-500' : 'text-rose-500')}>
                  {r?.correct ? <Check /> : <X />} Question {k + 1}
                </div>
                <Markdown className="mt-1 text-sm">{qq.prompt}</Markdown>
                {r?.explanation && <Markdown className="mt-2 rounded-2xl bg-ink-50 p-3 text-sm dark:bg-ink-800">{r.explanation}</Markdown>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageTitle title={`Examen : ${data.chapter.title}`} />
        <div className="card text-center">
          <FileCheck2 size={48} className="mx-auto text-brand-500" />
          <p className="mt-3 text-lg font-bold">
            {data.questions.length} questions · réussite à partir de {data.chapter.examPass} %
          </p>
          <p className="muted mt-1">Les réponses sont corrigées à la fin. Pas d’indice pendant l’examen, mais aucune pénalité : tu peux le repasser autant de fois que nécessaire.</p>
          {data.best > 0 && <p className="mt-2 font-bold">Meilleur score : {data.best} %{data.passed && ' ✔'}</p>}
          <MascotSays mood="explain" className="mt-4 justify-center text-left">
            Concentre-toi, relis bien chaque question. Je crois en toi !
          </MascotSays>
          <button
            className="btn-primary mt-4 px-8 py-3 text-lg"
            onClick={() => {
              setStarted(true);
              t0.current = Date.now();
            }}
          >
            Commencer l’examen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center gap-3">
        <Link to={`/chapitre/${slug}`} className="btn-ghost btn-sm">
          <X size={18} />
        </Link>
        <ProgressBar value={(i + 1) / data.questions.length} className="flex-1" />
        <span className="text-sm font-bold">
          {i + 1}/{data.questions.length}
        </span>
      </div>
      {data.questions.map((qq, k) => (
        <motion.div key={qq.id} className={k === i ? '' : 'hidden'} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <Exercise exercise={qq} language={data.chapter.language} mode="collect" onAnswerChange={(a) => (answers.current[qq.id] = a)} compact />
        </motion.div>
      ))}
      <div className="mt-4 flex justify-between">
        <button className="btn-outline" disabled={i === 0} onClick={() => setI(i - 1)}>
          <ChevronLeft size={18} /> Précédente
        </button>
        {i < data.questions.length - 1 ? (
          <button className="btn-primary" onClick={() => setI(i + 1)}>
            Suivante <ChevronRight size={18} />
          </button>
        ) : (
          <button className="btn-success" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />} Terminer et corriger
          </button>
        )}
      </div>
    </div>
  );
}
