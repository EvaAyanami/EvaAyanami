/**
 * Répétition espacée (algorithme SM-2 simplifié).
 * quality : 0..5 (5 = réponse parfaite, < 3 = échec)
 */
export interface SrsState {
  ease: number;
  interval: number; // jours
  repetitions: number;
  lapses: number;
}

export function sm2(state: SrsState, quality: number): SrsState & { nextInDays: number } {
  let { ease, interval, repetitions, lapses } = state;
  if (quality < 3) {
    repetitions = 0;
    interval = 1;
    lapses += 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 3;
    else interval = Math.round(interval * ease);
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  interval = Math.min(interval, 180);
  return { ease: Math.round(ease * 100) / 100, interval, repetitions, lapses, nextInDays: interval };
}

export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);
