import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth, type User } from '../lib/auth';
import Mascot from '../components/Mascot';
import { Logo } from '../components/Layout';
import { t } from '../lib/i18n';

export default function Login({ mode }: { mode: 'login' | 'register' }) {
  const { setUser, registration, providers } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ login: '', email: '', username: '', password: '', displayName: '' });
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get('erreur') ?? '');
  const [busy, setBusy] = useState(false);
  const params = new URLSearchParams(loc.search);
  const [ticket, setTicket] = useState<string | null>(params.get('ticket'));
  const [otp, setOtp] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);

  function done(u: User, extra?: { trialDays?: number; needsVerification?: boolean }) {
    setUser(u);
    if (extra?.trialDays) sessionStorage.setItem('cm-trial', String(extra.trialDays));
    if (extra?.needsVerification) return nav('/verifier-email', { replace: true });
    nav(u.onboardingDone ? ((loc.state as { from?: string })?.from ?? '/') : '/bienvenue', { replace: true });
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api<{ user: User; recoveryUsed: boolean; recoveryLeft: number }>('/auth/login/2fa', { body: { ticket, code: otp } });
      if (r.recoveryUsed) alert(`Code de secours utilisé. Il t’en reste ${r.recoveryLeft}. Pense à en régénérer depuis ton profil.`);
      done(r.user);
    } catch (err) {
      setError((err as ApiError).message);
      if ((err as ApiError).message.includes('reconnecte')) {
        setTicket(null);
        setOtp('');
      }
    } finally {
      setBusy(false);
    }
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r =
        mode === 'login'
          ? await api<{ user?: User; twoFactor?: boolean; ticket?: string }>('/auth/login', { body: { login: form.login, password: form.password } })
          : await api<{ user: User; trialDays?: number }>('/auth/register', {
              body: { email: form.email, username: form.username, password: form.password, displayName: form.displayName || undefined, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, locale: localStorage.getItem('cm-locale') ?? navigator.language.slice(0, 2) },
            });
      if ('twoFactor' in r && r.twoFactor && r.ticket) {
        setTicket(r.ticket);
        return;
      }
      done(r.user!, r as { trialDays?: number; needsVerification?: boolean });
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
          <h2 className="mt-4 text-3xl text-ink-900 dark:text-white">{t("Apprends à programmer, de zéro à expert")}</h2>
          <p className="muted mt-2 max-w-sm text-lg">{t("De tes tout premiers pas jusqu’à l’expertise, avec Kiri à tes côtés et un vrai compilateur à chaque exercice.")}</p>
        </div>
        {ticket ? (
          <motion.form key="otp" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} onSubmit={submitOtp} className="card space-y-4 p-6 sm:p-8">
            <Logo />
            <div className="flex items-center gap-3">
              <ShieldCheck size={36} className="text-emerald-500" />
              <div>
                <h1 className="text-2xl">{t("Double authentification")}</h1>
                <p className="muted text-sm">{useRecovery ? 'Saisis un de tes codes de secours (ex. abcd-efgh-ijkl).' : 'Ouvre ton application d’authentification et saisis le code à 6 chiffres.'}</p>
              </div>
            </div>
            <input
              autoFocus
              className="input text-center font-mono text-2xl tracking-[0.4em]"
              inputMode={useRecovery ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              maxLength={useRecovery ? 20 : 7}
              placeholder={useRecovery ? 'xxxx-xxxx-xxxx' : '123456'}
              value={otp}
              onChange={(e) => {
                const v = useRecovery ? e.target.value : e.target.value.replace(/\D/g, '');
                setOtp(v);
              }}
            />
            {error && <div className="animate-shake rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-600 dark:bg-rose-950/30">{error}</div>}
            <button className="btn-primary w-full py-3 text-lg" disabled={busy || otp.length < 6}>{t("Valider")}</button>
            <div className="flex justify-between text-sm">
              <button type="button" className="font-bold text-brand-500" onClick={() => { setUseRecovery(!useRecovery); setOtp(''); }}>
                {useRecovery ? 'Utiliser l’application' : 'Utiliser un code de secours'}
              </button>
              <button type="button" className="muted font-bold" onClick={() => { setTicket(null); setOtp(''); setError(''); }}>{t("Retour")}</button>
            </div>
          </motion.form>
        ) : (
        <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit} className="card space-y-4 p-6 sm:p-8">
          <Logo />
          <div className="md:hidden">
            <Mascot mood="happy" size={110} />
          </div>
          <h1 className="text-2xl">{mode === 'login' ? 'Bon retour parmi nous !' : 'Crée ton compte'}</h1>
          {mode === 'login' ? (
            <div>
              <label className="label" htmlFor="login">{t("E-mail ou pseudo")}</label>
              <input id="login" className="input" value={form.login} onChange={set('login')} autoComplete="username" required />
            </div>
          ) : (
            <>
              <div>
                <label className="label" htmlFor="email">{t("E-mail")}</label>
                <input id="email" type="email" className="input" value={form.email} onChange={set('email')} autoComplete="email" required />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="username">{t("Pseudo")}</label>
                  <input id="username" className="input" value={form.username} onChange={set('username')} autoComplete="username" required minLength={3} />
                </div>
                <div>
                  <label className="label" htmlFor="dn">{t("Nom affiché")}</label>
                  <input id="dn" className="input" value={form.displayName} onChange={set('displayName')} placeholder={t("facultatif")} />
                </div>
              </div>
            </>
          )}
          <div>
            <label className="label" htmlFor="pw">{t("Mot de passe")}</label>
            <input id="pw" type="password" className="input" value={form.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : 1} />
            {mode === 'register' && <p className="muted mt-1 text-xs">{t("8 caractères minimum.")}</p>}
          </div>
          {error && <div className="animate-shake rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-600 dark:bg-rose-950/30">{error}</div>}
          <button className="btn-primary w-full py-3 text-lg" disabled={busy}>
            {mode === 'login' ? 'Se connecter' : 'Commencer l’aventure'}
          </button>
          {(providers.google || providers.facebook) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-ink-400"><span className="h-px flex-1 bg-ink-200 dark:bg-ink-700" /> ou <span className="h-px flex-1 bg-ink-200 dark:bg-ink-700" /></div>
              {providers.google && (
                <a href="/api/auth/oauth/google/start" className="btn-outline w-full">
                  <svg viewBox="0 0 24 24" className="h-5 w-5"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" /></svg>
                  {t("Continuer avec Google")}
                </a>
              )}
              {providers.facebook && (
                <a href="/api/auth/oauth/facebook/start" className="btn w-full bg-[#1877F2] text-white hover:bg-[#166fe0]">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white"><path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z" /></svg>
                  {t("Continuer avec Facebook")}
                </a>
              )}
            </div>
          )}
          {mode === 'login' && (
            <p className="text-center text-sm"><Link to="/mot-de-passe-oublie" className="font-bold text-ink-500 hover:text-brand-500">{t("Mot de passe oublié ?")}</Link></p>
          )}
          {mode === 'login' ? (
            registration && (
              <p className="text-center text-sm">
                {t("Pas encore de compte ?")} <Link to="/inscription" className="font-extrabold text-brand-500">{t("Inscris-toi")}</Link>
              </p>
            )
          ) : (
            <p className="text-center text-sm">
              {t("Déjà inscrit ?")} <Link to="/connexion" className="font-extrabold text-brand-500">{t("Connecte-toi")}</Link>
            </p>
          )}
        </motion.form>
        )}
      </div>
    </div>
  );
}
