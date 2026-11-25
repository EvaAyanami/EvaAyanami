import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Trophy, Crown, Clock } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { useNow, countdown } from '../lib/plan';
import { PageTitle, Loading, Empty } from '../components/ui';
import Avatar, { type AvatarData } from '../components/Avatar';
import Duo from '../components/Duo';

interface Entry { id: string; tag: string; displayName: string; level: number; avatar: AvatarData; premium: boolean; xp: number; rank?: number; me?: boolean; weekKey?: string }
export interface BestCoderData { week: string; endsAt: string; bonusXp: number; optIn: boolean; leaders: Entry[]; lastWinner: Entry | null; hallOfFame: Entry[] }

export function Podium({ leaders }: { leaders: Entry[] }) {
  const order = [leaders[1], leaders[0], leaders[2]];
  const heights = ['h-20', 'h-28', 'h-14'];
  return (
    <div className="flex items-end justify-center gap-3">
      {order.map((l, i) =>
        l ? (
          <Link key={l.id} to={`/u/${encodeURIComponent(l.tag)}`} className="flex w-28 flex-col items-center">
            <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 + i * 0.15, type: 'spring' }}>
              {i === 1 && <motion.div className="text-center text-2xl" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 1.6 }}>👑</motion.div>}
              <Avatar avatar={l.avatar} size={i === 1 ? 76 : 60} ring={l.premium ? 'premium' : 'none'} />
            </motion.div>
            <div className={clsx('mt-1 w-full truncate text-center text-sm font-black', l.premium && 'premium-text')}>{l.displayName}</div>
            <div className="text-xs font-black text-amber-500">{l.xp} XP</div>
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              className={clsx('mt-1 flex w-full items-start justify-center rounded-t-2xl pt-2 text-2xl font-black text-white', heights[i], ['bg-gradient-to-b from-slate-300 to-slate-400', 'bg-gradient-to-b from-amber-300 to-amber-500', 'bg-gradient-to-b from-orange-300 to-orange-500'][i])}
            >
              {[2, 1, 3][i]}
            </motion.div>
          </Link>
        ) : (
          <div key={i} className="w-28" />
        ),
      )}
    </div>
  );
}

export default function BestCoder() {
  const { data } = useApi<BestCoderData>('/community/best-coder');
  const now = useNow(30_000);
  if (!data) return <Loading />;
  return (
    <div>
      <PageTitle title="Meilleur codeur de la semaine" subtitle={`Celui ou celle qui gagne le plus d’XP du lundi au dimanche remporte le titre et +${data.bonusXp} XP.`}>
        <span className="chip"><Clock size={14} /> Fin dans {countdown(data.endsAt, now)}</span>
      </PageTitle>

      {!data.optIn && (
        <div className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          Tu n’apparais pas dans le classement. Active « Apparaître dans le classement » dans ton <Link to="/profil" className="underline">profil</Link> pour participer.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="card">
          <h2 className="section-title mb-4 flex items-center gap-2"><Trophy size={20} className="text-amber-500" /> Semaine en cours</h2>
          {data.leaders.length ? (
            <>
              <Podium leaders={data.leaders} />
              <div className="mt-5 space-y-1">
                {data.leaders.slice(3).map((l, i) => (
                  <motion.div key={l.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.04 }}>
                    <Link to={`/u/${encodeURIComponent(l.tag)}`} className={clsx('flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-ink-50 dark:hover:bg-ink-800', l.me && 'bg-brand-50 ring-2 ring-brand-200 dark:bg-brand-900/30 dark:ring-brand-800')}>
                      <span className="w-6 text-center font-black">{l.rank}</span>
                      <Avatar avatar={l.avatar} size={36} />
                      <span className={clsx('flex-1 truncate font-bold', l.premium && 'premium-text')}>{l.displayName}</span>
                      <span className="font-black text-amber-500">{l.xp} XP</span>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </>
          ) : (
            <Empty title="La course commence !" text="Personne n’a encore gagné d’XP cette semaine : c’est le moment de prendre la tête." />
          )}
        </div>

        <div className="space-y-5">
          {data.lastWinner && (
            <div className="card premium-shine bg-gradient-to-br from-amber-50 to-white text-center dark:from-amber-950/30 dark:to-ink-900">
              <div className="muted text-xs font-black uppercase tracking-wider">Vainqueur de la semaine dernière</div>
              <Duo scene="trophy" size={90} avatar={data.lastWinner.avatar} />
              <Link to={`/u/${encodeURIComponent(data.lastWinner.tag)}`} className="text-xl font-black">{data.lastWinner.displayName}</Link>
              <div className="font-black text-amber-500">{data.lastWinner.xp} XP</div>
            </div>
          )}
          <div className="card">
            <h2 className="section-title mb-3 flex items-center gap-2"><Crown size={18} className="text-amber-500" /> Temple de la renommée</h2>
            {data.hallOfFame.length ? (
              data.hallOfFame.map((w) => (
                <Link key={w.weekKey} to={`/u/${encodeURIComponent(w.tag)}`} className="flex items-center gap-2 rounded-2xl px-2 py-1.5 hover:bg-ink-50 dark:hover:bg-ink-800">
                  <Avatar avatar={w.avatar} size={30} />
                  <span className="flex-1 truncate text-sm font-bold">{w.displayName}</span>
                  <span className="muted font-mono text-xs">{w.weekKey}</span>
                </Link>
              ))
            ) : (
              <p className="muted text-sm">Le premier titre sera décerné à la fin de la semaine.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
