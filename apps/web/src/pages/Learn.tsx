import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { CATEGORY_LABEL, langMeta, LEVEL_NAMES } from '../lib/api';
import { PageTitle, ProgressBar, Loading, ErrorBox, MascotSays } from '../components/ui';

interface Lang {
  id: string;
  category: string;
  runtime: string;
  name: string;
  tagline: string;
  description: string;
  version: string;
  chapterCount: number;
  completed: number;
  validated: number;
  progress: number;
  skillLevel: number;
  next: { slug: string; title: string } | null;
}

/** Illustrations des cartes de parcours */
function LangArt({ id }: { id: string }) {
  if (id === 'rust')
    return (
      <svg viewBox="0 0 120 80" className="h-24 w-full">
        <circle cx="60" cy="44" r="26" fill="#fff" opacity="0.15" />
        <g fill="#fff">
          <ellipse cx="60" cy="48" rx="22" ry="14" />
          <circle cx="50" cy="38" r="4" fill="#1f2538" />
          <circle cx="70" cy="38" r="4" fill="#1f2538" />
          <path d="M38 46 q-14 -10 -10 -22 q6 8 14 10z M82 46 q14 -10 10 -22 q-6 8 -14 10z" />
          <path d="M44 58 l-6 10 M52 61 l-3 10 M68 61 l3 10 M76 58 l6 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        </g>
      </svg>
    );
  if (id === 'cpp')
    return (
      <svg viewBox="0 0 120 80" className="h-24 w-full">
        <circle cx="60" cy="40" r="28" fill="#fff" opacity="0.15" />
        <text x="60" y="52" textAnchor="middle" fontSize="34" fontWeight="900" fill="#fff" fontFamily="Nunito">C++</text>
        <circle cx="96" cy="18" r="6" fill="#22d3ee" />
      </svg>
    );
  if (id !== 'java')
    return (
      <div className="relative flex h-24 items-center justify-center">
        <motion.div className="absolute h-16 w-16 rounded-full bg-white/15" animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 3, repeat: Infinity }} />
        <motion.span className="relative text-5xl drop-shadow" animate={{ y: [0, -4, 0], rotate: [0, -4, 4, 0] }} transition={{ duration: 4, repeat: Infinity }}>
          {langMeta(id).icon}
        </motion.span>
      </div>
    );
  return (
    <svg viewBox="0 0 120 80" className="h-24 w-full">
      <circle cx="60" cy="42" r="28" fill="#fff" opacity="0.15" />
      <path d="M42 34h32v18a12 12 0 0 1-12 12h-8a12 12 0 0 1-12-12z" fill="#fff" />
      <path d="M74 38h4a6 6 0 0 1 0 12h-4" stroke="#fff" strokeWidth="4" fill="none" />
      <path d="M52 14q-6 6 0 12q6 6 0 12M62 12q-6 6 0 12q6 6 0 12" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

export default function Learn() {
  const { data, error, loading, reload } = useApi<Lang[]>('/languages');
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Erreur'} onRetry={reload} />;
  return (
    <div>
      <PageTitle title="Apprendre" subtitle="Des parcours indépendants, de débutant absolu à expert. Ton niveau est suivi séparément pour chaque piste." />
      <MascotSays mood="explain" className="mb-6">
        Choisis un parcours ! Chaque chapitre contient un cours, des exercices interactifs, un mini-projet et un examen de validation.
      </MascotSays>
      {(['code', 'web', 'graphics', 'hardware'] as const).map((cat) => {
        const list = data.filter((l) => (l.category ?? 'code') === cat);
        if (!list.length) return null;
        return (
          <section key={cat} className="mb-8">
            <h2 className="text-xl font-black text-ink-900 dark:text-white">{CATEGORY_LABEL[cat].title}</h2>
            <p className="muted mb-3 text-sm">{CATEGORY_LABEL[cat].subtitle}</p>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {list.map((l, i) => {
          const m = langMeta(l.id);
          return (
            <motion.div key={l.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="card flex flex-col overflow-hidden !p-0">
              <div className={`bg-gradient-to-br ${m.gradient} px-5 pb-2 pt-5 text-white`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black">{l.name}</h2>
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">{l.runtime === 'none' ? 'Notions' : l.version}</span>
                </div>
                <LangArt id={l.id} />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <p className="font-extrabold">{l.tagline}</p>
                <p className="muted mt-1 flex-1 text-sm">{l.description}</p>
                <div className="mt-4 text-sm font-bold">
                  Ton niveau : <span className="text-brand-500">{LEVEL_NAMES[l.skillLevel]}</span>
                </div>
                <ProgressBar value={l.progress} className="mt-2" />
                <div className="muted mt-1 text-xs font-bold">
                  {l.validated}/{l.chapterCount} chapitres validés · {l.completed} terminés
                </div>
                <div className="mt-4 flex gap-2">
                  {l.next && (
                    <Link to={`/chapitre/${l.next.slug}`} className="btn-primary flex-1">
                      Continuer
                    </Link>
                  )}
                  <Link to={`/parcours/${l.id}`} className="btn-outline flex-1">
                    Parcours <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
          </section>
        );
      })}
    </div>
  );
}
