import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flame, Trophy, Crown, UserPlus, Check, Clock, Pencil, BookOpen, FolderKanban, Dumbbell } from 'lucide-react';
import { api, ApiError, LANG_META, langMeta, LEVEL_NAMES, levelName } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useFeedback } from '../lib/feedback';
import { PremiumBadge } from '../lib/plan';
import { Loading, ErrorBox, ProgressBar } from '../components/ui';
import Avatar, { type AvatarData } from '../components/Avatar';
import Duo from '../components/Duo';
import { t } from '../lib/i18n';

interface Profile {
  id: string; me: boolean; tag: string; displayName: string; bio: string | null; avatar: AvatarData; badge: 'premium' | 'former' | null;
  premiumDays: number; premiumSince: string | null; role: string; xp: number; level: number; levelProgress: number; streak: number; longestStreak: number;
  createdAt: string; online: boolean; chaptersCompleted: number; projectsCompleted: number; exercisesSolved: number; bestCoderWins: string[];
  skills: { language: string; level: number }[]; achievements: { icon: string; title: string; unlockedAt: string }[];
  friendship: { id: string; status: 'PENDING' | 'ACCEPTED'; outgoing: boolean } | null;
}

export default function UserProfile() {
  const { tag = '' } = useParams();
  const { data, error, reload } = useApi<Profile>(`/users/${encodeURIComponent(tag)}`);
  const { toast } = useFeedback();
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  const p = data;

  async function addFriend() {
    try {
      await api('/friends/request', { body: { tag: p.tag } });
      toast(t('Demande envoyée'), 'success');
      reload();
    } catch (e) {
      ((e as ApiError).status !== 402 && toast((e as ApiError).message, 'error'));
    }
  }

  const stats = [
    { icon: Flame, label: 'Série', value: `${p.streak} j`, sub: `record ${p.longestStreak} j`, color: 'text-orange-500' },
    { icon: Dumbbell, label: 'Exercices réussis', value: p.exercisesSolved, color: 'text-emerald-500' },
    { icon: BookOpen, label: 'Chapitres terminés', value: p.chaptersCompleted, color: 'text-brand-500' },
    { icon: FolderKanban, label: 'Projets terminés', value: p.projectsCompleted, color: 'text-violet-500' },
  ];

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative mb-5 overflow-hidden rounded-4xl p-6 shadow-soft sm:p-8 ${p.badge === 'premium' ? 'bg-gradient-to-br from-amber-100 via-rose-50 to-violet-100 dark:from-amber-950/40 dark:via-ink-900 dark:to-violet-950/40' : 'bg-white dark:bg-ink-900'}`}
      >
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <motion.div initial={{ scale: 0.8, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 12 }}>
            <Avatar avatar={p.avatar} size={140} ring={p.badge === 'premium' ? 'premium' : 'none'} />
          </motion.div>
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 className={`text-3xl font-black ${p.badge === 'premium' ? 'premium-text' : 'text-ink-900 dark:text-white'}`}>{p.displayName}</h1>
              <PremiumBadge kind={p.badge} size="md" />
              {p.role === 'ADMIN' && <span className="chip bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300">{t("Admin")}</span>}
            </div>
            <div className="muted font-mono">{p.tag} · {p.online ? <span className="text-emerald-500">{t("en ligne")}</span> : `membre depuis ${new Date(p.createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`}</div>
            {p.bio && <p className="mt-2 font-semibold">« {p.bio} »</p>}
            <div className="mx-auto mt-3 max-w-sm sm:mx-0">
              <div className="mb-1 flex justify-between text-sm font-black"><span>Niveau {p.level}</span><span className="text-amber-500">⭐ {p.xp} XP</span></div>
              <ProgressBar value={p.levelProgress} />
            </div>
            {p.bestCoderWins.length > 0 && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-3 py-1 text-sm font-black text-white shadow">
                <Trophy size={16} /> Meilleur codeur de la semaine ×{p.bestCoderWins.length}
              </div>
            )}
            {p.premiumDays > 0 && (
              <div className="muted mt-2 text-sm font-bold"><Crown size={14} className="inline text-amber-500" /> {p.premiumDays} jour(s) de Premium depuis {new Date(p.premiumSince!).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {p.me ? (
              <Link to="/avatar" className="btn-outline"><Pencil size={16} /> {t("Modifier mon avatar")}</Link>
            ) : p.friendship?.status === 'ACCEPTED' ? (
              <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"><Check size={14} /> {t("Ami")}</span>
            ) : p.friendship ? (
              <span className="chip"><Clock size={14} /> {t("Demande en attente")}</span>
            ) : (
              <button className="btn-primary" onClick={addFriend}><UserPlus size={16} /> {t("Ajouter en ami")}</button>
            )}
          </div>
        </div>
      </motion.div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }} className="card !p-4">
            <s.icon size={20} className={s.color} />
            <div className="mt-1 text-2xl font-black">{s.value}</div>
            <div className="muted text-xs font-bold">{s.label}{s.sub ? ` · ${s.sub}` : ''}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card">
          <h2 className="section-title mb-3">{t("Niveaux")}</h2>
          {(p.skills.length ? p.skills.map((x) => x.language) : ['rust', 'cpp', 'java']).map((l) => {
            const s = p.skills.find((x) => x.language === l);
            return (
              <div key={l} className="mb-3">
                <div className="mb-1 flex justify-between text-sm font-black">
                  <span>{langMeta(l).icon} {langMeta(l).name}</span>
                  <span className="muted">{levelName(s?.level ?? 1)}</span>
                </div>
                <ProgressBar value={(s?.level ?? 1) / 5} />
              </div>
            );
          })}
        </div>
        <div className="card">
          <h2 className="section-title mb-3">{t("Derniers succès")}</h2>
          {p.achievements.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-4 xl:grid-cols-6">
              {p.achievements.map((a, i) => (
                <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.03 }} title={a.title} className="flex aspect-square items-center justify-center rounded-2xl bg-ink-50 text-3xl dark:bg-ink-800/60">
                  {a.icon}
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="muted text-sm">{t("Aucun succès pour l’instant.")}</p>
          )}
        </div>
      </div>

      {p.me && (
        <div className="card mt-5">
          <Duo scene="wave" size={100} />
          <p className="muted text-center text-sm">{t("Voici ton profil tel que les autres le voient.")}</p>
        </div>
      )}
    </div>
  );
}
