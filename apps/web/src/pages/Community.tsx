import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Swords, User as UserIcon, Users, Trophy, Medal, MessageSquareHeart, HelpCircle, Play } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useFeedback } from '../lib/feedback';
import { useI18n } from '../lib/i18n';
import { PageTitle, Modal } from '../components/ui';
import Avatar, { type AvatarData } from '../components/Avatar';
import { THEME_LABEL } from './QuizPlay';
import { FlameBadge } from './Friends';

interface DuelRow {
  id: string; theme: string; status: string; solo: boolean; createdAt: string; me: string;
  opponent: { id: string; displayName: string; tag: string; avatar: AvatarData } | null;
  myTurn: boolean; myScore: number | null; theirScore: number | 'hidden' | null; result: 'win' | 'lose' | 'draw' | null;
}
interface Info { perDuel: number; secondsPerQuestion: number; themes: { id: string; count: number }[]; xp: { win: number; draw: number; lose: number }; maxRewardedPerDay: number }

export default function Community() {
  const { t } = useI18n();
  const { toast } = useFeedback();
  const nav = useNavigate();
  const info = useApi<Info>('/quiz/info');
  const duels = useApi<DuelRow[]>('/quiz/duels');
  const friends = useApi<{ friends: { id: string; displayName: string; tag: string; avatar: AvatarData; online: boolean; flame?: any }[] }>('/friends');
  const [theme, setTheme] = useState('mix');
  const [pickFriend, setPickFriend] = useState(false);

  async function start(opponentId: string | null) {
    try {
      const r = await api<{ id: string }>('/quiz/duels', { body: { theme, opponentId } });
      nav(`/blind-test/${r.id}`);
    } catch (e) {
      toast((e as ApiError).message, 'error');
    }
  }

  const toPlay = duels.data?.filter((d) => d.myTurn) ?? [];
  const history = duels.data?.filter((d) => !d.myTurn) ?? [];

  return (
    <div>
      <PageTitle title={t('Communauté')} subtitle={t('Joue avec tes amis, garde vos flammes allumées et grimpe au classement.')} />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { to: '/amis', icon: Users, label: 'Amis', color: 'from-sky-400 to-brand-500' },
          { to: '/meilleur-codeur', icon: Medal, label: 'Meilleur codeur', color: 'from-amber-400 to-orange-500' },
          { to: '/avis', icon: MessageSquareHeart, label: 'Avis et idées', color: 'from-violet-400 to-fuchsia-500' },
          { to: '/faq', icon: HelpCircle, label: 'FAQ', color: 'from-emerald-400 to-teal-500' },
        ].map((c, i) => (
          <motion.div key={c.to} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -4 }}>
            <Link to={c.to} className={`flex items-center gap-3 rounded-3xl bg-gradient-to-br ${c.color} p-4 font-black text-white shadow-lg`}>
              <c.icon size={22} /> {t(c.label)}
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* Blind test */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-fuchsia-600 via-violet-600 to-brand-600 p-6 text-white shadow-xl">
            <motion.div className="pointer-events-none absolute -right-6 -top-6 text-8xl opacity-20" animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 6, repeat: Infinity }}>🎧</motion.div>
            <h2 className="text-2xl font-black">{t('Blind test')}</h2>
            <p className="mt-1 max-w-lg text-sm opacity-90">
              {t('{n} questions de culture code et hardware, {s} secondes chacune. Défie un ami : le plus rapide et le plus juste l’emporte !', { n: info.data?.perDuel ?? 10, s: info.data?.secondsPerQuestion ?? 15 })}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(info.data?.themes ?? []).map((th) => (
                <button key={th.id} onClick={() => setTheme(th.id)} className={clsx('rounded-2xl px-3 py-2 text-sm font-black transition', theme === th.id ? 'bg-white text-violet-700 shadow' : 'bg-white/15 hover:bg-white/25')}>
                  {THEME_LABEL[th.id]?.icon} {t(THEME_LABEL[th.id]?.label ?? th.id)} <span className="opacity-70">· {th.count}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="btn bg-white text-violet-700 shadow-[0_4px_0_0_rgba(0,0,0,0.2)]" onClick={() => setPickFriend(true)}>
                <Swords size={18} /> {t('Défier un ami')}
              </motion.button>
              <button className="btn bg-white/15 text-white hover:bg-white/25" onClick={() => start(null)}>
                <UserIcon size={18} /> {t('Entraînement solo')}
              </button>
            </div>
            {info.data && (
              <p className="mt-3 text-xs opacity-80">
                {t('Victoire +{w} XP · égalité +{d} XP · défaite +{l} XP ({m} duels récompensés par jour).', { w: info.data.xp.win, d: info.data.xp.draw, l: info.data.xp.lose, m: info.data.maxRewardedPerDay })}
              </p>
            )}
          </motion.div>

          {toPlay.length > 0 && (
            <div className="card">
              <h2 className="section-title mb-3">{t('À toi de jouer')} <span className="chip bg-rose-500 text-white">{toPlay.length}</span></h2>
              <div className="space-y-2">
                {toPlay.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 rounded-2xl bg-ink-50 p-3 dark:bg-ink-800/60">
                    {d.opponent ? <Avatar avatar={d.opponent.avatar} size={40} /> : <span className="text-2xl">🎯</span>}
                    <div className="flex-1">
                      <div className="font-black">{d.opponent ? t('{nom} te défie !', { nom: d.opponent.displayName }) : t('Entraînement solo')}</div>
                      <div className="muted text-xs">{THEME_LABEL[d.theme]?.icon} {t(THEME_LABEL[d.theme]?.label ?? d.theme)}{d.theirScore === 'hidden' ? ` · ${t('score adverse caché jusqu’à ta partie')}` : ''}</div>
                    </div>
                    {d.opponent && d.me === 'opponent' && (
                      <button className="btn-ghost btn-sm" onClick={async () => { await api(`/quiz/duels/${d.id}/decline`, { body: {} }); duels.reload(); }}>{t('Refuser')}</button>
                    )}
                    <Link to={`/blind-test/${d.id}`} className="btn-primary btn-sm"><Play size={14} /> {t('Jouer')}</Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="section-title mb-3 flex items-center gap-2"><Trophy size={18} className="text-amber-500" /> {t('Mes parties')}</h2>
            {!history.length && <p className="muted text-sm">{t('Aucune partie pour l’instant. Lance ton premier blind test !')}</p>}
            <div className="space-y-1">
              {history.map((d) => (
                <Link key={d.id} to={`/blind-test/${d.id}`} className="flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-ink-50 dark:hover:bg-ink-800">
                  <span className="text-xl">{d.result === 'win' ? '🏆' : d.result === 'lose' ? '😤' : d.result === 'draw' ? '🤝' : d.solo ? '🎯' : '⏳'}</span>
                  <div className="flex-1 truncate text-sm font-bold">
                    {d.opponent ? `${t('contre')} ${d.opponent.displayName}` : t('Entraînement solo')} · {t(THEME_LABEL[d.theme]?.label ?? d.theme)}
                  </div>
                  <span className="font-mono text-sm font-black">
                    {d.myScore ?? '–'}
                    {!d.solo && ` - ${typeof d.theirScore === 'number' ? d.theirScore : '?'}`}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="card self-start">
          <h2 className="section-title mb-3">🔥 {t('Vos flammes')}</h2>
          {!friends.data?.friends.length && (
            <p className="muted text-sm">
              {t('Ajoute des amis pour allumer des flammes à deux.')} <Link to="/amis" className="font-bold text-brand-500">{t('Ajouter')}</Link>
            </p>
          )}
          <div className="space-y-2">
            {friends.data?.friends.map((f) => (
              <div key={f.id} className="flex items-center gap-2">
                <Link to={`/u/${encodeURIComponent(f.tag)}`}><Avatar avatar={f.avatar} size={36} /></Link>
                <span className="flex-1 truncate text-sm font-bold">{f.displayName}</span>
                {f.flame && <FlameBadge flame={f.flame} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal open={pickFriend} onClose={() => setPickFriend(false)} title={t('Qui veux-tu défier ?')}>
        {!friends.data?.friends.length ? (
          <p className="muted text-sm">{t('Tu n’as pas encore d’amis. Ajoute-les avec leur identifiant pseudo#1234 dans l’onglet Amis.')}</p>
        ) : (
          <div className="space-y-2">
            {friends.data.friends.map((f) => (
              <button key={f.id} onClick={() => { setPickFriend(false); start(f.id); }} className="flex w-full items-center gap-3 rounded-2xl border-2 border-ink-100 p-2 text-left hover:border-brand-300 dark:border-ink-800">
                <Avatar avatar={f.avatar} size={40} />
                <span className="flex-1 font-black">{f.displayName}</span>
                <span className={clsx('h-2.5 w-2.5 rounded-full', f.online ? 'bg-emerald-400' : 'bg-ink-300')} />
                <Swords size={16} className="text-rose-500" />
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
