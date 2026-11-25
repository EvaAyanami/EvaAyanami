/** Pistes d'apprentissage (langages et notions) chargées depuis la base, avec cache court. */
import type { Language } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest } from './http.js';

let cache: { at: number; list: Language[] } | null = null;

export async function languages(): Promise<Language[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.list;
  const list = await prisma.language.findMany({ where: { enabled: true }, orderBy: { order: 'asc' } });
  cache = { at: Date.now(), list };
  return list;
}
export const clearLanguageCache = () => {
  cache = null;
};

export async function languageIds() {
  return (await languages()).map((l) => l.id);
}

/** Langages dont le code est réellement exécuté dans le bac à sable. */
export async function runnableIds() {
  return (await languages()).filter((l) => l.runtime === 'runner').map((l) => l.id);
}

export async function requireRunnable(id: string) {
  if (!(await runnableIds()).includes(id)) throw badRequest('Ce langage ne s’exécute pas dans le bac à sable');
}

/** Langages disposant d'un test de positionnement. */
export const PLACEMENT_LANGS = ['rust', 'cpp', 'java'];
