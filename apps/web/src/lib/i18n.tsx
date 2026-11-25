/**
 * Traduction de l'interface : français (langue source), anglais, allemand, espagnol.
 *
 * Le texte français sert de clé : `t('Accueil')` renvoie « Home » en anglais.
 * Une phrase absente du dictionnaire reste en français (jamais de clé brute à l'écran).
 * Variables : t('Bonjour, {nom} !', { nom: 'Kiri' }).
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { EN } from '../locales/en';
import { DE } from '../locales/de';
import { ES } from '../locales/es';

export type Locale = 'fr' | 'en' | 'de' | 'es';
export const LOCALES: { id: Locale; label: string; flag: string }[] = [
  { id: 'fr', label: 'Français', flag: '🇫🇷' },
  { id: 'en', label: 'English', flag: '🇬🇧' },
  { id: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { id: 'es', label: 'Español', flag: '🇪🇸' },
];

const DICTS: Record<Locale, Record<string, string>> = { fr: {}, en: EN, de: DE, es: ES };

function detect(): Locale {
  try {
    const saved = localStorage.getItem('cm-locale') as Locale | null;
    if (saved && saved in DICTS) return saved;
  } catch {
    /* stockage indisponible */
  }
  const nav = (navigator.language || 'fr').slice(0, 2) as Locale;
  return nav in DICTS ? nav : 'fr';
}

let current: Locale = typeof window === 'undefined' ? 'fr' : detect();

/** Traduction utilisable hors composant (messages, toasts…). */
export function t(text: string, vars?: Record<string, string | number>): string {
  let out = (current !== 'fr' && DICTS[current][text]) || text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

interface I18nCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: typeof t;
}
const Ctx = createContext<I18nCtx>({ locale: current, setLocale: () => {}, t });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setState] = useState<Locale>(current);
  const setLocale = useCallback((l: Locale) => {
    current = l;
    try {
      localStorage.setItem('cm-locale', l);
    } catch {
      /* stockage indisponible */
    }
    document.documentElement.lang = l;
    setState(l);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  // La clé `locale` force le re-rendu complet de l'application quand on change de langue.
  return (
    <Ctx.Provider value={{ locale, setLocale, t }}>
      <div key={locale} className="contents">
        {children}
      </div>
    </Ctx.Provider>
  );
}

export const useI18n = () => useContext(Ctx);
