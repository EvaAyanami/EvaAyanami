import { prisma } from '../db.js';
import type { GlossaryEntry } from './content.js';

let cache: { at: number; list: GlossaryEntry[] } | null = null;

export async function getGlossary(): Promise<GlossaryEntry[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.list;
  const row = await prisma.setting.findUnique({ where: { key: 'glossary' } });
  const list = ((row?.value as unknown as GlossaryEntry[]) ?? []).filter(Boolean);
  cache = { at: Date.now(), list };
  return list;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Trouve la notion du glossaire correspondant à des concepts ou à un texte libre. */
export async function findGlossary(text: string): Promise<GlossaryEntry[]> {
  const list = await getGlossary();
  const t = norm(text);
  const scored = list
    .map((g) => {
      let score = 0;
      if (t.includes(norm(g.concept))) score += 3;
      for (const k of g.keywords ?? []) if (t.includes(norm(k))) score += 2;
      if (t.includes(norm(g.title))) score += 3;
      return { g, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((x) => x.g);
}

export async function glossaryFor(concepts: string[], language: string) {
  const list = await getGlossary();
  for (const c of concepts) {
    const g = list.find((x) => norm(x.concept) === norm(c) || (x.keywords ?? []).some((k) => norm(k) === norm(c)));
    if (g) return { ...g, langText: (g as any)[language] as string | undefined };
  }
  return null;
}
