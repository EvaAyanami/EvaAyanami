import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, ApiError } from '../lib/api';
import { useAuth, type User } from '../lib/auth';
import Mascot from '../components/Mascot';
import { Logo } from '../components/Layout';

export default function Login({ mode }: { mode: 'login' | 'register' }) {
  const { setUser, registration } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ login: '', email: '', username: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r =
        mode === 'login'
          ? await api<{ user: User }>('/auth/login', { body: { login: form.login, password: form.password } })
          : await api<{ user: User }>('/auth/register', {
              body: { email: form.email, username: form.username, password: form.password, displayName: form.displayName || undefined, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
            });
      setUser(r.user);
      nav(r.user.onboardingDone ? ((loc.state as { from?: string })?.from ?? '/') : '/bienvenue', { replace: true });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-violet-50 p-4 dark:from-ink-950 dark:via-ink-900 dark:to-brand-950">
      <div className="grid w-full max-w-4xl items-center gap-8 md:grid-cols-2">
        <div className="hidden flex-col items-center text-center md:flex">
          <Mascot mood={mode === 'login' ? 'happy' : 'explain'} size={260} />
          <h2 className="mt-4 text-3xl text-ink-900 dark:text-white">Apprends Rust, C++ et Java</h2>
          <p className="muted mt-2 max-w-sm text-lg">De tes tout premiers pas jusqu’à l’expertise, avec Kiri à tes côtés et un vrai compilateur à chaque exercice.</p>
        </div>
        <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit} className="card space-y-4 p-6 sm:p-8">
          <Logo />
          <div className="md:hidden">
            <Mascot mood="happy" size={110} />
          </div>
          <h1 className="text-2xl">{mode === 'login' ? 'Bon retour parmi nous !' : 'Crée ton compte'}</h1>
          {mode === 'login' ? (
            <div>
              <label className="label" htmlFor="login">E-mail ou pseudo</label>
              <input id="login" className="input" value={form.login} onChange={set('login')} autoComplete="username" required />
            </div>
          ) : (
            <>
              <div>
                <label className="label" htmlFor="email">E-mail</label>
                <input id="email" type="email" className="input" value={form.email} onChange={set('email')} autoComplete="email" required />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="username">Pseudo</label>
                  <input id="username" className="input" value={form.username} onChange={set('username')} autoComplete="username" required minLength={3} />
                </div>
                <div>
                  <label className="label" htmlFor="dn">Nom affiché</label>
                  <input id="dn" className="input" value={form.displayName} onChange={set('displayName')} placeholder="facultatif" />
                </div>
              </div>
            </>
          )}
          <div>
            <label className="label" htmlFor="pw">Mot de passe</label>
            <input id="pw" type="password" className="input" value={form.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : 1} />
            {mode === 'register' && <p className="muted mt-1 text-xs">8 caractères minimum.</p>}
          </div>
          {error && <div className="animate-shake rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-600 dark:bg-rose-950/30">{error}</div>}
          <button className="btn-primary w-full py-3 text-lg" disabled={busy}>
            {mode === 'login' ? 'Se connecter' : 'Commencer l’aventure'}
          </button>
          {mode === 'login' ? (
            registration && (
              <p className="text-center text-sm">
                Pas encore de compte ? <Link to="/inscription" className="font-extrabold text-brand-500">Inscris-toi</Link>
              </p>
            )
          ) : (
            <p className="text-center text-sm">
              Déjà inscrit ? <Link to="/connexion" className="font-extrabold text-brand-500">Connecte-toi</Link>
            </p>
          )}
        </motion.form>
      </div>
    </div>
  );
}
