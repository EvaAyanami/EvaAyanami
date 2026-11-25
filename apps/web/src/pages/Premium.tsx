import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Crown, Check, X, Zap, Infinity as InfinityIcon, Sparkles, Shield, Bot, Ban, Palette, Flame, KeyRound, Copy, Gift, ShoppingBag, CreditCard, History, Loader2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFeedback } from '../lib/feedback';
import { useApi } from '../lib/hooks';
import { usePlan, remaining, PremiumBadge } from '../lib/plan';
import { PageTitle, Modal } from '../components/ui';
import Mascot from '../components/Mascot';
import Duo from '../components/Duo';

interface Offer { id: string; months: number; days: number; priceCents: number; label: string; best?: boolean; perMonthCents: number; savingPercent: number }
interface Shop { payments: boolean; offers: Offer[]; keys: { id: string; code: string; days: number; offer: string | null; amountCents: number | null; createdAt: string; usedBy: string | null }[] }
interface PremiumInfo {
  history: { periods: { id: string; sourceLabel: string; startsAt: string; endsAt: string; days: number; current: boolean; note: string | null }[]; totalDays: number; since: string | null };
}

const euros = (c: number) => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

const perks = (p: { maxEnergy: number; regenMinutes: number; runsMax: number | null } | null) => [
  { icon: Zap, title: 'Énergie', free: `${p?.maxEnergy ?? 5}, +1 toutes les ${p?.regenMinutes ?? 30} min`, premium: 'Illimitée' },
  { icon: InfinityIcon, title: 'Exécutions de code', free: `${p?.runsMax ?? 40} par jour (+ bonus pub)`, premium: 'Illimitées' },
  { icon: Ban, title: 'Publicités', free: 'Courtes pubs facultatives', premium: 'Aucune' },
  { icon: Bot, title: 'Assistante IA de Kiri', free: 'Indices et explications sans IA', premium: 'Conversation IA complète' },
  { icon: Flame, title: 'Protection de série', free: '—', premium: '1 jour manqué pardonné par semaine' },
  { icon: Palette, title: 'Avatar', free: 'Toutes les bases', premium: 'Couronne, auréole, cape, cheveux arc-en-ciel, fonds animés…' },
  { icon: Crown, title: 'Badge et cadre', free: '—', premium: 'Badge Premium doré et cadre animé sur ton profil' },
  { icon: Shield, title: 'Contenu', free: 'Tous les cours, exercices et projets', premium: 'Tous les cours, exercices et projets' },
];

