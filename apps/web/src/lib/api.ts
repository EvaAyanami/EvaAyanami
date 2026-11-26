import { t } from './i18n';
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

export interface LangMeta { name: string; color: string; gradient: string; icon: string; file: string; monaco: string; runtime: 'runner' | 'web' | 'none'; category: 'code' | 'web' | 'graphics' | 'hardware' }

export const LANG_META: Record<string, LangMeta> = {
  rust: { name: 'Rust', color: '#f46623', gradient: 'from-orange-400 to-rose-500', icon: '🦀', file: 'main.rs', monaco: 'rust', runtime: 'runner', category: 'code' },
  cpp: { name: 'C++', color: '#3b82f6', gradient: 'from-sky-400 to-indigo-500', icon: '⚙️', file: 'main.cpp', monaco: 'cpp', runtime: 'runner', category: 'code' },
  java: { name: 'Java', color: '#e76f00', gradient: 'from-amber-400 to-red-500', icon: '☕', file: 'Main.java', monaco: 'java', runtime: 'runner', category: 'code' },
  python: { name: 'Python', color: '#3776ab', gradient: 'from-sky-500 to-yellow-400', icon: '🐍', file: 'main.py', monaco: 'python', runtime: 'runner', category: 'code' },
  web: { name: 'HTML & CSS', color: '#e34f26', gradient: 'from-orange-500 to-blue-500', icon: '🌐', file: 'index.html', monaco: 'html', runtime: 'web', category: 'web' },
  php: { name: 'PHP', color: '#777bb4', gradient: 'from-indigo-400 to-violet-600', icon: '🐘', file: 'main.php', monaco: 'php', runtime: 'runner', category: 'code' },
  opengl: { name: 'OpenGL', color: '#5586a4', gradient: 'from-slate-500 to-cyan-500', icon: '🔺', file: 'shader.glsl', monaco: 'cpp', runtime: 'none', category: 'graphics' },
  vulkan: { name: 'Vulkan', color: '#a41e22', gradient: 'from-red-700 to-rose-500', icon: '🌋', file: 'notes.txt', monaco: 'cpp', runtime: 'none', category: 'graphics' },
  hardware: { name: 'Hardware', color: '#10b981', gradient: 'from-emerald-500 to-teal-600', icon: '🔌', file: 'notes.txt', monaco: 'plaintext', runtime: 'none', category: 'hardware' },
};

/** Métadonnées d'une piste, avec repli pour une piste ajoutée sans mise à jour de l'interface. */
export const langMeta = (id: string): LangMeta => LANG_META[id] ?? { name: id, color: '#64748b', gradient: 'from-slate-400 to-slate-600', icon: '📘', file: 'main.txt', monaco: 'plaintext', runtime: 'none', category: 'code' };

export const CATEGORY_LABEL: Record<string, { title: string; subtitle: string }> = {
  code: { title: 'Langages de programmation', subtitle: 'Du code réellement compilé et exécuté à chaque exercice.' },
  web: { title: 'Web', subtitle: 'HTML et CSS avec aperçu en direct.' },
  graphics: { title: 'Graphismes 3D', subtitle: 'Les notions d’OpenGL et de Vulkan, à part, avec des schémas animés.' },
  hardware: { title: 'Hardware', subtitle: 'Comprendre la machine : du transistor au processeur.' },
};

export const LEVEL_NAMES = ['', 'Débutant absolu', 'Fondamentaux', 'Intermédiaire', 'Avancé', 'Expertise et projets'];
export const levelName = (i: number) => t(LEVEL_NAMES[i] ?? '');

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
