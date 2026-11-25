/**
 * Avatars des utilisateurs, dans le style graphique de Kiri.
 * Le dessin est fait par l'interface ; le serveur valide les choix et
 * réserve certains éléments aux membres Premium.
 */
import { z } from 'zod';

export const AVATAR_OPTIONS = {
  gender: ['codeuse', 'codeur', 'neutre'],
  skin: ['porcelaine', 'clair', 'peche', 'dore', 'cannelle', 'cacao'],
  hairStyle: ['court', 'carre', 'long', 'queue', 'couettes', 'herisse', 'boucle', 'chignon', 'rase'],
  hairColor: ['bleu', 'noir', 'brun', 'chatain', 'blond', 'roux', 'rose', 'violet', 'vert', 'blanc', 'arcenciel', 'or'],
  eyes: ['rond', 'amande', 'rieur', 'determine'],
  eyeColor: ['rubis', 'saphir', 'emeraude', 'ambre', 'noisette', 'violet', 'gris', 'or'],
  mouth: ['sourire', 'grand', 'chat', 'neutre', 'langue'],
  outfit: ['uniforme', 'sweat', 'tshirt', 'chemise', 'kimono', 'cape', 'armure'],
  outfitColor: ['marine', 'rouge', 'vert', 'violet', 'noir', 'blanc', 'orange', 'rose'],
  accessory: ['aucun', 'barrette', 'lunettes', 'casque', 'noeud', 'bandeau', 'etoile', 'couronne', 'aureole', 'chat', 'cornes'],
  background: ['ciel', 'menthe', 'lavande', 'peche', 'nuit', 'code', 'galaxie', 'dore', 'aurore'],
} as const;

/** Éléments réservés aux membres Premium. */
export const PREMIUM_ITEMS: Partial<Record<keyof typeof AVATAR_OPTIONS, string[]>> = {
  hairColor: ['arcenciel', 'or'],
  eyeColor: ['or'],
  outfit: ['kimono', 'cape', 'armure'],
  accessory: ['couronne', 'aureole', 'chat', 'cornes'],
  background: ['galaxie', 'dore', 'aurore'],
};

export const DEFAULT_AVATAR = {
  gender: 'neutre', skin: 'clair', hairStyle: 'court', hairColor: 'brun', eyes: 'rond', eyeColor: 'noisette', mouth: 'sourire',
  outfit: 'uniforme', outfitColor: 'marine', accessory: 'barrette', background: 'ciel', blush: true,
};
export type Avatar = typeof DEFAULT_AVATAR;

const e = <K extends keyof typeof AVATAR_OPTIONS>(k: K) => z.enum(AVATAR_OPTIONS[k] as unknown as [string, ...string[]]);
export const avatarSchema = z.object({
  gender: e('gender'), skin: e('skin'), hairStyle: e('hairStyle'), hairColor: e('hairColor'), eyes: e('eyes'), eyeColor: e('eyeColor'),
  mouth: e('mouth'), outfit: e('outfit'), outfitColor: e('outfitColor'), accessory: e('accessory'), background: e('background'),
  blush: z.boolean(),
});

export function premiumItemsUsed(a: Avatar) {
  return (Object.entries(PREMIUM_ITEMS) as [keyof Avatar, string[]][]).filter(([k, list]) => list.includes(String(a[k]))).map(([k]) => k);
}

/** Avatar affiché : les éléments Premium sont remplacés par défaut si l'abonnement a expiré. */
export function effectiveAvatar(raw: unknown, premium: boolean): Avatar {
  const parsed = avatarSchema.safeParse({ ...DEFAULT_AVATAR, ...((raw as object) ?? {}) });
  const a = parsed.success ? (parsed.data as Avatar) : { ...DEFAULT_AVATAR };
  if (!premium) for (const k of premiumItemsUsed(a)) (a as any)[k] = (DEFAULT_AVATAR as any)[k];
  return a;
}
