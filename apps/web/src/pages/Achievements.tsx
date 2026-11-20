import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useApi } from '../lib/hooks';
import { PageTitle, Loading, ErrorBox, ProgressBar } from '../components/ui';

interface A {
  id: string;
  title: string;
  description: string;
  icon: string;
  xp: number;
  unlockedAt: string | null;
  progress: number;
  threshold: number;
}

export default function Achievements() {
  const { data, error, loading, reload } = useApi<A[]>('/achievements');
  const lb = useApi<{ enabled: boolean; optIn: boolean; weekly: { id: string; displayName: string; xp: number; me: boolean }[]; allTime: { id: string; displayName: string; xp: number; level: number; me: boolean }[] }>('/leaderboard');
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Erreur'} onRetry={reload} />;
  const unlocked = data.filter((a) => a.unlockedAt).length;
  return (
    <div>
      <PageTitle title="Succès" subtitle={`${unlocked}/${data.length} succès débloqués`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((a, i) => (
          <motion.div key={a.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.02 }} className={clsx('card flex items-center gap-3', !a.unlockedAt && 'opacity-70')}>
            <div className={clsx('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl', a.unlockedAt ? 'bg-gradient-to-br from-amber-200 to-orange-300 shadow-pop' : 'bg-ink-100 grayscale dark:bg-ink-800')}>{a.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="font-black">{a.title}</div>
              <div className="muted text-sm">{a.description}</div>
              {a.unlockedAt ? (
                <div className="mt-1 text-xs font-bold text-emerald-500">✔ Débloqué le {new Date(a.unlockedAt).toLocaleDateString('fr-FR')} · +{a.xp} XP</div>
              ) : (
                <>
                  <ProgressBar value={a.progress / a.threshold} className="mt-2 h-2" color="bg-amber-400" />
                  <div className="muted mt-0.5 text-xs font-bold">{a.progress}/{a.threshold}</div>
                </>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <h2 className="section-title mb-3 mt-10">Classement</h2>
      {lb.data && !lb.data.enabled && <p className="muted">Le classement est désactivé sur ce serveur.</p>}
      {lb.data?.enabled && !lb.data.optIn && <div className="card text-sm">Le classement est facultatif : active-le dans ton <a href="/profil" className="font-bold text-brand-500">profil</a> pour y apparaître.</div>}
      {lb.data?.enabled && (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {[{ title: 'Cette semaine', rows: lb.data.weekly.map((w) => ({ ...w, sub: '' })) }, { title: 'Depuis toujours', rows: lb.data.allTime.map((a) => ({ ...a, sub: `niv. ${a.level}` })) }].map((b) => (
            <div key={b.title} className="card">
              <h3 className="mb-2 font-black">{b.title}</h3>
              {b.rows.length === 0 && <p className="muted text-sm">Personne pour l’instant.</p>}
              <ol className="space-y-1">
                {b.rows.slice(0, 15).map((r, i) => (
                  <li key={r.id} className={clsx('flex items-center gap-3 rounded-xl px-2 py-1.5', r.me && 'bg-brand-50 dark:bg-brand-900/30')}>
                    <span className="w-6 text-center font-black">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
                    <span className="flex-1 font-bold">{r.displayName}</span>
                    <span className="muted text-xs">{r.sub}</span>
                    <span className="font-black text-amber-500">{r.xp} XP</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
