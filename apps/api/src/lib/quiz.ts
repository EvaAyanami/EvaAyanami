/** Banque de questions du mini-jeu « Blind test » (content/quiz.yaml). */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { config } from '../config.js';

const question = z.object({
  id: z.string(),
  theme: z.enum(['code', 'hardware', 'blind']),
  q: z.string(),
  code: z.string().optional(),
  choices: z.array(z.coerce.string()).min(2).max(6),
  answer: z.number().int(),
  explain: z.string().default(''),
});
export type QuizQuestion = z.infer<typeof question>;

let bank: QuizQuestion[] | null = null;

export async function quizBank(): Promise<QuizQuestion[]> {
  if (bank) return bank;
  const raw = YAML.parse(await readFile(join(config.contentDir, 'quiz.yaml'), 'utf8'));
  const list = z.array(question).parse(raw);
  for (const q of list) if (q.answer < 0 || q.answer >= q.choices.length) throw new Error(`quiz.yaml : réponse hors limites pour ${q.id}`);
  if (new Set(list.map((q) => q.id)).size !== list.length) throw new Error('quiz.yaml : identifiants dupliqués');
  bank = list;
  return list;
}

export const QUESTIONS_PER_DUEL = 10;
export const SECONDS_PER_QUESTION = 15;

/** Score d'une réponse : 100 points si juste, + bonus de rapidité (jusqu'à 50). */
export function answerScore(correct: boolean, ms: number) {
  if (!correct) return 0;
  const limit = SECONDS_PER_QUESTION * 1000;
  return 100 + Math.round(50 * Math.max(0, 1 - Math.min(ms, limit) / limit));
}

export function pickQuestions(list: QuizQuestion[], theme: string, n = QUESTIONS_PER_DUEL) {
  const pool = theme === 'mix' ? list : list.filter((q) => q.theme === theme);
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/** Les choix sont mélangés (ordre stable par duel) pour que la position ne trahisse pas la réponse. */
export function shuffledChoices(q: QuizQuestion, seed: string) {
  const idx = q.choices.map((_, i) => i);
  let h = 2166136261;
  for (const c of seed + q.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  for (let i = idx.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    const j = Math.abs(h) % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}
