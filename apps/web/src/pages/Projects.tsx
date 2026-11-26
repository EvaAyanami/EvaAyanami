import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApi } from '../lib/hooks';
import { LANG_META, langMeta, LEVEL_NAMES, levelName } from '../lib/api';
import { PageTitle, Loading, ErrorBox, ProgressBar, MascotSays } from '../components/ui';
import { t } from '../lib/i18n';

interface P {
  slug: string;
  title: string;
  summary: string;
  level: number;
  levelName: string;
  languages: string[];
  steps: number;
  progress: { language: string; stepsDone: number; completed: boolean }[];
}

export default function Projects() {
  const { data, error, loading, reload } = useApi<P[]>('/projects');
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Erreur'} onRetry={reload} />;
  return (
    <div>
      <PageTitle title={t("Projets")} subtitle="Des projets progressifs pour mettre en pratique : cahier des charges, étapes, contraintes et tests automatisés." />
      <MascotSays mood="coding" className="mb-6">
        {t("Chaque projet peut être réalisé en Rust, en C++ ou en Java. Choisis ton langage et avance étape par étape !")}
      </MascotSays>
      {[1, 2, 3, 4, 5].map((lv) => {
        const list = data.filter((p) => p.level === lv);
        if (!list.length) return null;
        return (
          <section key={lv} className="mb-8">
            <h2 className="section-title mb-3">{levelName(lv)}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p, i) => {
                const best = Math.max(0, ...p.progress.map((x) => x.stepsDone));
                return (
                  <motion.div key={p.slug} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <Link to={`/projets/${p.slug}`} className="card block h-full transition hover:-translate-y-0.5 hover:shadow-lg">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-lg font-black">{p.title}</h3>
                        {p.progress.some((x) => x.completed) && <span className="text-xl">🏁</span>}
                      </div>
                      <p className="muted mt-1 text-sm">{p.summary}</p>
                      <div className="mt-3 flex gap-1">
                        {p.languages.map((l) => {
                          const done = p.progress.find((x) => x.language === l)?.completed;
                          return (
                            <span key={l} className={`chip ${done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : ''}`}>
                              {langMeta(l).icon} {langMeta(l).name}
                            </span>
                          );
                        })}
                      </div>
                      <ProgressBar value={best / p.steps} className="mt-3 h-2" />
                      <div className="muted mt-1 text-xs font-bold">{p.steps} étapes</div>
                    </Link>
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
