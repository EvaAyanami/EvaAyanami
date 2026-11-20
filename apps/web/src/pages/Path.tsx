import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Lock, Check, Play, FastForward, Star, FileCheck2, Hammer } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { LANG_META } from '../lib/api';
import { PageTitle, Loading, ErrorBox } from '../components/ui';
import Mascot from '../components/Mascot';

interface MapData {
  language: { id: string; name: string; description: string };
  skillLevel: number;
  levels: {
    level: number;
    name: string;
    chapters: { slug: string; title: string; summary: string; minutes: number; status: 'locked' | 'available' | 'in_progress' | 'done' | 'skipped'; exercises: number; solved: number; examPassed: boolean; projectPassed: boolean }[];
  }[];
}

const LEVEL_COLORS = ['', 'from-emerald-400 to-teal-500', 'from-sky-400 to-brand-500', 'from-brand-500 to-violet-500', 'from-violet-500 to-fuchsia-500', 'from-fuchsia-500 to-rose-500'];

export default function Path() {
  const { lang } = useParams();
  const nav = useNavigate();
  useEffect(() => {
    if (!lang) nav(`/parcours/${localStorage.getItem('cm-last-lang') ?? 'rust'}`, { replace: true });
    else
      try {
        localStorage.setItem('cm-last-lang', lang);
      } catch {
        /* rien */
      }
  }, [lang, nav]);
  const { data, error, loading, reload } = useApi<MapData>(lang ? `/languages/${lang}/map` : null, [lang]);
  if (!lang || (loading && !data)) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Erreur'} onRetry={reload} />;
  const current = data.levels.flatMap((l) => l.chapters).find((c) => c.status === 'in_progress' || c.status === 'available');

  return (
    <div>
      <PageTitle title={`Parcours ${data.language.name}`} subtitle={data.language.description}>
        <div className="flex gap-1 rounded-2xl bg-ink-100 p-1 dark:bg-ink-800">
          {Object.entries(LANG_META).map(([id, m]) => (
            <Link key={id} to={`/parcours/${id}`} className={clsx('rounded-xl px-3 py-1.5 text-sm font-extrabold', id === lang ? 'bg-white shadow dark:bg-ink-900' : 'text-ink-500')}>
              {m.icon} {m.name}
            </Link>
          ))}
        </div>
      </PageTitle>

      <div className="space-y-8">
        {data.levels.map((lv) => {
          const done = lv.chapters.filter((c) => c.status === 'done' || c.status === 'skipped').length;
          return (
            <section key={lv.level}>
              <div className={`mb-4 flex items-center gap-3 rounded-3xl bg-gradient-to-r ${LEVEL_COLORS[lv.level]} px-5 py-3 text-white shadow-soft`}>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/25 text-lg font-black">{lv.level}</div>
                <div className="flex-1">
                  <div className="text-lg font-black">{lv.name}</div>
                  <div className="text-xs font-bold opacity-90">
                    {done}/{lv.chapters.length} chapitres validés
                  </div>
                </div>
                {data.skillLevel === lv.level && <span className="rounded-full bg-white/25 px-3 py-1 text-xs font-black">Ton niveau</span>}
              </div>
              <div className="relative mx-auto max-w-2xl">
                {lv.chapters.map((c, i) => {
                  const offset = [0, 60, 90, 60, 0, -60, -90, -60][i % 8];
                  const isCurrent = current?.slug === c.slug;
                  const Icon = c.status === 'done' ? Check : c.status === 'skipped' ? FastForward : c.status === 'locked' ? Lock : Play;
                  return (
                    <motion.div key={c.slug} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="relative mb-3 flex items-center sm:[transform:translateX(var(--o))]" style={{ ['--o' as string]: `${offset}px` }}>
                      <Link to={`/chapitre/${c.slug}`} className="group flex w-full items-center gap-4">
                        <div className="relative">
                          {isCurrent && (
                            <div className="absolute -left-20 -top-10 hidden sm:block">
                              <Mascot mood="coding" size={70} />
                            </div>
                          )}
                          <div
                            className={clsx(
                              'flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-b-[6px] text-white transition group-hover:scale-105',
                              c.status === 'done' && 'border-amber-600 bg-amber-400',
                              c.status === 'skipped' && 'border-emerald-700 bg-emerald-500',
                              (c.status === 'available' || c.status === 'in_progress') && 'border-brand-700 bg-brand-500',
                              c.status === 'locked' && 'border-ink-300 bg-ink-200 text-ink-400 dark:border-ink-700 dark:bg-ink-800',
                              isCurrent && 'ring-8 ring-brand-200 dark:ring-brand-900',
                            )}
                          >
                            <Icon size={26} />
                          </div>
                        </div>
                        <div className={clsx('card flex-1 !p-3 transition group-hover:shadow-lg', c.status === 'locked' && 'opacity-70')}>
                          <div className="flex items-center gap-2">
                            <span className="font-black">{c.title}</span>
                            {c.status === 'skipped' && <span className="chip">passé</span>}
                          </div>
                          <div className="muted line-clamp-2 text-xs">{c.summary}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-bold text-ink-500">
                            <span>⏱ {c.minutes} min</span>
                            <span className="flex items-center gap-0.5">
                              <Star size={11} /> {c.solved}/{c.exercises}
                            </span>
                            <span className={clsx('flex items-center gap-0.5', c.projectPassed && 'text-emerald-500')}>
                              <Hammer size={11} /> projet
                            </span>
                            <span className={clsx('flex items-center gap-0.5', c.examPassed && 'text-emerald-500')}>
                              <FileCheck2 size={11} /> examen
                            </span>
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
