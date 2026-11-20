import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

/** Chargement de données avec état (données, erreur, rechargement). */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const ctrl = useRef<AbortController>();
  const load = useCallback(async () => {
    if (!path) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    setError(null);
    try {
      setData(await api<T>(path, { signal: c.signal }));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as ApiError).message);
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => {
    load();
    return () => ctrl.current?.abort();
  }, [load]);
  return { data, error, loading, reload: load, setData };
}

/** Détecte l'inactivité de l'utilisateur (pour la mascotte endormie). */
export function useIdle(ms = 90_000) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const reset = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), ms);
    };
    const evs = ['mousemove', 'keydown', 'pointerdown', 'scroll', 'touchstart'];
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(t);
      evs.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [ms]);
  return idle;
}

export function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
