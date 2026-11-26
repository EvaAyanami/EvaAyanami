import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Home, GraduationCap, Map, Dumbbell, Code2, FolderKanban, RotateCcw, Trophy, BarChart3, UserRound, Shield, Flame, Sun, Moon, Menu, X, LogOut, MessageCircleHeart, Users, Crown,
} from 'lucide-react';
import { EnergyPill, FreeBanner, remaining, usePlan } from '../lib/plan';
import Avatar from './Avatar';
import LocaleSwitch from './LocaleSwitch';
import { t } from '../lib/i18n';
import clsx from 'clsx';
import { useAuth } from '../lib/auth';
import { applyTheme, isDark } from '../lib/theme';
import { api } from '../lib/api';
import { useIdle } from '../lib/hooks';
import Assistant from './Assistant';
import { useFeedback } from '../lib/feedback';

export const NAV = [
  { to: '/', label: 'Accueil', icon: Home, end: true },
  { to: '/apprendre', label: 'Apprendre', icon: GraduationCap },
  { to: '/parcours', label: 'Parcours', icon: Map },
  { to: '/exercices', label: 'Exercices', icon: Dumbbell },
  { to: '/ide', label: 'IDE', icon: Code2 },
  { to: '/projets', label: 'Projets', icon: FolderKanban },
  { to: '/revisions', label: 'Révisions', icon: RotateCcw },
  { to: '/communaute', label: 'Communauté', icon: Users },
  { to: '/succes', label: 'Succès', icon: Trophy },
  { to: '/statistiques', label: 'Statistiques', icon: BarChart3 },
  { to: '/profil', label: 'Profil', icon: UserRound },
  { to: '/premium', label: 'Premium', icon: Crown },
];

const MOBILE = ['/', '/apprendre', '/exercices', '/communaute', '/profil'];

export function Logo({ className }: { className?: string }) {
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <img src="/favicon.svg" alt="" className="h-9 w-9" />
      <span className="bg-gradient-to-r from-brand-500 via-violet-500 to-cyan-500 bg-clip-text text-2xl font-black tracking-tight text-transparent">{t("Codemori")}</span>
    </div>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(isDark());
  useEffect(() => {
    const h = (e: Event) => setDark((e as CustomEvent).detail);
    window.addEventListener('cm-theme', h);
    return () => window.removeEventListener('cm-theme', h);
  }, []);
  return (
    <button className="btn-ghost btn-sm" onClick={() => applyTheme(dark ? 'light' : 'dark')} aria-label={t("Changer de thème")} title={t("Mode clair / sombre")}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function SideLink({ to, label, icon: Icon, end, onClick, group = 'side' }: { to: string; label: string; icon: typeof Home; end?: boolean; onClick?: () => void; group?: string }) {
  const premium = to === '/premium';
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        clsx(
          'group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 font-extrabold transition-colors',
          isActive ? (premium ? 'text-amber-700 dark:text-amber-300' : 'text-brand-600 dark:text-brand-300') : premium ? 'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30' : 'text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId={`nav-active-${group}`}
              className={clsx('absolute inset-0 rounded-2xl ring-2', premium ? 'bg-amber-50 ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-800' : 'bg-brand-50 ring-brand-200 dark:bg-brand-900/30 dark:ring-brand-800')}
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
          )}
          <motion.span className="relative" whileHover={{ rotate: [0, -12, 10, 0], scale: 1.15 }} transition={{ duration: 0.4 }}>
            <Icon size={20} />
          </motion.span>
          <span className="relative">{t(label)}</span>
        </>
      )}
    </NavLink>
  );
}

/** Encart de la barre latérale : statut Premium ou invitation. */
function PremiumCard() {
  const { user } = useAuth();
  const { plan } = usePlan();
  if (!plan?.enabled || plan.reason === 'admin') return null;
  if (user?.premium)
    return (
      <NavLink to="/premium" className="premium-shine mt-3 block rounded-2xl bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 p-3 text-amber-950 shadow">
        <div className="flex items-center gap-2 text-sm font-black"><Crown size={16} /> Premium{plan.trial ? ' (essai)' : ''}</div>
        <div className="text-xs font-bold opacity-80">Encore {remaining(user.premiumUntil)}</div>
      </NavLink>
    );
  return (
    <NavLink to="/premium" className="group mt-3 block overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-brand-500 to-cyan-500 p-3 text-white shadow-lg">
      <div className="flex items-center gap-2 text-sm font-black"><Crown size={16} className="transition group-hover:rotate-12 group-hover:scale-125" /> {t("Passer à Premium")}</div>
      <div className="text-xs font-bold opacity-90">{t("Tout illimité, zéro pub")}</div>
    </NavLink>
  );
}

