import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { UserPlus, Check, X, Copy, Flame, Trophy, Users } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useFeedback } from '../lib/feedback';
import { PremiumBadge } from '../lib/plan';
import { PageTitle, Loading, Empty } from '../components/ui';
import Avatar, { type AvatarData } from '../components/Avatar';
import { t } from '../lib/i18n';

interface Card {
  id: string; friendshipId: string; tag: string; displayName: string; xp: number; level: number; streak: number; online: boolean;
  lastActiveAt: string; badge: 'premium' | 'former' | null; avatar: AvatarData; weeklyXp?: number;
  flame?: { flame: number; best: number; status: 'lit' | 'waiting_me' | 'waiting_friend' | 'waiting_both' | 'out'; atRisk: boolean; next: { days: number; title: string; xp: number } | null };
}

const FLAME_TEXT: Record<string, string> = {
  lit: 'Allumée aujourd’hui ✔',
  waiting_me: 'Ton ami a appris : à toi de jouer !',
  waiting_friend: 'Tu as appris : en attente de ton ami',
  waiting_both: 'Apprenez tous les deux aujourd’hui pour la garder',
  out: 'Éteinte — apprenez le même jour pour la rallumer',
};

/** Flamme d'amitié : grandit chaque jour où les deux amis apprennent. */
export function FlameBadge({ flame }: { flame: NonNullable<Card['flame']> }) {
  const lit = flame.status === 'lit';
  const out = flame.status === 'out';
  const size = Math.min(1.5, 1 + flame.flame / 60);
  return (
    <div className="flex flex-col items-center" title={t(FLAME_TEXT[flame.status])}>
      <motion.div
        animate={out ? { opacity: 0.35, scale: 0.9 } : lit ? { scale: [size, size * 1.12, size], rotate: [0, -4, 4, 0] } : { scale: [size * 0.95, size, size * 0.95] }}
        transition={{ duration: lit ? 1.4 : 2.2, repeat: out ? 0 : Infinity }}
        className={clsx('relative text-2xl', out && 'grayscale')}
      >
        🔥
        {flame.atRisk && !out && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-ping rounded-full bg-amber-400" />}
      </motion.div>
      <span className={clsx('text-xs font-black', lit ? 'text-orange-500' : out ? 'text-ink-400' : 'text-amber-500')}>{flame.flame} j</span>
    </div>
  );
}
interface FriendsData {
  me: { tag: string };
  friends: Card[];
  incoming: Card[];
  outgoing: Card[];
  ranking: { id: string; tag: string; displayName: string; weeklyXp: number; me: boolean; badge: 'premium' | 'former' | null }[];
  milestones?: { days: number; xp: number; title: string }[];
}

function ago(d: string) {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

export function UserLine({ u, children }: { u: Card; children?: React.ReactNode }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} className="flex items-center gap-3 rounded-3xl bg-ink-50 p-3 transition hover:bg-ink-100 dark:bg-ink-800/60 dark:hover:bg-ink-800">
      <Link to={`/u/${encodeURIComponent(u.tag)}`} className="relative">
        <Avatar avatar={u.avatar} size={52} ring={u.badge === 'premium' ? 'premium' : 'none'} />
        <span className={clsx('absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-ink-900', u.online ? 'bg-emerald-400' : 'bg-ink-300')} />
      </Link>
      <Link to={`/u/${encodeURIComponent(u.tag)}`} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={clsx('truncate font-black', u.badge === 'premium' && 'premium-text')}>{u.displayName}</span>
          <PremiumBadge kind={u.badge} />
        </div>
        <div className="muted truncate font-mono text-xs">{u.tag}</div>
        <div className="muted mt-0.5 flex flex-wrap gap-3 text-xs font-bold">
          <span>Niv. {u.level}</span>
          <span className="text-orange-500"><Flame size={12} className="inline" /> {u.streak}</span>
          {u.weeklyXp !== undefined && <span className="text-amber-500">⭐ {u.weeklyXp} cette semaine</span>}
          <span>{u.online ? 'en ligne' : ago(u.lastActiveAt)}</span>
        </div>
      </Link>
      {children}
    </motion.div>
  );
}

