import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Save, KeyRound, Trash2, Compass } from 'lucide-react';
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
  if (!user) return <Loading />;

  async function save() {
    try {
      const r = await api<{ user: User }>('/me', { method: 'PATCH', body: form });
      setUser(r.user);
      applyTheme(r.user.theme);
      toast('Profil enregistré', 'success');
    } catch (e) {
      toast((e as ApiError).message, 'error');
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
      toast((err as ApiError).message, 'error');
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
      toast((e as ApiError).message, 'error');
    }
  }

  return (
    <div>
      <PageTitle title="Profil" subtitle={`@${user.username} · ${user.email}`} />
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
          <p className="muted mb-3 text-sm">Ton niveau est distinct pour chaque langage. Le modifier débloque les chapitres correspondants (les catégories inférieures sont marquées « passées »).</p>
          {skills.data?.map((s) => (
            <div key={s.language} className="mb-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-black">{LANG_META[s.language].icon} {LANG_META[s.language].name}</span>
                <span className="muted text-xs font-bold">{s.source === 'placement' ? `évalué (${s.details?.score ?? '?'} %)` : s.source === 'manual' ? 'réglé manuellement' : 'par défaut'}</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map((l) => (
                  <button key={l} onClick={() => l !== s.level && setLevel(s.language, l)} title={LEVEL_NAMES[l]} className={clsx('rounded-xl py-2 text-xs font-black', l === s.level ? 'bg-brand-500 text-white' : l < s.level ? 'bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300' : 'bg-ink-100 dark:bg-ink-800')}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-xs font-bold text-brand-500">{s.levelName}</div>
            </div>
          ))}
          <Link to="/bienvenue" className="btn-outline w-full"><Compass size={16} /> Refaire l’évaluation</Link>
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

        <div className="card">
          <h2 className="section-title text-rose-500">Zone sensible</h2>
          <p className="muted my-2 text-sm">La suppression du compte efface définitivement ta progression.</p>
          <button className="btn-danger" onClick={deleteAccount}><Trash2 size={16} /> Supprimer mon compte</button>
        </div>
      </div>
    </div>
  );
}
