import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, ShieldOff, ShieldAlert, Copy, Download, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth, type User } from '../lib/auth';
import { useFeedback } from '../lib/feedback';
import { Modal } from './ui';

/** Activation / désactivation de la double authentification (TOTP) et codes de secours. */
export default function TwoFactorCard() {
  const { user, setUser } = useAuth();
  const { toast } = useFeedback();
  const [step, setStep] = useState<'idle' | 'password' | 'scan' | 'codes' | 'disable' | 'regen'>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const reset = () => {
    setStep('idle');
    setPassword('');
    setCode('');
    setSetup(null);
  };
  const reloadUser = async () => {
    const r = await api<{ user: User | null }>('/auth/me');
    if (r.user) setUser(r.user);
  };
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      ((e as ApiError).status !== 402 && toast((e as ApiError).message, 'error'));
    } finally {
      setBusy(false);
    }
  }

  const start = () => run(async () => {
    setSetup(await api('/auth/2fa/setup', { body: { password } }));
    setStep('scan');
  });
  const enable = () => run(async () => {
    const r = await api<{ recoveryCodes: string[] }>('/auth/2fa/enable', { body: { code } });
    setCodes(r.recoveryCodes);
    setStep('codes');
    await reloadUser();
    toast('Double authentification activée 🔐', 'success');
  });
  const disable = () => run(async () => {
    await api('/auth/2fa/disable', { body: { password, code } });
    await reloadUser();
    reset();
    toast('Double authentification désactivée', 'info');
  });
  const regen = () => run(async () => {
    const r = await api<{ recoveryCodes: string[] }>('/auth/2fa/recovery', { body: { password, code } });
    setCodes(r.recoveryCodes);
    setPassword('');
    setCode('');
    setStep('codes');
  });

  const download = () => {
    const blob = new Blob([`Codes de secours Codemori — ${user.tag}\nChaque code ne fonctionne qu'une fois.\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'codemori-codes-de-secours.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="card space-y-3">
      <h2 className="section-title flex items-center gap-2">
        {user.twoFactorEnabled ? <ShieldCheck size={20} className="text-emerald-500" /> : <ShieldAlert size={20} className="text-amber-500" />} Double authentification
      </h2>
      {user.twoFactorEnabled ? (
        <>
          <p className="text-sm">
            <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Activée</span> Un code de ton application est demandé à chaque connexion.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline btn-sm" onClick={() => setStep('regen')}><RefreshCw size={14} /> Nouveaux codes de secours</button>
            <button className="btn-ghost btn-sm text-rose-500" onClick={() => setStep('disable')}><ShieldOff size={14} /> Désactiver</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted text-sm">Protège ton compte avec une application comme Google Authenticator, Aegis, 2FAS, Microsoft Authenticator ou Bitwarden : même avec ton mot de passe, personne ne peut se connecter sans ton téléphone.</p>
          <button className="btn-primary btn-sm" onClick={() => setStep('password')}><ShieldCheck size={14} /> Activer</button>
        </>
      )}

      <Modal open={step !== 'idle'} onClose={reset} title={step === 'codes' ? 'Tes codes de secours' : step === 'disable' ? 'Désactiver la double authentification' : step === 'regen' ? 'Nouveaux codes de secours' : 'Activer la double authentification'}>
        {step === 'password' && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(); }}>
            <p className="text-sm">Confirme ton mot de passe pour commencer.</p>
            <input autoFocus className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" />
            <button className="btn-primary w-full" disabled={!password || busy}>Continuer</button>
          </form>
        )}
        {step === 'scan' && setup && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); enable(); }}>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Scanne ce QR code avec ton application d’authentification.</li>
              <li>Saisis le code à 6 chiffres qu’elle affiche.</li>
            </ol>
            <motion.img initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} src={setup.qr} alt="QR code de configuration" className="mx-auto h-52 w-52 rounded-2xl bg-white p-2" />
            <div className="rounded-2xl bg-ink-50 p-3 text-center text-xs dark:bg-ink-800/60">
              Impossible de scanner ? Saisis cette clé à la main :
              <button type="button" className="mt-1 block w-full font-mono text-sm font-black tracking-wider" onClick={() => navigator.clipboard?.writeText(setup.secret.replace(/\s/g, ''))}>
                {setup.secret} <Copy size={12} className="inline" />
              </button>
              <a href={setup.uri} className="mt-1 inline-block font-bold text-brand-500">Ouvrir dans l’application (sur ce téléphone)</a>
            </div>
            <input autoFocus className="input text-center font-mono text-2xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
            <button className="btn-primary w-full" disabled={code.length !== 6 || busy}>Activer</button>
          </form>
        )}
        {step === 'codes' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">Garde ces codes en lieu sûr : chacun permet de te connecter <b>une seule fois</b> si tu perds ton téléphone. Ils ne seront plus affichés.</p>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-ink-50 p-3 font-mono text-sm font-bold dark:bg-ink-800/60">
              {codes.map((c) => <span key={c}>{c}</span>)}
            </div>
            <div className="flex gap-2">
              <button className="btn-outline flex-1" onClick={download}><Download size={16} /> Télécharger</button>
              <button className="btn-outline flex-1" onClick={() => navigator.clipboard?.writeText(codes.join('\n')).then(() => toast('Codes copiés', 'success'))}><Copy size={16} /> Copier</button>
            </div>
            <button className="btn-primary w-full" onClick={reset}>Je les ai mis de côté</button>
          </div>
        )}
        {(step === 'disable' || step === 'regen') && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); step === 'disable' ? disable() : regen(); }}>
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" />
            <input className="input font-mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code de l’application ou code de secours" />
            <button className={step === 'disable' ? 'btn-danger w-full' : 'btn-primary w-full'} disabled={!password || code.length < 6 || busy}>
              {step === 'disable' ? 'Désactiver' : 'Générer de nouveaux codes'}
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