export default function Layout({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const { openAssistant } = useFeedback();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const idle = useIdle(120_000);
  const outlet = useOutlet();

  // Temps d'apprentissage : battement toutes les minutes tant que l'onglet est actif
  useEffect(() => {
    const iv = setInterval(() => {
      if (document.visibilityState !== 'visible' || idle) return;
      const label = document.title.replace(/ · Codemori$/, '');
      api('/me/heartbeat', { body: { timeMs: 60_000, location: loc.pathname.match(/^\/(chapitre|exercice|projets\/)/) ? { path: loc.pathname + loc.search, label } : undefined } }).catch(() => {});
    }, 60_000);
    return () => clearInterval(iv);
  }, [idle, loc.pathname, loc.search]);

  useEffect(() => setMenu(false), [loc.pathname]);

  const links = [...NAV, ...(user?.role === 'ADMIN' ? [{ to: '/admin', label: 'Administration', icon: Shield }] : [])];

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Barre latérale (ordinateur) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-ink-200 bg-white px-4 py-5 dark:border-ink-800 dark:bg-ink-900 lg:flex">
        <Logo className="px-2" />
        <nav className="scrollbar-thin mt-6 flex-1 space-y-1 overflow-y-auto">
          {links.map((l) => (
            <SideLink key={l.to} {...l} />
          ))}
        </nav>
        <div className="mt-2 flex gap-1 px-1 text-xs font-bold">
          <NavLink to="/faq" className="rounded-lg px-2 py-1 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800">❔ {t('FAQ')}</NavLink>
          <NavLink to="/avis" className="rounded-lg px-2 py-1 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800">💬 {t('Avis')}</NavLink>
          <div className="flex-1" />
          <LocaleSwitch />
        </div>
        <PremiumCard />
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-ink-50 p-2 dark:bg-ink-800/60">
          <NavLink to="/avatar" title={t("Mon avatar")}>
            <Avatar avatar={user?.avatar} size={40} ring={user?.premium ? 'premium' : 'none'} />
          </NavLink>
          <div className="min-w-0 flex-1 text-sm">
            <div className={clsx('truncate font-extrabold', user?.premium && 'premium-text')}>{user?.displayName}</div>
            <div className="muted truncate font-mono text-[11px]">{user?.tag}</div>
          </div>

          <button
            className="btn-ghost btn-sm"
            title={t("Se déconnecter")}
            onClick={async () => {
              await logout();
              nav('/connexion');
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Barre supérieure */}
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-ink-200/70 bg-white/80 px-4 py-2 backdrop-blur dark:border-ink-800 dark:bg-ink-950/80">
        <button className="btn-ghost btn-sm lg:hidden" onClick={() => setMenu(true)} aria-label={t("Menu")}>
          <Menu size={20} />
        </button>
        <Logo className="lg:hidden [&_span]:text-xl [&_img]:h-7 [&_img]:w-7" />
        <div className="flex-1" />
        <div className="flex items-center gap-1 rounded-2xl px-2 py-1 font-extrabold text-orange-500" title={t("Série quotidienne")}>
          <Flame size={20} className={clsx(user?.streak ? 'fill-orange-400' : 'opacity-50')} /> {user?.streak ?? 0}
        </div>
        <div className="flex items-center gap-1 rounded-2xl px-2 py-1 font-extrabold text-amber-500" title={t("Expérience")}>
          ⭐ {user?.xp ?? 0}
        </div>
        <EnergyPill />
        <button className="btn-ghost btn-sm" onClick={() => openAssistant()} title={`Demander à Kiri`}>
          <MessageCircleHeart size={20} className="text-violet-500" />
        </button>
        <ThemeToggle />
        <NavLink to="/profil" className="ml-1 hidden sm:block" title={t("Mon profil")}>
          <motion.div whileHover={{ scale: 1.08, rotate: -4 }}>
            <Avatar avatar={user?.avatar} size={34} ring={user?.premium ? 'premium' : 'none'} />
          </motion.div>
        </NavLink>
      </header>

      {/* Menu mobile */}
      <AnimatePresence>
        {menu && (
          <motion.div className="fixed inset-0 z-50 bg-ink-950/50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenu(false)}>
            <motion.aside
              className="h-full w-72 overflow-y-auto bg-white p-4 dark:bg-ink-900"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <Logo />
                <button className="btn-ghost btn-sm" onClick={() => setMenu(false)}>
                  <X size={20} />
                </button>
              </div>
              <nav className="space-y-1">
                {links.map((l) => (
                  <SideLink key={l.to} {...l} group="mobile" onClick={() => setMenu(false)} />
                ))}
              </nav>
              <button
                className="btn-outline mt-6 w-full"
                onClick={async () => {
                  await logout();
                  nav('/connexion');
                }}
              >
                <LogOut size={16} /> {t("Se déconnecter")}
              </button>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={loc.pathname}
            initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {children ?? outlet}
          </motion.div>
        </AnimatePresence>
        {!loc.pathname.startsWith('/premium') && !loc.pathname.startsWith('/admin') && <FreeBanner />}
      </main>

      {/* Navigation basse (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-ink-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-ink-800 dark:bg-ink-900/95 lg:hidden">
        {NAV.filter((n) => MOBILE.includes(n.to)).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => clsx('relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-extrabold transition-colors', isActive ? 'text-brand-500' : 'text-ink-400')}>
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="nav-bottom" className="absolute inset-x-3 top-0 h-1 rounded-b-full bg-brand-500" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <motion.span animate={isActive ? { y: -2, scale: 1.12 } : { y: 0, scale: 1 }}>
                  <Icon size={22} />
                </motion.span>
                {t(label)}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <Assistant />
    </div>
  );
}