export default function Premium() {
  const { user, refresh: refreshUser } = useAuth();
  const { plan, refresh } = usePlan();
  const { toast, celebrate } = useFeedback();
  const shop = useApi<Shop>('/shop');
  const info = useApi<PremiumInfo>('/me/premium');
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [bought, setBought] = useState<{ id: string; code: string; days: number } | null>(null);

  // Retour du paiement Stripe
  useEffect(() => {
    const sid = params.get('session_id');
    if (params.get('paiement') === 'ok') {
      toast('Merci ! Ton abonnement est en cours d’activation 💜', 'success');
      setTimeout(() => { refresh(); refreshUser(); }, 2500);
    }
    if (params.get('paiement') === 'annule') toast('Paiement annulé', 'info');
    if (!sid) return;
    let tries = 0;
    const check = async () => {
      try {
        const r = await api<{ paid: boolean; key: { id: string; code: string; days: number } | null }>('/shop/confirm', { body: { sessionId: sid } });
        if (r.paid && r.key) {
          setBought(r.key);
          shop.reload();
          setParams({}, { replace: true });
        } else if (tries++ < 5) setTimeout(check, 2000);
      } catch (e) {
        ((e as ApiError).status !== 402 && toast((e as ApiError).message, 'error'));
      }
    };
    check();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function after(r: { days: number }) {
    await Promise.all([refresh(), refreshUser()]);
    info.reload();
    shop.reload();
    celebrate(undefined, { title: 'Bienvenue dans Premium ! 👑', text: `${r.days} jours de Premium ajoutés. Tout est illimité, et Kiri a une nouvelle couronne !` });
  }

  async function redeem(e?: React.FormEvent) {
    e?.preventDefault();
    if (!code.trim()) return;
    setBusy('redeem');
    try {
      const r = await api<{ days: number }>('/premium/redeem', { body: { code } });
      setCode('');
      await after(r);
    } catch (err) {
      ((err as ApiError).status !== 402 && toast((err as ApiError).message, 'error'));
    } finally {
      setBusy(null);
    }
  }

  async function redeemMine(id: string) {
    setBusy(id);
    try {
      const r = await api<{ days: number }>(`/shop/keys/${id}/redeem`, { body: {} });
      setBought(null);
      await after(r);
    } catch (err) {
      ((err as ApiError).status !== 402 && toast((err as ApiError).message, 'error'));
    } finally {
      setBusy(null);
    }
  }

  async function buy(offer: string) {
    setBusy(offer);
    try {
      const r = await api<{ url: string }>('/shop/checkout', { body: { offer } });
      location.href = r.url;
    } catch (err) {
      ((err as ApiError).status !== 402 && toast((err as ApiError).message, 'error'));
      setBusy(null);
    }
  }

  async function subscribe() {
    setBusy('sub');
    try {
      const r = await api<{ url: string }>(plan?.canManageBilling ? '/billing/portal' : '/billing/checkout', { body: {} });
      location.href = r.url;
    } catch (err) {
      ((err as ApiError).status !== 402 && toast((err as ApiError).message, 'error'));
      setBusy(null);
    }
  }

  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast('Clé copiée', 'success'));
  const active = !!user?.premium;

  return (
    <div>
      <PageTitle title="Premium" subtitle="Soutiens Codemori et apprends sans aucune limite." />

      {/* Héros */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative mb-6 overflow-hidden rounded-4xl bg-gradient-to-br from-violet-600 via-brand-600 to-cyan-500 p-6 text-white shadow-xl sm:p-8"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 left-10 h-56 w-56 rounded-full bg-amber-300/20 blur-3xl" />
        <div className="relative grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <PremiumBadge kind={active ? 'premium' : user?.formerPremium ? 'former' : null} size="md" />
              {plan?.trial && <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-black">Essai gratuit</span>}
            </div>
            {active ? (
              <>
                <h2 className="text-3xl font-black sm:text-4xl">Tu es Premium ✨</h2>
                <p className="mt-2 text-lg opacity-95">
                  Encore <b>{remaining(user!.premiumUntil)}</b> · jusqu’au {new Date(user!.premiumUntil!).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                {plan?.trial && <p className="mt-1 text-sm opacity-90">Ton essai se termine bientôt : prends une clé pour garder tes avantages sans interruption (le temps s’ajoute).</p>}
              </>
            ) : (
              <>
                <h2 className="text-3xl font-black sm:text-4xl">Passe à la vitesse supérieure</h2>
                <p className="mt-2 text-lg opacity-95">Énergie et exécutions illimitées, zéro pub, l’IA de Kiri et des avatars exclusifs.</p>
                <p className="mt-1 text-sm font-bold opacity-90">Dès {plan?.priceLabel ?? '4,99 € / mois'} · sans engagement avec les clés</p>
              </>
            )}
          </div>
          <div className="hidden md:block">
            <Duo scene={active ? 'celebrate' : 'cheer'} size={120} />
          </div>
        </div>
      </motion.div>

      {/* Boutique */}
      <h2 className="section-title mb-3 flex items-center gap-2"><ShoppingBag size={20} /> Boutique de clés</h2>
      <div className="mb-2 grid gap-4 md:grid-cols-3">
        {shop.data?.offers.map((o, i) => (
          <motion.div
            key={o.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            whileHover={{ y: -6 }}
            className={clsx(
              'relative flex flex-col rounded-4xl border-2 p-6 shadow-soft transition',
              o.best ? 'border-amber-300 bg-gradient-to-b from-amber-50 to-white dark:border-amber-500/60 dark:from-amber-950/30 dark:to-ink-900' : 'border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-900',
            )}
          >
            {o.best && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-3 py-1 text-xs font-black text-white shadow">
                Meilleure offre{o.savingPercent ? ` · −${o.savingPercent} %` : ''}
              </span>
            )}
            <div className="text-lg font-black">{o.label}</div>
            <div className="mt-2 flex items-end gap-1">
              <span className="text-4xl font-black">{euros(o.priceCents)}</span>
            </div>
            <div className="muted text-sm font-bold">
              soit {euros(o.perMonthCents)} / mois{o.savingPercent && !o.best ? ` · −${o.savingPercent} %` : ''}
            </div>
            <ul className="my-4 space-y-1 text-sm">
              <li className="flex items-center gap-2"><Check size={16} className="text-emerald-500" /> {o.days} jours de Premium</li>
              <li className="flex items-center gap-2"><Check size={16} className="text-emerald-500" /> Clé à activer ou à offrir</li>
              <li className="flex items-center gap-2"><Check size={16} className="text-emerald-500" /> Sans renouvellement automatique</li>
            </ul>
            <button className={clsx('mt-auto w-full', o.best ? 'btn-primary' : 'btn-outline')} disabled={!!busy} onClick={() => buy(o.id)}>
              {busy === o.id ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />} Acheter
            </button>
          </motion.div>
        ))}
      </div>
      <p className="muted mb-8 text-center text-xs">
        {shop.data?.payments
          ? 'Paiement sécurisé par carte, Apple Pay, Google Pay ou Link. Tu reçois ta clé immédiatement.'
          : 'Le paiement en ligne n’est pas encore activé sur ce serveur : obtiens une clé auprès de l’administrateur ou sur le Discord de la communauté, puis active-la ci-dessous.'}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Activer une clé */}
        <form onSubmit={redeem} className="card space-y-3">
          <h2 className="section-title flex items-center gap-2"><KeyRound size={20} /> Activer une clé</h2>
          <p className="muted text-sm">Une clé achetée sur la boutique, sur Discord ou offerte par un ami. Le temps s’ajoute à ton Premium actuel.</p>
          <div className="flex gap-2">
            <input className="input font-mono uppercase tracking-wider" placeholder="KIRI-XXXX-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn-primary shrink-0" disabled={!code.trim() || busy === 'redeem'}>
              {busy === 'redeem' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Activer
            </button>
          </div>
          {plan?.stripe && (
            <div className="rounded-2xl bg-ink-50 p-3 text-sm dark:bg-ink-800/60">
              <b>Préférer un abonnement mensuel ?</b> {plan.priceLabel}, résiliable à tout moment.
              <button type="button" className="btn-outline btn-sm mt-2 w-full" onClick={subscribe} disabled={!!busy}>
                {plan.canManageBilling ? 'Gérer mon abonnement' : 'S’abonner chaque mois'}
              </button>
            </div>
          )}
        </form>

        {/* Mes clés */}
        <div className="card">
          <h2 className="section-title mb-2 flex items-center gap-2"><Gift size={20} /> Mes clés achetées</h2>
          {!shop.data?.keys.length && <p className="muted text-sm">Aucune clé pour l’instant. Les clés achetées apparaissent ici : active-les ou offre-les à un ami.</p>}
          <div className="space-y-2">
            {shop.data?.keys.map((k) => (
              <div key={k.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-ink-50 p-3 dark:bg-ink-800/60">
                <code className="font-mono text-sm font-bold">{k.code}</code>
                <span className="muted text-xs">{k.days} j</span>
                <div className="ml-auto flex gap-1">
                  {k.usedBy ? (
                    <span className="chip">utilisée par {k.usedBy}</span>
                  ) : (
                    <>
                      <button className="btn-ghost btn-sm" onClick={() => copy(k.code)} title="Copier pour l’offrir"><Copy size={14} /></button>
                      <button className="btn-primary btn-sm" disabled={busy === k.id} onClick={() => redeemMine(k.id)}>Activer</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Comparatif */}
      <h2 className="section-title mb-3 mt-8">Gratuit ou Premium ?</h2>
      <div className="card overflow-hidden !p-0">
        <div className="grid grid-cols-[1.3fr_1fr_1fr] bg-ink-50 px-4 py-3 text-sm font-black dark:bg-ink-800/60">
          <span />
          <span className="text-center">Gratuit</span>
          <span className="premium-text text-center">Premium</span>
        </div>
        {perks(plan && !plan.unlimited ? plan : null).map((p, i) => (
          <motion.div
            key={p.title}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.04 }}
            className="grid grid-cols-[1.3fr_1fr_1fr] items-center gap-2 border-t border-ink-100 px-4 py-3 text-sm dark:border-ink-800"
          >
            <span className="flex items-center gap-2 font-bold"><p.icon size={18} className="text-violet-500" /> {p.title}</span>
            <span className="muted text-center text-xs">{p.free === '—' ? <X size={16} className="mx-auto text-ink-300" /> : p.free}</span>
            <span className="text-center text-xs font-bold text-emerald-600 dark:text-emerald-400">{p.premium}</span>
          </motion.div>
        ))}
      </div>

      {/* Historique */}
      <div className="card mt-6">
        <h2 className="section-title mb-2 flex items-center gap-2"><History size={20} /> Mon historique Premium</h2>
        {info.data && info.data.history.periods.length ? (
          <>
            <p className="muted mb-3 text-sm">
              {info.data.history.totalDays} jour(s) de Premium au total, depuis le {new Date(info.data.history.since!).toLocaleDateString('fr-FR')}. Merci 💜
            </p>
            <div className="space-y-2">
              {info.data.history.periods.map((p) => (
                <div key={p.id} className={clsx('flex flex-wrap items-center gap-2 rounded-2xl p-3 text-sm', p.current ? 'bg-amber-50 ring-2 ring-amber-200 dark:bg-amber-950/20 dark:ring-amber-800' : 'bg-ink-50 dark:bg-ink-800/60')}>
                  <Crown size={16} className={p.current ? 'text-amber-500' : 'text-ink-400'} />
                  <b>{p.sourceLabel}</b>
                  <span className="muted">{p.days} j</span>
                  <span className="ml-auto text-xs">
                    {new Date(p.startsAt).toLocaleDateString('fr-FR')} → {new Date(p.endsAt).toLocaleDateString('fr-FR')}
                  </span>
                  {p.current && <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">en cours</span>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <Mascot mood="explain" size={70} />
            <p className="muted text-sm">Tu n’as encore jamais été Premium. Ta première période apparaîtra ici.</p>
          </div>
        )}
      </div>

      <p className="muted mt-6 text-center text-xs">
        Codemori reste gratuit : tous les cours, exercices et projets sont accessibles sans payer. <Link to="/" className="font-bold text-brand-500">Retour à l’accueil</Link>
      </p>

      <Modal open={!!bought} onClose={() => setBought(null)} title="Merci pour ton achat ! 🎉">
        {bought && (
          <div className="flex flex-col items-center text-center">
            <Duo scene="celebrate" size={100} />
            <p className="mt-3 font-semibold">Voici ta clé de {bought.days} jours :</p>
            <code className="my-2 rounded-2xl bg-ink-50 px-4 py-2 font-mono text-lg font-black dark:bg-ink-800">{bought.code}</code>
            <div className="mt-2 grid w-full gap-2">
              <button className="btn-primary" onClick={() => redeemMine(bought.id)} disabled={busy === bought.id}><Sparkles size={16} /> L’activer sur mon compte</button>
              <button className="btn-outline" onClick={() => copy(bought.code)}><Copy size={16} /> Copier pour l’offrir</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
