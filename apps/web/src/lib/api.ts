/** Client HTTP de l'API Codemori. */
export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'x-codemori': '1' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    // 402 : limite de l'offre gratuite atteinte → fenêtre « plus d'énergie / quota ».
    if (res.status === 402) window.dispatchEvent(new CustomEvent('cm-limit', { detail: { code: data?.details?.code, message: data?.error } }));
    throw new ApiError(res.status, data?.error ?? `Erreur ${res.status}`, data?.details);
  }
  // Les réponses qui modifient l'énergie ou les quotas renvoient l'état à jour de l'offre.
  if (data && typeof data === 'object' && 'plan' in data && data.plan) window.dispatchEvent(new CustomEvent('cm-plan', { detail: data.plan }));
  return data as T;
}

export const LANG_META: Record<string, { name: string; color: string; gradient: string; icon: string; file: string; monaco: string }> = {
  rust: { name: 'Rust', color: '#f46623', gradient: 'from-orange-400 to-rose-500', icon: '🦀', file: 'main.rs', monaco: 'rust' },
  cpp: { name: 'C++', color: '#3b82f6', gradient: 'from-sky-400 to-indigo-500', icon: '⚙️', file: 'main.cpp', monaco: 'cpp' },
  java: { name: 'Java', color: '#e76f00', gradient: 'from-amber-400 to-red-500', icon: '☕', file: 'Main.java', monaco: 'java' },
};

export const LEVEL_NAMES = ['', 'Débutant absolu', 'Fondamentaux', 'Intermédiaire', 'Avancé', 'Expertise et projets'];

export const TYPE_LABEL: Record<string, string> = {
  mcq: 'Question',
  fill: 'Compléter le code',
  order: 'Remettre dans l’ordre',
  predict: 'Prédire le résultat',
  bugfix: 'Trouver l’erreur',
  code: 'Écrire du code',
};

export function formatDuration(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, '0')}`;
}
