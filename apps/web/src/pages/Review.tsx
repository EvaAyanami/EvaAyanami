import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronRight, RotateCcw, Brain } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { LANG_META } from '../lib/api';
import { PageTitle, Loading, ErrorBox, ProgressBar, MascotSays, Bars, LangBadge, Empty } from '../components/ui';
import Exercise, { type PublicExercise, type GradeResult } from '../components/Exercise';
import { t } from '../lib/i18n';

interface Summary {
  due: { language: string; count: number }[];
  total: number;
  mastered: number;
  forecast: { day: number; count: number }[];
  weakPoints: { concept: string; language: string; successRate: number; attempts: number }[];
}
type Item = PublicExercise & { reviewReason: string; lapses: number };

export default function Review() {
  const summary = useApi<Summary>('/review/summary');
  const [language, setLanguage] = useState<string | null>(null);
  const [session, setSession] = useState<{ items: Item[]; i: number; correct: number; done: boolean } | null>(null);
  const [answered, setAnswered] = useState(false);
  const [loadingQ, setLoadingQ] = useState(false);

  async function start(lang?: string) {
    setLoadingQ(true);
    setLanguage(lang ?? null);
    const r = await fetch(`/api/review/queue${lang ? `?language=${lang}` : ''}`).then((x) => x.json());
    setSession({ items: r.items, i: 0, correct: 0, done: r.items.length === 0 });
    setAnswered(false);
    setLoadingQ(false);
  }

  if (session) {
    if (session.done || session.i >= session.items.length) {
      return (
        <div className="mx-auto max-w-xl">
          <Empty title={session.items.length ? 'Session de révision terminée !' : 'Rien à réviser pour le moment'} text={session.items.length ? `${session.correct}/${session.items.length} réponses justes. Les intervalles de révision ont été ajustés.` : 'Reviens plus tard : les notions apprises réapparaîtront au bon moment pour être consolidées.'}>
            <div className="flex gap-2">
              <button className="btn-outline" onClick={() => { setSession(null); summary.reload(); }}>{t("Retour")}</button>
              <Link to="/apprendre" className="btn-primary">{t("Apprendre")}</Link>
            </div>
          </Empty>
        </div>
      );
    }
    const it = session.items[session.i];
    return (
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center gap-3">
          <button className="btn-ghost btn-sm" onClick={() => { setSession(null); summary.reload(); }}>{t("Quitter")}</button>
          <ProgressBar value={session.i / session.items.length} className="flex-1" color="bg-violet-500" />
          <span className="text-sm font-bold">{session.i + 1}/{session.items.length}</span>
        </div>
        <div className="mb-2 flex items-center gap-2">
          <span className="chip bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"><RotateCcw size={12} /> {it.reviewReason}</span>
          {it.language && <LangBadge lang={it.language} />}
        </div>
        <Exercise
          key={it.id}
          exercise={it}
          language={it.language ?? language ?? 'rust'}
          mode="review"
          onGraded={(r: GradeResult) => {
            setAnswered(true);
            if (r.correct) setSession((s) => s && { ...s, correct: s.correct + 1 });
          }}
        />
        <div className="mt-4 flex justify-end">
          <button className={clsx('btn-primary', !answered && 'opacity-60')} onClick={() => { setAnswered(false); setSession((s) => s && { ...s, i: s.i + 1 }); }}>
            {answered ? 'Suivant' : 'Passer'} <ChevronRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  const s = summary.data;
  if (summary.loading && !s) return <Loading />;
  if (summary.error || !s) return <ErrorBox message={summary.error ?? 'Erreur'} onRetry={summary.reload} />;
  const totalDue = s.due.reduce((a, b) => a + b.count, 0);
  return (
    <div>
      <PageTitle title={t("Révisions")} subtitle="Répétition espacée : tes anciennes erreurs, les notions fragiles et celles que tu risques d’oublier reviennent au bon moment." />
      <MascotSays mood={totalDue ? 'explain' : 'happy'} className="mb-6">
        {totalDue ? `${totalDue} notion${totalDue > 1 ? 's' : ''} à réviser maintenant. Quelques minutes suffisent pour consolider ta mémoire !` : 'Tout est à jour ! Les prochaines révisions arriveront automatiquement.'}
      </MascotSays>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="section-title mb-3">{t("Lancer une session")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <button className="btn-primary py-4 text-lg" onClick={() => start()} disabled={loadingQ}>
              <Brain /> Toutes les révisions ({totalDue})
            </button>
            {Object.entries(LANG_META).map(([id, m]) => {
              const c = s.due.find((d) => d.language === id)?.count ?? 0;
              return (
                <button key={id} className="btn-outline py-4" onClick={() => start(id)} disabled={loadingQ}>
                  {m.icon} {m.name} ({c})
                </button>
              );
            })}
          </div>
          <p className="muted mt-3 text-sm">{t("Si aucune révision n’est due, la session te propose des exercices réussis il y a longtemps pour éviter l’oubli.")}</p>
        </div>
        <div className="card">
          <h2 className="section-title">{t("Mémoire")}</h2>
          <div className="mt-2 text-3xl font-black">{s.mastered}<span className="muted text-base"> / {s.total}</span></div>
          <div className="muted text-sm">{t("notions solidement mémorisées (intervalle ≥ 3 semaines)")}</div>
          <h3 className="mt-4 text-sm font-extrabold">{t("Prévisions (7 jours)")}</h3>
          <div className="mt-2"><Bars data={s.forecast.map((f) => ({ key: `J+${f.day}`, value: f.count }))} height={80} color="#8b5cf6" /></div>
        </div>
        <div className="card lg:col-span-3">
          <h2 className="section-title mb-3">{t("Notions mal maîtrisées")}</h2>
          {s.weakPoints.length === 0 ? <p className="muted text-sm">{t("Aucun point faible détecté pour le moment.")}</p> : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {s.weakPoints.map((w) => (
                <div key={w.concept + w.language} className="flex items-center gap-2 rounded-2xl bg-ink-50 p-3 dark:bg-ink-800">
                  <LangBadge lang={w.language} />
                  <span className="flex-1 font-bold">{w.concept}</span>
                  <span className="text-sm font-black text-rose-500">{Math.round(w.successRate * 100)} %</span>
                  <Link to={`/exercices?search=${encodeURIComponent(w.concept)}`} className="btn-ghost btn-sm">{t("S’entraîner")}</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
