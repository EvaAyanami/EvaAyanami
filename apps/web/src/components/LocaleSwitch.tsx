import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Languages } from 'lucide-react';
import { LOCALES, useI18n, type Locale } from '../lib/i18n';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

/** Choix de la langue de l'interface (enregistré sur le compte). */
export default function LocaleSwitch({ up = true }: { up?: boolean }) {
  const { locale, setLocale } = useI18n();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const cur = LOCALES.find((l) => l.id === locale)!;
  const choose = (l: Locale) => {
    setOpen(false);
    if (user) api('/me', { method: 'PATCH', body: { locale: l } }).catch(() => {});
    setLocale(l);
  };
  return (
    <div className="relative">
      <button className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800" onClick={() => setOpen((o) => !o)} aria-label="Langue">
        <Languages size={14} /> {cur.flag}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: up ? 6 : -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`absolute right-0 z-50 w-40 rounded-2xl border border-ink-100 bg-white p-1 shadow-xl dark:border-ink-800 dark:bg-ink-900 ${up ? 'bottom-full mb-2' : 'top-full mt-2'}`}
          >
            {LOCALES.map((l) => (
              <button key={l.id} onClick={() => choose(l.id)} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold ${l.id === locale ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30' : 'hover:bg-ink-50 dark:hover:bg-ink-800'}`}>
                {l.flag} {l.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
