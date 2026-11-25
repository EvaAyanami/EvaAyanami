import { useApi } from '../lib/hooks';
import { formatDuration, LANG_META, langMeta, TYPE_LABEL } from '../lib/api';
import { PageTitle, Loading, ErrorBox, Bars, ProgressBar, LangBadge } from '../components/ui';
import { Link } from 'react-router-dom';

interface S {
  daily: { date: string; xp: number; exercises: number; correct: number; timeMs: number }[];
  byType: { type: string; total: number; successRate: number }[];
  byLanguage: { language: string; attempts: number; successRate: number; solved: number }[];
  exams: { chapter: string; slug: string; language: string; score: number; passed: boolean }[];
  weakPoints: { concept: string; language: string; successRate: number; attempts: number }[];
  totals: { xp: number; level: { level: number }; longestStreak: number; learningTimeMs: number };
}

export default function Stats() {
  const { data, error, loading, reload } = useApi<S>('/stats');
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Erreur'} onRetry={reload} />;
  const days = Array.from({ length: 90 }, (_, i) => {
    const d = new Date(Date.now() - (89 - i) * 86400_000);
    const key = d.toISOString().slice(0, 10);
    const a = data.daily.find((x) => x.date === key);
    return { key, a, title: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) };
  });
  const tot = data.daily.reduce((s, d) => ({ ex: s.ex + d.exercises, ok: s.ok + d.correct }), { ex: 0, ok: 0 });
  return (
    <div>
      <PageTitle title="Statistiques" subtitle="Ton apprentissage en chiffres sur les 90 derniers jours." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['XP totale', data.totals.xp],
          ['Niveau', data.totals.level.level],
          ['Plus longue série', `${data.totals.longestStreak} j`],
          ['Temps total', formatDuration(data.totals.learningTimeMs)],
        ].map(([l, v]) => (
          <div key={l} className="card !p-4">
            <div className="text-2xl font-black">{v}</div>
            <div className="muted text-xs font-bold">{l}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card lg:col-span-2">
          <h2 className="section-title mb-3">XP par jour</h2>
          <Bars data={days.map((d) => ({ key: d.key, title: d.title, value: d.a?.xp ?? 0 }))} height={140} label={(v) => `${v} XP`} />
        </div>
        <div className="card">
          <h2 className="section-title mb-3">Temps d’apprentissage par jour</h2>
          <Bars data={days.slice(-30).map((d) => ({ key: d.key, title: d.title, value: Math.round((d.a?.timeMs ?? 0) / 60000) }))} color="#22d3ee" label={(v) => `${v} min`} />
        </div>
        <div className="card">
          <h2 className="section-title mb-3">Exercices tentés par jour</h2>
          <Bars data={days.slice(-30).map((d) => ({ key: d.key, title: d.title, value: d.a?.exercises ?? 0 }))} color="#8b5cf6" />
          <div className="muted mt-2 text-sm">{tot.ex} tentatives · {tot.ex ? Math.round((tot.ok / tot.ex) * 100) : 0} % de réussite</div>
        </div>
        <div className="card">
          <h2 className="section-title mb-3">Par langage</h2>
          {data.byLanguage.length === 0 && <p className="muted text-sm">Pas encore de données.</p>}
          {data.byLanguage.map((l) => (
            <div key={l.language} className="mb-3">
              <div className="flex justify-between text-sm font-bold"><span>{langMeta(l.language)?.icon} {langMeta(l.language)?.name}</span><span>{l.solved} réussis · {Math.round(l.successRate * 100)} %</span></div>
              <ProgressBar value={l.successRate} className="mt-1 h-2" />
            </div>
          ))}
        </div>
        <div className="card">
          <h2 className="section-title mb-3">Par type d’exercice</h2>
          {data.byType.map((t) => (
            <div key={t.type} className="mb-3">
              <div className="flex justify-between text-sm font-bold"><span>{TYPE_LABEL[t.type] ?? t.type}</span><span>{t.total} · {Math.round(t.successRate * 100)} %</span></div>
              <ProgressBar value={t.successRate} className="mt-1 h-2" color="bg-violet-500" />
            </div>
          ))}
        </div>
        <div className="card">
          <h2 className="section-title mb-3">Examens</h2>
          {data.exams.length === 0 && <p className="muted text-sm">Aucun examen passé.</p>}
          <ul className="space-y-1">
            {data.exams.map((e) => (
              <li key={e.slug} className="flex items-center gap-2 text-sm">
                <LangBadge lang={e.language} />
                <Link to={`/chapitre/${e.slug}`} className="flex-1 truncate font-bold hover:underline">{e.chapter}</Link>
                <span className={e.passed ? 'font-black text-emerald-500' : 'font-black text-rose-500'}>{e.score} %</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h2 className="section-title mb-3">Points faibles</h2>
          {data.weakPoints.length === 0 && <p className="muted text-sm">Aucun point faible détecté.</p>}
          {data.weakPoints.map((w) => (
            <div key={w.concept + w.language} className="mb-2 flex items-center gap-2 text-sm">
              <LangBadge lang={w.language} /><span className="flex-1 font-bold">{w.concept}</span><span className="text-rose-500">{Math.round(w.successRate * 100)} % ({w.attempts})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
