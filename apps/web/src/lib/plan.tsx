/**
 * Offre gratuite / Premium côté interface : énergie, quotas, publicités récompensées,
 * détection des bloqueurs de publicité (avec une Kiri triste… puis fâchée !).
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Crown, Zap, Play, RotateCcw, Clock, Gift, ShieldOff, Sparkles, Infinity as InfinityIcon } from 'lucide-react';
import { api, ApiError } from './api';
import { useAuth } from './auth';
import { Modal } from '../components/ui';
import Mascot, { type Mood } from '../components/Mascot';
import { t } from './i18n';

export interface Plan {
  enabled: boolean;
  premium: boolean;
  premiumUntil: string | null;
  premiumSource: string | null;
  unlimited: boolean;
  reason: 'disabled' | 'admin' | 'premium' | 'free';
  energy: number;
  maxEnergy: number;
  nextEnergyAt: string | null;
  fullEnergyAt: string | null;
  regenMinutes: number;
  runsUsed: number;
  runsMax: number | null;
  adsEnabled: boolean;
  adsLeft: number;
  adRewardEnergy: number;
  adRewardRuns: number;
  reviewRefillsEnergy: boolean;
  codeCostsEnergy: boolean;
  trial: boolean;
  aiAllowed: boolean;
  priceLabel: string;
  stripe: boolean;
  payments: boolean;
  streakProtection: boolean;
  canManageBilling: boolean;
  ads: { provider: 'house' | 'adsense'; client: string | null; slotReward: string | null; slotBanner: string | null };
}

type LimitCode = 'NO_ENERGY' | 'RUN_QUOTA' | 'PREMIUM_ONLY';

interface PlanCtx {
  plan: Plan | null;
  refresh: () => Promise<void>;
  watchAd: () => void;
  adBlocked: boolean;
  showLimit: (code: LimitCode, message?: string) => void;
}

const Ctx = createContext<PlanCtx>(null as unknown as PlanCtx);
export const usePlan = () => useContext(Ctx);

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function countdown(target: string | null, now: number) {
  if (!target) return '';
  const s = Math.max(0, Math.round((new Date(target).getTime() - now) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function remaining(until: string | null, now = Date.now()) {
  if (!until) return '';
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return 'terminé';
  const d = Math.floor(ms / 86400_000);
  const h = Math.floor((ms % 86400_000) / 3600_000);
  if (d >= 1) return `${d} jour${d > 1 ? 's' : ''}${d < 7 && h ? ` ${h} h` : ''}`;
  const m = Math.floor((ms % 3600_000) / 60_000);
  return h ? `${h} h ${m} min` : `${m} min`;
}

/* ---------- AdSense ---------- */
let adsenseScript: Promise<boolean> | null = null;
export function loadAdSense(client: string): Promise<boolean> {
  if (adsenseScript) return adsenseScript;
  adsenseScript = new Promise((resolve) => {
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false); // bloqué (bloqueur de pub, DNS filtrant…)
    document.head.appendChild(s);
    setTimeout(() => resolve(!!(window as any).adsbygoogle?.loaded || !!(window as any).adsbygoogle), 6000);
  });
  return adsenseScript;
}

export function AdSenseUnit({ client, slot, format = 'auto', className }: { client: string; slot: string; format?: string; className?: string }) {
  const ref = useRef<HTMLModElement>(null);
  useEffect(() => {
    loadAdSense(client).then((ok) => {
      if (!ok || !ref.current || ref.current.dataset.adsbygoogleStatus) return;
      try {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      } catch {
        /* emplacement déjà rempli */
      }
    });
  }, [client, slot]);
  return <ins ref={ref} className={`adsbygoogle block ${className ?? ''}`} style={{ display: 'block' }} data-ad-client={client} data-ad-slot={slot} data-ad-format={format} data-full-width-responsive="true" />;
}

