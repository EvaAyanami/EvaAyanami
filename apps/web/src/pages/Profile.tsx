import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Save, KeyRound, Trash2, Compass, Crown, Pencil, Eye, Copy, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import Avatar from '../components/Avatar';
import TwoFactorCard from '../components/TwoFactorCard';
import { PremiumBadge, remaining, usePlan } from '../lib/plan';
import { api, ApiError, LANG_META, LEVEL_NAMES } from '../lib/api';
import { useAuth, type User } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { useFeedback } from '../lib/feedback';
import { applyTheme } from '../lib/theme';
import { PageTitle, Loading } from '../components/ui';
import Mascot, { type Mood } from '../components/Mascot';

const MOODS: [Mood, string][] = [
  ['neutral', 'Neutre'],
  ['happy', 'Heureuse'],
  ['thinking', 'Réfléchit'],
  ['coding', 'Code'],
  ['sad', 'Déçue mais encourageante'],
  ['celebrate', 'Célèbre'],
  ['explain', 'Explique'],
  ['sleep', 'Endormie'],
];

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const { toast } = useFeedback();
  const nav = useNavigate();
  const skills = useApi<{ language: string; level: number; levelName: string; source: string; details: { score?: number } | null }[]>('/me/skills');
  const [form, setForm] = useState(() => ({
    displayName: user!.displayName,
    theme: user!.theme,
    timezone: user!.timezone,
    dailyGoalXp: user!.dailyGoalXp,
    leaderboardOptIn: user!.leaderboardOptIn,
  }));
  const [pw, setPw] = useState({ current: '', next: '' });
  const { plan } = usePlan();
  if (!user) return <Loading />;

  async function save() {
    try {
      const r = await api<{ user: User }>('/me', { method: 'PATCH', body: form });
      setUser(r.user);
      applyTheme(r.user.theme);
      toast('Profil enregistré', 'success');
    } catch (e) {
      ((e as ApiError).status !== 402 && toast((e as ApiError).message, 'error'));
    }
  }

  async function setLevel(lang: string, level: number) {
    await api(`/me/skills/${lang}`, { method: 'PUT', body: { level } });
    toast(`Niveau ${LANG_META[lang].name} : ${LEVEL_NAMES[level]}`, 'success');
    skills.reload();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/auth/password', { body: pw });
      setPw({ current: '', next: '' });
      toast('Mot de passe modifié', 'success');
    } catch (err) {
      ((err as ApiError).status !== 402 && toast((err as ApiError).message, 'error'));
    }
  }

  async function deleteAccount() {
    const password = prompt('Cette action est définitive. Saisis ton mot de passe pour confirmer la suppression du compte :');
    if (!password) return;
    try {
      await api('/me/delete', { body: { password } });
      await logout().catch(() => {});
      nav('/connexion');
    } catch (e) {
      ((e as ApiError).status !== 402 && toast((e as ApiError).message, 'error'));
    }
  }

  return (
    <div>
      <PageTitle title="Profil" subtitle={`${user.tag} · ${user.email}`} />
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={clsx('mb-4 flex flex-col items-center gap-4 rounded-4xl p-5 shadow-soft sm:flex-row', user.premium ? 'bg-gradient-to-br from-amber-100 via-rose-50 to-violet-100 dark:from-amber-950/40 dark:via-ink-900 dark:to-violet-950/40' : 'bg-white dark:bg-ink-900')}
      >
        <Link to="/avatar" className="group relative">
          <Avatar avatar={user.avatar} size={110} ring={user.premium ? 'premium' : 'none'} />
          <span className="absolute bottom-1 right-1 rounded-full bg-brand-500 p-2 text-white shadow transition group-hover:scale-110"><Pencil size={14} /></span>
        </Link>
        <div className="flex-1 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span className={clsx('text-2xl font-black', user.premium && 'premium-text')}>{user.displayName}</span>
            <PremiumBadge kind={user.premium ? 'premium' : user.formerPremium ? 'former' : null} size="md" />
          </div>
          <button className="muted font-mono text-sm" onClick={() => navigator.clipboard?.writeText(user.tag).then(() => toast('Identifiant copié', 'success'))}>
            {user.tag} <Copy size={12} className="inline" />
          </button>
          {user.premium ? (
            <p className="mt-1 text-sm font-bold">
              <Crown size={14} className="inline text-amber-500" /> Premium{plan?.trial ? ' (essai)' : ''} : encore <b>{remaining(user.premiumUntil)}</b>
            </p>
          ) : (
            <p className="muted mt-1 text-sm font-bold">{user.formerPremium ? 'Ton Premium est terminé.' : 'Compte gratuit.'} <Link to="/premium" className="text-brand-500">Voir Premium</Link></p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Link to="/avatar" className="btn-outline btn-sm"><Pencil size={14} /> Mon avatar</Link>
          <Link to={`/u/${encodeURIComponent(user.tag)}`} className="btn-ghost btn-sm"><Eye size={14} /> Profil public</Link>
          <Link to="/premium" className="btn-ghost btn-sm"><Crown size={14} /> Premium et clés</Link>
        </div>
      </motion.div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="section-title">Préférences</h2>
          <div>
            <label className="label">Nom affiché</label>
            <input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </div>
          <div>
            <label className="label">Thème</label>
            <div className="grid grid-cols-3 gap-2">
              {(['light', 'dark', 'system'] as const).map((t) => (
                <button key={t} onClick={() => { setForm({ ...form, theme: t }); applyTheme(t); }} className={clsx('rounded-2xl border-2 py-2 font-bold', form.theme === t ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/30' : 'border-ink-200 dark:border-ink-700')}>
                  {{ light: '☀️ Clair', dark: '🌙 Sombre', system: '🖥️ Système' }[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Objectif quotidien : {form.dailyGoalXp} XP</label>
            <input type="range" min={10} max={300} step={10} value={form.dailyGoalXp} onChange={(e) => setForm({ ...form, dailyGoalXp: Number(e.target.value) })} className="w-full accent-brand-500" />
            <div className="muted flex justify-between text-xs font-bold"><span>Détente</span><span>Régulier</span><span>Intensif</span></div>
          </div>
          <div>
            <label className="label">Fuseau horaire</label>
            <input className="input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 font-bold">
            <input type="checkbox" checked={form.leaderboardOptIn} onChange={(e) => setForm({ ...form, leaderboardOptIn: e.target.checked })} className="h-5 w-5 accent-brand-500" />
            Apparaître dans le classement (facultatif)
          </label>
          <button className="btn-primary" onClick={save}><Save size={16} /> Enregistrer</button>
        </div>

        <div className="card">
          <h2 className="section-title">Niveau par langage</h2>
          <p className="muted mb-3 text-sm">
            <Lock size={12} className="inline" /> Ton niveau est distinct pour chaque langage. Il évolue avec l’évaluation de départ et les examens des chapitres{user.role === 'ADMIN' ? ' (en tant qu’administrateur, tu peux le régler ici).' : ' : il ne peut pas être modifié à la main.'}
          </p>
          {skills.data?.map((s) => (
            <div key={s.language} className="mb-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-black">{LANG_META[s.language].icon} {LANG_META[s.language].name}</span>
                <span className="muted text-xs font-bold">{s.source === 'placement' ? `évalué (${s.details?.score ?? '?'} %)` : s.source === 'manual' ? 'réglé manuellement' : 'par défaut'}</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map((l) => (
                  <button key={l} disabled={user.role !== 'ADMIN'} onClick={() => l !== s.level && setLevel(s.language, l)} title={LEVEL_NAMES[l]} className={clsx('rounded-xl py-2 text-xs font-black disabled:cursor-default', l === s.level ? 'bg-brand-500 text-white' : l < s.level ? 'bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300' : 'bg-ink-100 dark:bg-ink-800')}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-xs font-bold text-brand-500">{s.levelName}</div>
            </div>
          ))}
          <Link to="/bienvenue" className="btn-outline w-full"><Compass size={16} /> Refaire l’évaluation (1 fois par semaine)</Link>
        </div>

        <div className="card lg:col-span-2">
          <h2 className="section-title mb-1">Kiri, ta mascotte</h2>
          <p className="muted mb-3 text-sm">Kiri t’accompagne partout : elle félicite, encourage, explique… et s’endort si tu t’absentes trop longtemps !</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {MOODS.map(([m, label]) => (
              <div key={m} className="flex flex-col items-center rounded-2xl bg-ink-50 p-2 dark:bg-ink-800/60">
                <Mascot mood={m} size={90} />
                <span className="text-center text-xs font-bold">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <form className="card space-y-3" onSubmit={changePassword}>
          <h2 className="section-title">Mot de passe</h2>
          <input className="input" type="password" placeholder="Mot de passe actuel" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
          <input className="input" type="password" placeholder="Nouveau mot de passe (8 caractères min.)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" minLength={8} />
          <button className="btn-outline" disabled={!pw.current || pw.next.length < 8}><KeyRound size={16} /> Modifier</button>
        </form>

        <TwoFactorCard />

        <div className="card">
          <h2 className="section-title text-rose-500">Zone sensible</h2>
          <p className="muted my-2 text-sm">La suppression du compte efface définitivement ta progression.</p>
          <button className="btn-danger" onClick={deleteAccount}><Trash2 size={16} /> Supprimer mon compte</button>
        </div>
      </div>
    </div>
  );
}
