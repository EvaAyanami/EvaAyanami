/** Pages de compte hors connexion : vérification d'e-mail, mot de passe oublié, nouveau mot de passe. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MailCheck, Send, KeyRound, LogOut } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth, type User } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import Mascot, { type Mood } from '../components/Mascot';
import { Logo } from '../components/Layout';

function Shell({ mood, children }: { mood: Mood; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-violet-50 p-4 dark:from-ink-950 dark:via-ink-900 dark:to-brand-950">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card w-full max-w-md space-y-4 p-6 text-center sm:p-8">
        <div className="flex justify-center"><Logo /></div>
        <div className="flex justify-center"><Mascot mood={mood} size={120} /></div>
        {children}
      </motion.div>
    </div>
  );
}

const Err = ({ msg }: { msg: string }) => (msg ? <div className="animate-shake rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-600 dark:bg-rose-950/30">{msg}</div> : null);

/** /verifier-email : avec ?token= on valide ; sinon on invite à consulter sa boîte mail. */
export function VerifyEmail() {
  const { t } = useI18n();
  const { user, setUser, logout, refresh } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<'idle' | 'checking' | 'ok' | 'error'>(token ? 'checking' : 'idle');
  const [msg, setMsg] = useState('');
  const [sent, setSent] = useState(false);
  const [change, setChange] = useState({ open: false, email: '', password: '' });
  const once = useRef(false);

  useEffect(() => {
    if (!token || once.current) return;
    once.current = true;
    api<{ user: User | null }>('/auth/verify-email', { body: { token } })
      .then(async (r) => {
        setState('ok');
        if (r.user) setUser(r.user);
        else await refresh();
        setTimeout(() => nav(r.user && !r.user.onboardingDone ? '/bienvenue' : '/', { replace: true }), 1800);
      })
      .catch((e) => {
        setState('error');
        setMsg((e as ApiError).message);
      });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'checking') return <Shell mood="thinking"><p className="font-bold">{t('Vérification en cours…')}</p></Shell>;
  if (state === 'ok')
    return (
      <Shell mood="celebrate">
        <h1 className="text-2xl font-black">{t('Adresse confirmée !')}</h1>
        <p className="muted">{t('Bienvenue dans Codemori. C’est parti !')}</p>
      </Shell>
    );

  return (
    <Shell mood={state === 'error' ? 'sad' : 'explain'}>
      <MailCheck size={36} className="mx-auto text-brand-500" />
      <h1 className="text-2xl font-black">{t('Vérifie ta boîte mail')}</h1>
      <Err msg={msg} />
      {user ? (
        <>
          <p className="muted">{t('Nous avons envoyé un lien de confirmation à {email}. Clique dessus pour activer ton compte (pense aux courriers indésirables).', { email: user.email })}</p>
          <button
            className="btn-primary w-full"
            disabled={sent}
            onClick={async () => {
              try {
                await api('/auth/verify-email/resend', { body: {} });
                setSent(true);
              } catch (e) {
                setMsg((e as ApiError).message);
              }
            }}
          >
            <Send size={16} /> {sent ? t('E-mail renvoyé ✔') : t('Renvoyer l’e-mail')}
          </button>
          {change.open ? (
            <form
              className="space-y-2 text-left"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const r = await api<{ user: User }>('/auth/email', { body: { email: change.email, password: change.password } });
                  setUser(r.user);
                  setChange({ open: false, email: '', password: '' });
                  setSent(true);
                } catch (err) {
                  setMsg((err as ApiError).message);
                }
              }}
            >
              <input className="input" type="email" required placeholder={t('Nouvelle adresse e-mail')} value={change.email} onChange={(e) => setChange({ ...change, email: e.target.value })} />
              <input className="input" type="password" required placeholder={t('Mot de passe')} value={change.password} onChange={(e) => setChange({ ...change, password: e.target.value })} />
              <button className="btn-outline w-full">{t('Corriger l’adresse')}</button>
            </form>
          ) : (
            <button className="btn-ghost btn-sm" onClick={() => setChange({ ...change, open: true })}>{t('Je me suis trompé d’adresse')}</button>
          )}
          <button className="btn-ghost btn-sm" onClick={async () => { await logout(); nav('/connexion'); }}><LogOut size={14} /> {t('Se déconnecter')}</button>
        </>
      ) : (
        <Link to="/connexion" className="btn-primary w-full">{t('Se connecter')}</Link>
      )}
    </Shell>
  );
}

export function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <Shell mood={done ? 'happy' : 'thinking'}>
      <h1 className="text-2xl font-black">{t('Mot de passe oublié')}</h1>
      {done ? (
        <p className="muted">{t('Si un compte existe avec cette adresse, un lien pour choisir un nouveau mot de passe vient d’être envoyé. Il est valable 1 heure.')}</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api('/auth/forgot', { body: { email } });
              setDone(true);
            } catch (err) {
              setMsg((err as ApiError).message);
            }
          }}
        >
          <p className="muted text-sm">{t('Saisis l’adresse de ton compte : tu recevras un lien pour choisir un nouveau mot de passe.')}</p>
          <input className="input" type="email" required autoComplete="email" placeholder="toi@exemple.fr" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Err msg={msg} />
          <button className="btn-primary w-full"><Send size={16} /> {t('Envoyer le lien')}</button>
        </form>
      )}
      <Link to="/connexion" className="block text-sm font-bold text-brand-500">{t('Retour à la connexion')}</Link>
    </Shell>
  );
}

export function ResetPassword() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  return (
    <Shell mood={ok ? 'celebrate' : 'explain'}>
      <h1 className="text-2xl font-black">{t('Nouveau mot de passe')}</h1>
      {ok ? (
        <>
          <p className="muted">{t('Ton mot de passe a été changé. Tu peux te connecter.')}</p>
          <button className="btn-primary w-full" onClick={() => nav('/connexion')}>{t('Se connecter')}</button>
        </>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api('/auth/reset', { body: { token: params.get('token') ?? '', password: pw } });
              setOk(true);
            } catch (err) {
              setMsg((err as ApiError).message);
            }
          }}
        >
          <input className="input" type="password" minLength={8} required autoComplete="new-password" placeholder={t('Nouveau mot de passe (8 caractères min.)')} value={pw} onChange={(e) => setPw(e.target.value)} />
          <Err msg={msg} />
          <button className="btn-primary w-full" disabled={pw.length < 8}><KeyRound size={16} /> {t('Enregistrer')}</button>
        </form>
      )}
    </Shell>
  );
}
