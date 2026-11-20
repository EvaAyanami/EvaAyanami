import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { Check, ChevronLeft, Target, ShieldAlert, ListChecks, Lock } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { LANG_META } from '../lib/api';
import { Loading, ErrorBox, ProgressBar } from '../components/ui';
import Markdown from '../components/Markdown';
import Exercise, { type PublicExercise, type GradeResult } from '../components/Exercise';

interface ProjectData {
  slug: string;
  title: string;
  summary: string;
  description: string;
  objectives: string[];
  constraints: string[];
  levelName: string;
  languages: string[];
  language: string;
  completed: boolean;
  steps: PublicExercise[];
}

export default function ProjectPage() {
  const { slug } = useParams();
  const [sp, setSp] = useSearchParams();
  const language = sp.get('language') ?? '';
  const { data, error, loading, reload, setData } = useApi<ProjectData>(`/projects/${slug}${language ? `?language=${language}` : ''}`, [slug, language]);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!data) return;
    document.title = `${data.title} · Codemori`;
    const firstTodo = data.steps.findIndex((s) => !s.state?.solved);
    setStep(firstTodo === -1 ? data.steps.length - 1 : firstTodo);
  }, [data?.slug, data?.language]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Erreur'} onRetry={reload} />;
  const done = data.steps.filter((s) => s.state?.solved).length;
  const unlocked = (i: number) => i === 0 || !!data.steps[i - 1].state?.solved;

  const onGraded = (id: string) => (r: GradeResult) => {
    if (r.correct) setData((d) => d && { ...d, completed: d.completed || !!r.projectCompleted, steps: d.steps.map((s) => (s.id === id ? { ...s, state: { ...(s.state ?? { attempts: 0, draft: null, hintsUsed: 0 }), solved: true } } : s)) });
  };

  return (
    <div>
      <Link to="/projets" className="btn-ghost btn-sm mb-2">
        <ChevronLeft size={16} /> Projets
      </Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="muted text-sm font-bold">{data.levelName}</div>
          <h1 className="text-3xl">{data.title} {data.completed && '🏁'}</h1>
          <p className="muted">{data.summary}</p>
        </div>
        <div className="flex gap-1 rounded-2xl bg-ink-100 p-1 dark:bg-ink-800">
          {data.languages.map((l) => (
            <button key={l} onClick={() => setSp({ language: l })} className={clsx('rounded-xl px-3 py-1.5 text-sm font-extrabold', l === data.language ? 'bg-white shadow dark:bg-ink-900' : 'text-ink-500')}>
              {LANG_META[l].icon} {LANG_META[l].name}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="section-title mb-2">Cahier des charges</h2>
          <Markdown>{data.description}</Markdown>
        </div>
        <div className="space-y-4">
          <div className="card">
            <h3 className="mb-2 flex items-center gap-2 font-black"><Target size={18} className="text-brand-500" /> Objectifs</h3>
            <ul className="space-y-1 text-sm">{data.objectives.map((o) => <li key={o} className="flex gap-2"><Check size={14} className="mt-1 shrink-0 text-emerald-500" />{o}</li>)}</ul>
          </div>
          <div className="card">
            <h3 className="mb-2 flex items-center gap-2 font-black"><ShieldAlert size={18} className="text-amber-500" /> Contraintes</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">{data.constraints.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="mb-2 flex items-center gap-2">
          <ListChecks size={18} className="text-violet-500" />
          <h2 className="section-title flex-1">Étapes ({done}/{data.steps.length})</h2>
        </div>
        <ProgressBar value={done / data.steps.length} className="mb-3" />
        <div className="flex flex-wrap gap-2">
          {data.steps.map((s, i) => (
            <button key={s.id} disabled={!unlocked(i)} onClick={() => setStep(i)} className={clsx('flex items-center gap-1 rounded-xl border-2 px-3 py-1.5 text-sm font-bold', i === step ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/30' : 'border-ink-200 dark:border-ink-700', !unlocked(i) && 'opacity-50')}>
              {s.state?.solved ? <Check size={14} className="text-emerald-500" /> : !unlocked(i) ? <Lock size={12} /> : <span>{i + 1}.</span>} {s.title}
            </button>
          ))}
        </div>
      </div>

      <Exercise key={`${data.steps[step].id}-${data.language}`} exercise={data.steps[step]} language={data.language} onGraded={onGraded(data.steps[step].id)} />
      {data.steps[step].state?.solved && step < data.steps.length - 1 && (
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={() => setStep(step + 1)}>Étape suivante</button>
        </div>
      )}
    </div>
  );
}