/** Détection d'un bloqueur : élément « appât » masqué par les listes de filtrage + chargement du script AdSense. */
async function detectAdBlock(client: string | null): Promise<boolean> {
  const bait = document.createElement('div');
  bait.className = 'adsbox ad-banner ad-placement pub_300x250 textads banner-ads';
  bait.setAttribute('style', 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;');
  bait.innerHTML = '&nbsp;';
  document.body.appendChild(bait);
  await new Promise((r) => setTimeout(r, 400));
  const style = getComputedStyle(bait);
  const hidden = bait.offsetHeight === 0 || style.display === 'none' || style.visibility === 'hidden';
  bait.remove();
  if (hidden) return true;
  if (client) return !(await loadAdSense(client));
  return false;
}

/* ------------------------------------------------------------------ */
/* Fournisseur                                                         */
/* ------------------------------------------------------------------ */

export function PlanProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [limit, setLimit] = useState<{ code: LimitCode; message?: string } | null>(null);
  const [adOpen, setAdOpen] = useState(false);
  const [adBlocked, setAdBlocked] = useState(false);
  const [blockNag, setBlockNag] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return setPlan(null);
    try {
      setPlan(await api<Plan>('/plan'));
    } catch {
      /* hors ligne */
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh, user?.id, user?.premium]);

  useEffect(() => {
    const onPlan = (e: Event) => setPlan((e as CustomEvent).detail);
    const onLimit = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setLimit({ code: d.code ?? 'NO_ENERGY', message: d.message });
      refresh();
    };
    window.addEventListener('cm-plan', onPlan);
    window.addEventListener('cm-limit', onLimit);
    return () => {
      window.removeEventListener('cm-plan', onPlan);
      window.removeEventListener('cm-limit', onLimit);
    };
  }, [refresh]);

  // Recharge d'énergie : on rafraîchit quand le prochain point arrive.
  useEffect(() => {
    if (!plan?.nextEnergyAt) return;
    const ms = new Date(plan.nextEnergyAt).getTime() - Date.now() + 1500;
    const t = setTimeout(refresh, Math.max(2000, Math.min(ms, 2 ** 31 - 1)));
    return () => clearTimeout(t);
  }, [plan?.nextEnergyAt, refresh]);

  // Anti-bloqueur : uniquement pour les comptes gratuits, au plus une fois par jour.
  useEffect(() => {
    if (!plan || plan.unlimited || !plan.adsEnabled) return;
    let cancelled = false;
    detectAdBlock(plan.ads.provider === 'adsense' ? plan.ads.client : null).then((blocked) => {
      if (cancelled) return;
      setAdBlocked(blocked);
      if (!blocked) return;
      const today = new Date().toISOString().slice(0, 10);
      try {
        if (localStorage.getItem('cm-adblock-nag') === today) return;
        localStorage.setItem('cm-adblock-nag', today);
      } catch {
        /* stockage indisponible */
      }
      setBlockNag(true);
    });
    return () => {
      cancelled = true;
    };
  }, [plan?.unlimited, plan?.adsEnabled, plan?.ads.provider]); // eslint-disable-line react-hooks/exhaustive-deps

  const watchAd = useCallback(() => {
    setLimit(null);
    if (adBlocked) setBlockNag(true);
    else setAdOpen(true);
  }, [adBlocked]);

  const showLimit = useCallback((code: LimitCode, message?: string) => setLimit({ code, message }), []);

  return (
    <Ctx.Provider value={{ plan, refresh, watchAd, adBlocked, showLimit }}>
      {children}
      <LimitModal limit={limit} plan={plan} onClose={() => setLimit(null)} onAd={watchAd} />
      <AdModal open={adOpen} onClose={() => setAdOpen(false)} onBlocked={() => { setAdOpen(false); setAdBlocked(true); setBlockNag(true); }} />
      <AdBlockModal open={blockNag} onClose={() => setBlockNag(false)} />
    </Ctx.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Indicateurs                                                         */
/* ------------------------------------------------------------------ */

export function EnergyPill() {
  const { plan, showLimit } = usePlan();
  const now = useNow();
  if (!plan || !plan.enabled) return null;
  if (plan.unlimited)
    return (
      <Link to="/premium" className="flex items-center gap-1 rounded-2xl px-2 py-1 font-extrabold text-violet-500" title={t("Énergie illimitée")}>
        <Zap size={18} className="fill-violet-400" /> <InfinityIcon size={18} />
      </Link>
    );
  const low = plan.energy <= 1;
  return (
    <button
      onClick={() => showLimit('NO_ENERGY')}
      className={`group relative flex items-center gap-1 rounded-2xl px-2 py-1 font-extrabold ${low ? 'text-rose-500' : 'text-sky-500'}`}
      title={plan.nextEnergyAt ? `+1 énergie dans ${countdown(plan.nextEnergyAt, now)}` : 'Énergie pleine'}
    >
      <motion.span key={plan.energy} initial={{ scale: 1.6, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }}>
        <Zap size={18} className={low ? 'fill-rose-400' : 'fill-sky-400'} />
      </motion.span>
      {plan.energy}
      {plan.nextEnergyAt && <span className="hidden text-xs font-bold opacity-70 sm:inline">· {countdown(plan.nextEnergyAt, now)}</span>}
    </button>
  );
}

export function PremiumBadge({ kind, size = 'sm' }: { kind: 'premium' | 'former' | null | undefined; size?: 'sm' | 'md' }) {
  if (!kind) return null;
  const big = size === 'md';
  return kind === 'premium' ? (
    <span className={`premium-shine inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 font-black text-amber-900 shadow-sm ${big ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]'}`} title={t("Membre Premium")}>
      <Crown size={big ? 15 : 12} /> {t("Premium")}
    </span>
  ) : (
    <span className={`inline-flex items-center gap-1 rounded-full bg-ink-100 font-black text-ink-500 dark:bg-ink-800 dark:text-ink-300 ${big ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]'}`} title={t("A déjà été Premium")}>
      <Crown size={big ? 15 : 12} /> {t("Ancien Premium")}
    </span>
  );
}

/** Bannière discrète pour les comptes gratuits (AdSense si configuré, sinon promotion Premium). */
export function FreeBanner() {
  const { plan, adBlocked } = usePlan();
  if (!plan || plan.unlimited) return null;
  if (plan.ads.slotBanner && plan.ads.client && !adBlocked)
    return (
      <div className="card mt-8 !p-2">
        <div className="muted mb-1 text-center text-[10px] font-bold uppercase tracking-wider">{t("Publicité · finance Codemori")}</div>
        <AdSenseUnit client={plan.ads.client} slot={plan.ads.slotBanner} format="horizontal" />
      </div>
    );
  return (
    <Link to="/premium" className="group mt-8 flex items-center gap-3 overflow-hidden rounded-3xl bg-gradient-to-r from-violet-600 via-brand-500 to-cyan-500 p-4 text-white shadow-lg transition hover:shadow-xl lg:mr-20">
      <Mascot mood="happy" size={56} crown />
      <div className="flex-1">
        <div className="font-black">{t("Envie d’aller plus loin ?")}</div>
        <div className="text-sm opacity-90">Énergie illimitée, zéro pub, IA de Kiri, protection de série… dès {plan.priceLabel}.</div>
      </div>
      <span className="rounded-2xl bg-white/20 px-3 py-2 font-black transition group-hover:bg-white/30">{t("Découvrir")}</span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Fenêtres                                                            */
/* ------------------------------------------------------------------ */

function LimitModal({ limit, plan, onClose, onAd }: { limit: { code: LimitCode; message?: string } | null; plan: Plan | null; onClose: () => void; onAd: () => void }) {
  const nav = useNavigate();
  const now = useNow();
  const code = limit?.code;
  const title = t(code === 'RUN_QUOTA' ? 'Exécutions du jour épuisées' : code === 'PREMIUM_ONLY' ? 'Réservé aux membres Premium' : plan && plan.energy > 0 ? 'Ton énergie' : "Plus d'énergie !");
  const go = (to: string) => {
    onClose();
    nav(to);
  };
  return (
    <Modal open={!!limit} onClose={onClose} title={title}>
      {plan && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Mascot mood={code === 'PREMIUM_ONLY' ? 'explain' : plan.energy > 0 && code === 'NO_ENERGY' ? 'happy' : 'sad'} size={100} />
            <div className="flex-1">
              {code === 'NO_ENERGY' && (
                <>
                  <div className="mb-2 flex gap-1">
                    {Array.from({ length: plan.maxEnergy }, (_, i) => (
                      <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.06 }}>
                        <Zap size={26} className={i < plan.energy ? 'fill-sky-400 text-sky-500' : 'text-ink-300 dark:text-ink-600'} />
                      </motion.div>
                    ))}
                  </div>
                  <p className="text-sm font-semibold">
                    {t(plan.energy > 0 ? 'Une mauvaise réponse coûte 1 énergie. ' : 'Pas de panique, ta progression est intacte ! ')}
                    {plan.nextEnergyAt ? (
                      <>{t("Prochaine recharge dans")} <b>{countdown(plan.nextEnergyAt, now)}</b> ({t('pleine dans')} {countdown(plan.fullEnergyAt, now)}).</>
                    ) : (
                      t('Ta réserve est pleine.')
                    )}
                  </p>
                  {!plan.codeCostsEnergy && <p className="muted mt-1 text-xs">{t("Les exercices d’écriture de code, les cours et l’IDE ne consomment jamais d’énergie.")}</p>}
                </>
              )}
              {code !== 'NO_ENERGY' && <p className="text-sm font-semibold">{limit?.message}</p>}
            </div>
          </div>

          <div className="grid gap-2">
            {plan.adsEnabled && code !== 'PREMIUM_ONLY' && (
              <button className="btn-primary justify-start" disabled={plan.adsLeft <= 0} onClick={onAd}>
                <Play size={18} /> {t("Regarder une courte pub")}
                <span className="ml-auto text-xs opacity-90">
                  {plan.adsLeft > 0 ? `+${plan.adRewardEnergy} énergie, +${plan.adRewardRuns} exécutions · ${plan.adsLeft} restante(s)` : 'limite du jour atteinte'}
                </span>
              </button>
            )}
            {code === 'NO_ENERGY' && plan.reviewRefillsEnergy && (
              <button className="btn-outline justify-start" onClick={() => go('/revisions')}>
                <RotateCcw size={18} /> {t("Faire une révision")} <span className="muted ml-auto text-xs">{t("+1 énergie par bonne réponse")}</span>
              </button>
            )}
            {code === 'NO_ENERGY' && plan.nextEnergyAt && (
              <button className="btn-ghost justify-start" onClick={onClose}>
                <Clock size={18} /> {t("Attendre la recharge")} <span className="muted ml-auto text-xs">{countdown(plan.nextEnergyAt, now)}</span>
              </button>
            )}
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => go('/premium')}
            className="premium-shine flex w-full items-center gap-3 rounded-3xl bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 p-4 text-left text-amber-950 shadow-lg"
          >
            <Crown size={28} />
            <div className="flex-1">
              <div className="font-black">{t("Passer à Premium")}</div>
              <div className="text-xs font-bold opacity-80">Tout illimité, sans publicité · dès {plan.priceLabel}</div>
            </div>
            <Sparkles size={20} />
          </motion.button>
        </div>
      )}
    </Modal>
  );
}

