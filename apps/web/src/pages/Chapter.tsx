import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { BookOpen, Dumbbell, Hammer, FileCheck2, ChevronLeft, ChevronRight, Check, Lock, Sparkles, Wand2, RotateCcw, Loader2, Clock } from 'lucide-react';
import { api, ApiError, LANG_META } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useFeedback } from '../lib/feedback';
import { Loading, ErrorBox, MascotSays, ProgressBar, Modal } from '../components/ui';
import Markdown from '../components/Markdown';
import Exercise, { type PublicExercise, type GradeResult } from '../components/Exercise';

interface ChapterData {
  chapter: { slug: string; title: string; summary: string; level: number; levelName: string; language: string; concepts: string[]; sections: { title: string; body: string }[]; minutes: number; examPass: number; examCount: number };
  status: 'locked' | 'available' | 'in_progress' | 'done' | 'skipped';
  progress: { position: number; sectionsRead: number; examPassed: boolean; examScore: number; projectPassed: boolean; completedAt: string | null } | null;
  exercises: PublicExercise[];
  project: PublicExercise | null;
  prev: { slug: string; title: string } | null;
  next: { slug: string; title: string; status: string } | null;
}

type Tab = 'cours' | 'exercices' | 'projet' | 'examen';

export default function Chapter() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { setAssistant, toast } = useFeedback();
  const { data, error, loading, reload, setData } = useApi<ChapterData>(`/chapters/${slug}`, [slug]);
  const [tab, setTab] = useState<Tab>('cours');
  const [section, setSection] = useState(0);
  const [exIndex, setExIndex] = useState(0);
  const [reform, setReform] = useState<{ text: string; source: string } | null>(null);
  const [reformBusy, setReformBusy] = useState(false);
  const [extra, setExtra] = useState<{ items: PublicExercise[]; source: string } | null>(null);
  const [extraBusy, setExtraBusy] = useState(false);

  // Reprendre exactement là où l'utilisateur s'est arrêté
  useEffect(() => {
    if (!data) return;
    document.title = `${data.chapter.title} · Codemori`;
    const pos = data.progress?.position ?? 0;
    const nS = data.chapter.sections.length;
    const nE = data.exercises.length;
    if (pos < nS) {
      setTab('cours');
      setSection(pos);
    } else if (pos < nS + nE) {
      setTab('exercices');
      setExIndex(pos - nS);
    } else if (pos === nS + nE) setTab('projet');
    else setTab('cours');
    setAssistant({ language: data.chapter.language, chapterSlug: data.chapter.slug, label: data.chapter.title });
  }, [data?.chapter.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const savePosition = (position: number, sectionsRead?: number) => {
    api(`/chapters/${slug}/position`, { body: { position, sectionsRead } }).catch(() => {});
  };

  const steps = useMemo(() => {
    if (!data) return { total: 1, done: 0 };
    const total = data.exercises.length + 2;
    const done = data.exercises.filter((e) => e.state?.solved).length + (data.progress?.projectPassed ? 1 : 0) + (data.progress?.examPassed ? 1 : 0);
    return { total, done };
  }, [data]);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Erreur'} onRetry={reload} />;
  const { chapter } = data;
  const lang = LANG_META[chapter.language];
  const nS = chapter.sections.length;

  const goSection = (i: number) => {
    setSection(i);
    setReform(null);
    savePosition(i, Math.max(i + 1, data.progress?.sectionsRead ?? 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const goExercise = (i: number) => {
    setExIndex(i);
    savePosition(nS + i);
  };

  const onGraded = (id: string) => (r: GradeResult) => {
    if (!r.correct) return;
    setData((d) =>
      d && {
        ...d,
        exercises: d.exercises.map((e) => (e.id === id ? { ...e, state: { ...(e.state ?? { attempts: 0, draft: null, hintsUsed: 0 }), solved: true } } : e)),
        project: d.project && d.project.id === id ? { ...d.project, state: { ...(d.project.state ?? { attempts: 0, draft: null, hintsUsed: 0 }), solved: true } } : d.project,
        progress: d.project?.id === id ? { ...(d.progress ?? { position: 0, sectionsRead: 0, examPassed: false, examScore: 0, completedAt: null }), projectPassed: true } : d.progress,
      },
    );
  };

  async function reformulate() {
    setReformBusy(true);
    try {
      const r = await api<{ answer: string; source: string }>('/assistant/reformulate', { body: { chapterSlug: chapter.slug, section } });
      setReform({ text: r.answer, source: r.source });
    } catch (e) {
      ((e as ApiError).status !== 402 && toast((e as ApiError).message, 'error'));
    } finally {
      setReformBusy(false);
    }
  }

  async function morePractice() {
    setExtraBusy(true);
    try {
      setExtra(await api<{ items: PublicExercise[]; source: string }>('/assistant/practice', { body: { chapterSlug: chapter.slug } }));
    } catch (e) {
      ((e as ApiError).status !== 402 && toast((e as ApiError).message, 'error'));
    } finally {
      setExtraBusy(false);
    }
  }

  async function resetChapter() {
    if (!confirm('Recommencer ce chapitre ? Ta progression (examen, mini-projet) sera remise à zéro, mais tes exercices réussis et ton XP sont conservés.')) return;
    await api(`/me/chapters/${chapter.slug}/reset`, { body: {} });
    toast('Chapitre réinitialisé', 'success');
    reload();
  }

  const TABS: { id: Tab; label: string; icon: typeof BookOpen; badge?: string }[] = [
    { id: 'cours', label: 'Cours', icon: BookOpen, badge: `${nS}` },
    { id: 'exercices', label: 'Exercices', icon: Dumbbell, badge: `${data.exercises.filter((e) => e.state?.solved).length}/${data.exercises.length}` },
    { id: 'projet', label: 'Mini-projet', icon: Hammer, badge: data.progress?.projectPassed ? '✔' : undefined },
    { id: 'examen', label: 'Examen', icon: FileCheck2, badge: data.progress?.examPassed ? '✔' : undefined },
  ];

  return (
    <div>
      {/* En-tête */}
      <div className="mb-5">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-bold">
          <Link to={`/parcours/${chapter.language}`} className="text-brand-500 hover:underline">
            {lang.icon} {lang.name}
          </Link>
          <span className="muted">›</span>
          <span className="muted">{chapter.levelName}</span>
          {data.status === 'done' && <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">🎓 Terminé</span>}
          {data.status === 'skipped' && <span className="chip">Passé</span>}
        </div>
        <h1 className="text-3xl text-ink-900 dark:text-white">{chapter.title}</h1>
        <p className="muted mt-1">{chapter.summary}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ProgressBar value={steps.done / steps.total} className="h-2.5 w-48" />
          <span className="text-xs font-bold">
            {steps.done}/{steps.total} étapes
          </span>
          <span className="muted flex items-center gap-1 text-xs font-bold">
            <Clock size={12} /> ~{chapter.minutes} min
          </span>
          {(data.progress?.examPassed || data.progress?.projectPassed) && (
            <button className="btn-ghost btn-sm" onClick={resetChapter}>
              <RotateCcw size={14} /> Recommencer
            </button>
          )}
        </div>
      </div>

      {data.status === 'locked' && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-3xl border-2 border-dashed border-ink-300 p-4 dark:border-ink-700">
          <Lock className="text-ink-400" />
          <div className="flex-1 text-sm">
            <b>Chapitre verrouillé.</b> Termine le chapitre précédent, ou prouve que tu maîtrises déjà cette notion en réussissant directement l’examen.
          </div>
          <Link to={`/chapitre/${chapter.slug}/examen`} className="btn-primary btn-sm">
            Passer l’examen
          </Link>
        </div>
      )}

      {/* Onglets */}
      <div className="scrollbar-thin mb-4 flex gap-1 overflow-x-auto rounded-2xl bg-ink-100 p-1 dark:bg-ink-900">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              if (t.id === 'examen') return nav(`/chapitre/${chapter.slug}/examen`);
              setTab(t.id);
              if (t.id === 'projet') savePosition(nS + data.exercises.length);
            }}
            className={clsx('flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 font-extrabold transition', tab === t.id ? 'bg-white text-brand-600 shadow dark:bg-ink-800 dark:text-brand-300' : 'text-ink-500')}
          >
            <t.icon size={18} /> {t.label}
            {t.badge && <span className="rounded-full bg-ink-200 px-1.5 text-[10px] dark:bg-ink-700">{t.badge}</span>}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'cours' && (
          <motion.div key={`s${section}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <nav className="hidden space-y-1 lg:block">
              {chapter.sections.map((s, i) => (
                <button key={i} onClick={() => goSection(i)} className={clsx('flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold', i === section ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800')}>
                  <span className={clsx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]', i < (data.progress?.sectionsRead ?? 0) ? 'bg-emerald-500 text-white' : 'bg-ink-200 dark:bg-ink-700')}>
                    {i < (data.progress?.sectionsRead ?? 0) ? <Check size={11} /> : i + 1}
                  </span>
                  {s.title}
                </button>
              ))}
            </nav>
            <article className="card">
              <div className="muted mb-1 text-xs font-extrabold uppercase tracking-wide">
                Partie {section + 1} / {nS}
              </div>
              <h2 className="mb-2 text-2xl text-ink-900 dark:text-white">{chapter.sections[section].title}</h2>
              <Markdown>{chapter.sections[section].body}</Markdown>
              <div className="mt-4 rounded-2xl bg-violet-50 p-3 dark:bg-violet-950/20">
                <button className="btn-ghost btn-sm text-violet-600 dark:text-violet-300" onClick={reformulate} disabled={reformBusy}>
                  {reformBusy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Kiri, peux-tu reformuler ?
                </button>
                {reform && <Markdown className="mt-2 text-sm">{reform.text}</Markdown>}
              </div>
              <div className="mt-6 flex justify-between">
                <button className="btn-outline" disabled={section === 0} onClick={() => goSection(section - 1)}>
                  <ChevronLeft size={18} /> Précédent
                </button>
                {section < nS - 1 ? (
                  <button className="btn-primary" onClick={() => goSection(section + 1)}>
                    Suivant <ChevronRight size={18} />
                  </button>
                ) : (
                  <button
                    className="btn-primary"
                    onClick={() => {
                      savePosition(nS, nS);
                      setTab('exercices');
                      setExIndex(0);
                    }}
                  >
                    Passer aux exercices <Dumbbell size={18} />
                  </button>
                )}
              </div>
            </article>
          </motion.div>
        )}

        {tab === 'exercices' && data.exercises.length > 0 && (
          <motion.div key="ex" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="scrollbar-thin mb-4 flex gap-2 overflow-x-auto pb-1">
              {data.exercises.map((e, i) => (
                <button
                  key={e.id}
                  onClick={() => goExercise(i)}
                  className={clsx(
                    'flex h-10 min-w-10 items-center justify-center rounded-xl border-b-4 px-3 text-sm font-black',
                    i === exIndex ? 'border-brand-700 bg-brand-500 text-white' : e.state?.solved ? 'border-emerald-600 bg-emerald-400 text-white' : 'border-ink-300 bg-ink-100 dark:border-ink-700 dark:bg-ink-800',
                  )}
                  title={e.title || e.type}
                >
                  {e.state?.solved && i !== exIndex ? <Check size={16} /> : i + 1}
                </button>
              ))}
            </div>
            <Exercise key={data.exercises[exIndex].id} exercise={data.exercises[exIndex]} language={chapter.language} onGraded={onGraded(data.exercises[exIndex].id)} />
            <div className="mt-4 flex flex-wrap justify-between gap-2">
              <button className="btn-outline" disabled={exIndex === 0} onClick={() => goExercise(exIndex - 1)}>
                <ChevronLeft size={18} /> Précédent
              </button>
              <button className="btn-ghost text-violet-600 dark:text-violet-300" onClick={morePractice} disabled={extraBusy}>
                {extraBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Exercices supplémentaires
              </button>
              {exIndex < data.exercises.length - 1 ? (
                <button className="btn-primary" onClick={() => goExercise(exIndex + 1)}>
                  Suivant <ChevronRight size={18} />
                </button>
              ) : (
                <button
                  className="btn-primary"
                  onClick={() => {
                    setTab('projet');
                    savePosition(nS + data.exercises.length);
                  }}
                >
                  Mini-projet <Hammer size={18} />
                </button>
              )}
            </div>
          </motion.div>
        )}

        {tab === 'projet' && data.project && (
          <motion.div key="pj" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <MascotSays mood="coding" className="mb-4">
              Le mini-projet met en pratique tout le chapitre. Il est vérifié par de vrais tests, dont certains sont cachés. Avec l’examen, il valide le chapitre !
            </MascotSays>
            <Exercise exercise={data.project} language={chapter.language} onGraded={onGraded(data.project.id)} />
            <div className="mt-4 flex justify-end">
              <Link to={`/chapitre/${chapter.slug}/examen`} className="btn-primary">
                Passer à l’examen <FileCheck2 size={18} />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation entre chapitres */}
      <div className="mt-8 flex flex-wrap justify-between gap-2 border-t border-ink-200 pt-4 dark:border-ink-800">
        {data.prev ? (
          <Link to={`/chapitre/${data.prev.slug}`} className="btn-ghost">
            <ChevronLeft size={18} /> {data.prev.title}
          </Link>
        ) : (
          <span />
        )}
        {data.next && (
          <Link to={`/chapitre/${data.next.slug}`} className={clsx('btn-ghost', data.next.status === 'locked' && 'opacity-60')}>
            {data.next.status === 'locked' && <Lock size={14} />} {data.next.title} <ChevronRight size={18} />
          </Link>
        )}
      </div>

      <Modal open={!!extra} onClose={() => setExtra(null)} title={`Exercices supplémentaires${extra?.source === 'ai' ? ' (générés par IA)' : ''}`} wide>
        {extra && extra.items.length === 0 && <p className="muted">Tu as déjà réussi tous les exercices liés à ces notions. Bravo ! 🎉</p>}
        <div className="space-y-4">
          {extra?.items.map((it) => (
            <Exercise
              key={it.id}
              exercise={it}
              language={chapter.language}
              submitter={
                it.generated
                  ? async (a) => {
                      const r = await api<{ correct: boolean; reveal: { answer: number }; explanation: string }>(`/assistant/practice/${it.id}/answer`, { body: { choice: a.choice } });
                      return { correct: r.correct, score: r.correct ? 100 : 0, feedback: r.correct ? 'Bonne réponse !' : 'Ce n’est pas la bonne réponse.', explanation: r.explanation, reveal: r.reveal };
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </Modal>
    </div>
  );
}