export default function Friends() {
  const { data, reload } = useApi<FriendsData>('/friends');
  const { toast } = useFeedback();
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ accepted: boolean }>('/friends/request', { body: { tag } });
      toast(r.accepted ? 'Vous êtes maintenant amis ! 🎉' : 'Demande envoyée', 'success');
      setTag('');
      reload();
    } catch (err) {
      ((err as ApiError).status !== 402 && toast((err as ApiError).message, 'error'));
    } finally {
      setBusy(false);
    }
  }
  const act = async (path: string, method: string, msg: string) => {
    try {
      await api(path, { method, body: method === 'POST' ? {} : undefined });
      toast(msg, 'success');
      reload();
    } catch (err) {
      ((err as ApiError).status !== 402 && toast((err as ApiError).message, 'error'));
    }
  };

  if (!data) return <Loading />;
  return (
    <div>
      <PageTitle title={t("Amis")} subtitle="Apprenez ensemble, comparez vos séries et motivez-vous chaque semaine." />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <form onSubmit={add} className="card">
            <h2 className="section-title mb-1 flex items-center gap-2"><UserPlus size={20} /> {t("Ajouter un ami")}</h2>
            <p className="muted mb-3 text-sm">
              Ton identifiant :{' '}
              <button type="button" className="font-mono font-black text-brand-500" onClick={() => navigator.clipboard?.writeText(data.me.tag).then(() => toast(t('Identifiant copié'), 'success'))}>
                {data.me.tag} <Copy size={12} className="inline" />
              </button>
            </p>
            <div className="flex gap-2">
              <input className="input font-mono" placeholder={t("pseudo#1234")} value={tag} onChange={(e) => setTag(e.target.value)} />
              <button className="btn-primary shrink-0" disabled={busy || !/#\d{4}$/.test(tag.trim())}>{t("Envoyer")}</button>
            </div>
          </form>

          {data.incoming.length > 0 && (
            <div className="card">
              <h2 className="section-title mb-3">{t("Demandes reçues")} <span className="chip bg-rose-500 text-white">{data.incoming.length}</span></h2>
              <div className="space-y-2">
                <AnimatePresence>
                  {data.incoming.map((u) => (
                    <UserLine key={u.friendshipId} u={u}>
                      <button className="btn-success btn-sm" onClick={() => act(`/friends/${u.friendshipId}/accept`, 'POST', 'Ami ajouté 🎉')}><Check size={16} /></button>
                      <button className="btn-ghost btn-sm" onClick={() => act(`/friends/${u.friendshipId}`, 'DELETE', 'Demande refusée')}><X size={16} /></button>
                    </UserLine>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="section-title mb-3 flex items-center gap-2"><Users size={20} /> Mes amis ({data.friends.length})</h2>
            {!data.friends.length ? (
              <Empty title={t("Pas encore d’amis")} text="Partage ton identifiant pseudo#1234 pour que tes amis t’ajoutent." />
            ) : (
              <div className="space-y-2">
                <AnimatePresence>
                  {data.friends.map((u) => (
                    <UserLine key={u.friendshipId} u={u}>
                      {u.flame && (
                        <div className="hidden text-right text-[11px] font-bold leading-tight text-ink-500 md:block md:w-40">
                          {t(FLAME_TEXT[u.flame.status])}
                          {u.flame.next && <div className="text-ink-400">prochain palier : {u.flame.next.days} j « {u.flame.next.title} »</div>}
                        </div>
                      )}
                      {u.flame && <FlameBadge flame={u.flame} />}
                      <button className="btn-ghost btn-sm" title={t("Retirer")} onClick={() => confirm(`Retirer ${u.displayName} de tes amis ?`) && act(`/friends/${u.friendshipId}`, 'DELETE', 'Ami retiré')}>
                        <X size={16} />
                      </button>
                    </UserLine>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {data.outgoing.length > 0 && (
            <div className="card">
              <h2 className="section-title mb-3">{t("Demandes envoyées")}</h2>
              <div className="space-y-2">
                {data.outgoing.map((u) => (
                  <UserLine key={u.friendshipId} u={u}>
                    <button className="btn-ghost btn-sm" onClick={() => act(`/friends/${u.friendshipId}`, 'DELETE', 'Demande annulée')}>{t("Annuler")}</button>
                  </UserLine>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-5 self-start">
        <div className="card">
          <h2 className="section-title mb-1">{t("🔥 Flammes d’amitié")}</h2>
          <p className="muted mb-2 text-sm">{t("Chaque jour où ton ami et toi réussissez au moins un exercice, votre flamme grandit. Des paliers vous rapportent de l’XP à tous les deux.")}</p>
          <div className="grid grid-cols-4 gap-1 text-center text-[11px] font-bold">
            {(data.milestones ?? []).map((m) => (
              <div key={m.days} className="rounded-xl bg-orange-50 p-1.5 dark:bg-orange-950/20">
                <div className="text-sm font-black text-orange-500">{m.days} j</div>
                <div className="truncate">{m.title}</div>
                <div className="text-amber-500">+{m.xp} XP</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2 className="section-title mb-3 flex items-center gap-2"><Trophy size={20} className="text-amber-500" /> {t("Entre amis, cette semaine")}</h2>
          <div className="space-y-1">
            {data.ranking.map((r, i) => (
              <motion.div key={r.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className={clsx('flex items-center gap-2 rounded-2xl px-3 py-2', r.me && 'bg-brand-50 ring-2 ring-brand-200 dark:bg-brand-900/30 dark:ring-brand-800')}>
                <span className="w-6 text-center font-black">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
                <span className={clsx('flex-1 truncate font-bold', r.badge === 'premium' && 'premium-text')}>{r.displayName}</span>
                <span className="font-black text-amber-500">{r.weeklyXp} XP</span>
              </motion.div>
            ))}
          </div>
          <Link to="/meilleur-codeur" className="btn-outline btn-sm mt-3 w-full">{t("Classement général de la semaine")}</Link>
        </div>
        </div>
      </div>
    </div>
  );
}
