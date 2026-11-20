export type Theme = 'light' | 'dark' | 'system';

export function applyTheme(t: Theme) {
  try {
    localStorage.setItem('cm-theme', t);
  } catch {
    /* stockage indisponible */
  }
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  window.dispatchEvent(new CustomEvent('cm-theme', { detail: dark }));
}

export function currentTheme(): Theme {
  try {
    return (localStorage.getItem('cm-theme') as Theme) || 'system';
  } catch {
    return 'system';
  }
}

export const isDark = () => document.documentElement.classList.contains('dark');