interface AdStart {
  ticket: string;
  durationSec: number;
  kind: 'house' | 'adsense';
  ad?: { title: string; body: string; imageUrl: string | null; linkUrl: string | null; linkLabel: string | null };
  adsense?: { client: string; slot: string };
}

function AdModal({ open, onClose, onBlocked }: { open: boolean; onClose: () => void; onBlocked: () => void }) {
  const { refresh } = usePlan();
  const nav = useNavigate();
  const [ad, setAd] = useState<AdStart | null>(null);
  const [error, setError] = useState('');
  const [left, setLeft] = useState(0);
  const [done, setDone] = useState<{ energy: number; runs: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const visible = useRef(true);

  useEffect(() => {
    if (!open) return;
    setAd(null);
    setDone(null);
    setError('');
    api<AdStart>('/ads/start', { body: {} })
      .then(async (a) => {
        if (a.kind === 'adsense' && a.adsense && !(await loadAdSense(a.adsense.client))) return onBlocked();
        setAd(a);
        setLeft(a.durationSec);
      })
      .catch((e) => setError((e as ApiError).message));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Le compte à rebours se met en pause si l'onglet est masqué.
  useEffect(() => {
    const h = () => (visible.current = document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, []);
  useEffect(() => {
    if (!ad || left <= 0) return;
    const t = setTimeout(() => visible.current && setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [ad, left]);

  async function claim() {
    if (!ad) return;
    setBusy(true);
    try {
      const r = await api<{ energy: number; runs: number }>(`/ads/${ad.ticket}/claim`, { body: {} });
      setDone({ energy: r.energy, runs: r.runs });
      refresh();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const progress = ad ? 1 - left / ad.durationSec : 0;
  return (
    <Modal open={open} onClose={onClose} title={done ? 'Merci !' : 'Publicité'}>
      {error && <p className="font-bold text-rose-500">{error}</p>}
      {!error && !ad && !done && <p className="muted">{t("Chargement de la publicité…")}</p>}
      {done && (
        <div className="flex flex-col items-center text-center">
          <Mascot mood="celebrate" size={130} />
          <motion.p initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-2 text-lg font-black">
            +{done.energy} <Zap size={18} className="inline fill-sky-400 text-sky-500" /> et +{done.runs} exécutions
          </motion.p>
          <p className="muted text-sm">{t("Merci de soutenir Codemori 💜")}</p>
          <button className="btn-primary mt-4" onClick={onClose}>{t("Continuer")}</button>
        </div>
      )}
      {ad && !done && (
        <div className="space-y-3">
          <div className="muted text-[10px] font-bold uppercase tracking-wider">{t("Annonce")}</div>
          {ad.kind === 'adsense' && ad.adsense ? (
            <div className="min-h-[250px] rounded-2xl bg-ink-50 p-2 dark:bg-ink-800/60">
              <AdSenseUnit client={ad.adsense.client} slot={ad.adsense.slot} format="rectangle" />
            </div>
          ) : (
            ad.ad && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-3xl border-2 border-ink-100 dark:border-ink-800">
                {ad.ad.imageUrl && <img src={ad.ad.imageUrl} alt="" className="max-h-56 w-full object-cover" />}
                <div className="p-4">
                  <h3 className="text-lg font-black">{ad.ad.title}</h3>
                  <p className="mt-1 text-sm">{ad.ad.body}</p>
                  {ad.ad.linkUrl && (
                    <button
                      className="btn-outline btn-sm mt-3"
                      onClick={() => {
                        api(`/ads/${ad.ticket}/click`, { body: {} }).catch(() => {});
                        if (ad.ad!.linkUrl!.startsWith('/')) {
                          onClose();
                          nav(ad.ad!.linkUrl!);
                        } else window.open(ad.ad!.linkUrl!, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      {ad.ad.linkLabel || 'En savoir plus'}
                    </button>
                  )}
                </div>
              </motion.div>
            )
          )}
          <div className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
            <motion.div className="h-full bg-gradient-to-r from-sky-400 to-violet-500" animate={{ width: `${progress * 100}%` }} transition={{ ease: 'linear', duration: 0.9 }} />
          </div>
          <button className="btn-success w-full" disabled={left > 0 || busy} onClick={claim}>
            <Gift size={18} /> {left > 0 ? `Récompense dans ${left} s` : 'Récupérer ma récompense'}
          </button>
        </div>
      )}
    </Modal>
  );
}

const NAG: { mood: Mood; title: string; text: string }[] = [
  { mood: 'sad', title: 'Oh… un bloqueur de pub ?', text: 'Codemori est gratuit grâce aux publicités. Sans elles, je ne peux pas payer les serveurs qui compilent ton code… 🥺' },
  { mood: 'sad', title: 'Toujours ce bloqueur…', text: 'Je comprends, les pubs c’est pénible. Mais une petite exception pour Codemori m’aiderait énormément !' },
  { mood: 'angry', title: 'Hé ! Je t’ai vu ! 😤', text: 'Ton bloqueur me coupe les vivres ! Désactive-le pour ce site, ou passe à Premium et je ne t’embête plus jamais avec la pub.' },
];

function AdBlockModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!open) return;
    try {
      const n = Number(localStorage.getItem('cm-adblock-count') ?? 0) + 1;
      localStorage.setItem('cm-adblock-count', String(n));
      setCount(n);
    } catch {
      setCount(1);
    }
  }, [open]);
  const nag = NAG[Math.min(NAG.length - 1, Math.max(0, count - 1))];
  return (
    <AnimatePresence>
      {open && (
        <Modal open onClose={onClose} title={nag.title}>
          <div className="flex flex-col items-center text-center">
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
              <Mascot mood={nag.mood} size={150} />
            </motion.div>
            <p className="mt-2 font-semibold">{nag.text}</p>
            <div className="muted mt-3 rounded-2xl bg-ink-50 p-3 text-left text-xs dark:bg-ink-800/60">
              <b>{t("Comment faire :")}</b> {t("clique sur l’icône de ton bloqueur (uBlock, AdBlock, Brave…) puis « désactiver sur ce site », et recharge la page. Les pubs récompensées (énergie, exécutions) ne fonctionnent pas tant que le bloqueur est actif.")}
            </div>
            <div className="mt-4 grid w-full gap-2">
              <button className="btn-primary" onClick={() => location.reload()}>
                <ShieldOff size={18} /> {t("J’ai désactivé mon bloqueur")}
              </button>
              <button
                className="premium-shine flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 px-4 py-2.5 font-black text-amber-950"
                onClick={() => {
                  onClose();
                  nav('/premium');
                }}
              >
                <Crown size={18} /> {t("Passer à Premium (zéro pub)")}
              </button>
              <button className="btn-ghost btn-sm" onClick={onClose}>{t("Continuer quand même")}</button>
            </div>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
