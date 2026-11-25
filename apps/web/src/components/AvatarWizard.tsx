/**
 * Assistant de création d'avatar, étape par étape (façon « Mii ») :
 * genre, peau, coiffure, couleurs, yeux, tenue, accessoire, fond.
 * Chaque étape a son bouton « J'ai de la chance » ; « Le hasard choisira pour moi » tire tout.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Clover, Dices, Lock, Crown, Check } from 'lucide-react';
import Avatar, { SKIN, HAIR, IRIS, OUTFIT, BACKGROUND, type AvatarData } from './Avatar';
import Mascot from './Mascot';
import { useI18n } from '../lib/i18n';

type Key = keyof Omit<AvatarData, 'blush'>;

export const AVATAR_NAMES: Record<string, string> = {
  codeuse: 'Codeuse', codeur: 'Codeur', neutre: 'Non spécifié',
  porcelaine: 'Porcelaine', clair: 'Clair', peche: 'Pêche', dore: 'Doré', cannelle: 'Cannelle', cacao: 'Cacao',
  court: 'Court', carre: 'Carré', long: 'Long', queue: 'Queue', couettes: 'Couettes', herisse: 'Hérissé', boucle: 'Bouclé', chignon: 'Chignon', rase: 'Ras',
  bleu: 'Bleu', noir: 'Noir', brun: 'Brun', chatain: 'Châtain', blond: 'Blond', roux: 'Roux', rose: 'Rose', violet: 'Violet', vert: 'Vert', blanc: 'Blanc', arcenciel: 'Arc-en-ciel', or: 'Or',
  rond: 'Ronds', amande: 'Amande', rieur: 'Rieurs', determine: 'Déterminés',
  rubis: 'Rubis', saphir: 'Saphir', emeraude: 'Émeraude', ambre: 'Ambre', noisette: 'Noisette', gris: 'Gris',
  sourire: 'Sourire', grand: 'Grand sourire', neutre_m: 'Neutre', langue: 'Taquin',
  uniforme: 'Uniforme', sweat: 'Sweat', tshirt: 'T-shirt', chemise: 'Chemise', kimono: 'Kimono', cape: 'Cape royale', armure: 'Armure',
  marine: 'Marine', rouge: 'Rouge', orange: 'Orange',
  aucun: 'Aucun', barrette: 'Barrette </>', lunettes: 'Lunettes', casque: 'Casque', noeud: 'Nœud', bandeau: 'Bandeau', etoile: 'Étoile', couronne: 'Couronne', aureole: 'Auréole', cornes: 'Cornes',
  ciel: 'Ciel', menthe: 'Menthe', lavande: 'Lavande', nuit: 'Nuit', code: 'Code', galaxie: 'Galaxie', aurore: 'Aurore',
};
export function avatarLabel(k: Key, v: string) {
  if (k === 'accessory' && v === 'chat') return 'Oreilles de chat';
  if (k === 'mouth' && v === 'chat') return 'Chat';
  if (k === 'mouth' && v === 'neutre') return 'Neutre';
  return AVATAR_NAMES[v] ?? v;
}

export function swatch(k: Key, v: string): string | null {
  if (k === 'skin') return SKIN[v]?.[0] ?? null;
  if (k === 'hairColor') return v === 'arcenciel' ? 'linear-gradient(135deg,#ff7eb6,#ffd166,#5eead4,#60a5fa,#a78bfa)' : HAIR[v]?.[0] ?? null;
  if (k === 'eyeColor') return IRIS[v]?.[1] ?? null;
  if (k === 'outfitColor') return OUTFIT[v]?.[0] ?? null;
  if (k === 'background') return `linear-gradient(135deg,${(BACKGROUND[v] ?? []).join(',')})`;
  return null;
}

const STEPS: { keys: Key[]; title: string; kiri: string }[] = [
  { keys: ['gender'], title: 'Qui es-tu ?', kiri: 'Bonjour ! Créons ton personnage. D’abord : es-tu une codeuse, un codeur, ou préfères-tu ne pas le préciser ?' },
  { keys: ['skin'], title: 'Couleur de peau', kiri: 'Choisis la couleur de peau de ton avatar.' },
  { keys: ['hairStyle'], title: 'Coiffure', kiri: 'Toutes les coiffures vont à tout le monde : choisis celle qui te plaît !' },
  { keys: ['hairColor'], title: 'Couleur des cheveux', kiri: 'Et la couleur de tes cheveux ? Les miens sont bleus 💙' },
  { keys: ['eyes', 'eyeColor'], title: 'Les yeux', kiri: 'La forme des yeux, puis la couleur de l’iris.' },
  { keys: ['mouth'], title: 'Le sourire', kiri: 'Quelle expression pour ton avatar ?' },
  { keys: ['outfit', 'outfitColor'], title: 'La tenue', kiri: 'Une tenue de codeur·euse, et sa couleur.' },
  { keys: ['accessory', 'background'], title: 'Les finitions', kiri: 'Un accessoire et un fond, et c’est terminé !' },
];

interface Props {
  initial: AvatarData;
  options: Record<Key, string[]>;
  premium: Partial<Record<Key, string[]>>;
  canPremium: boolean;
  onDone: (a: AvatarData) => void;
  onCancel?: () => void;
}

export default function AvatarWizard({ initial, options, premium, canPremium, onDone, onCancel }: Props) {
  const { t } = useI18n();
  const [a, setA] = useState<AvatarData>(initial);
  const [step, setStep] = useState(0);
  const [spin, setSpin] = useState(0);
  const isPremium = (k: Key, v: string) => !!premium[k]?.includes(v);
  const pick = (k: Key) => {
    const list = options[k].filter((v) => canPremium || !isPremium(k, v));
    return list[Math.floor(Math.random() * list.length)];
  };
  const lucky = (keys: Key[]) => {
    const next = { ...a };
    for (const k of keys) (next as any)[k] = pick(k);
    setA(next);
    setSpin((x) => x + 1);
  };
  const luckyAll = () => {
    const next = { ...a };
    for (const s of STEPS) for (const k of s.keys) (next as any)[k] = pick(k);
    next.blush = Math.random() > 0.3;
    setA(next);
    setSpin((x) => x + 1);
    setStep(STEPS.length);
  };
  const s = STEPS[step];
  const done = step >= STEPS.length;

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <div className="card flex flex-col items-center lg:sticky lg:top-20 lg:self-start">
        <motion.div key={spin} initial={{ rotateY: 180, scale: 0.8 }} animate={{ rotateY: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 14 }}>
          <Avatar avatar={a} variant="full" size={190} mood={done ? 'celebrate' : 'happy'} pose={done ? 'up' : 'wave'} animate />
        </motion.div>
        <div className="mt-2 flex w-full gap-1">
          {STEPS.map((_, i) => (
            <motion.div key={i} className="h-1.5 flex-1 rounded-full" animate={{ backgroundColor: i < step ? '#3b6cf6' : i === step ? '#93b5ff' : '#e2e8f0' }} />
          ))}
        </div>
        <button className="btn-outline mt-4 w-full" onClick={luckyAll}>
          <Dices size={16} /> {t('Le hasard choisira pour moi')}
        </button>
        {onCancel && (
          <button className="btn-ghost btn-sm mt-2" onClick={onCancel}>
            {t('Éditeur complet')}
          </button>
        )}
      </div>

      <div className="card min-w-0">
        <AnimatePresence mode="wait">
          {done ? (
            <motion.div key="done" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="flex flex-col items-center py-6 text-center">
              <Mascot mood="celebrate" size={130} />
              <h2 className="mt-2 text-2xl font-black">{t('Ton avatar est prêt !')}</h2>
              <p className="muted">{t('Il apparaîtra sur ton profil, dans la communauté et à côté de Kiri.')}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button className="btn-ghost" onClick={() => setStep(0)}><ChevronLeft size={16} /> {t('Recommencer')}</button>
                <button className="btn-outline" onClick={luckyAll}><Clover size={16} /> {t('Un autre au hasard')}</button>
                <button className="btn-primary" onClick={() => onDone(a)}><Check size={16} /> {t('C’est moi !')}</button>
              </div>
            </motion.div>
          ) : (
            <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <div className="mb-4 flex items-start gap-3">
                <Mascot mood="explain" size={70} />
                <div className="flex-1">
                  <div className="muted text-xs font-black uppercase">{t('Étape {n} sur {total}', { n: step + 1, total: STEPS.length })}</div>
                  <h2 className="text-xl font-black">{t(s.title)}</h2>
                  <p className="muted text-sm">{t(s.kiri)}</p>
                </div>
                <motion.button whileTap={{ rotate: 360 }} className="btn-outline btn-sm shrink-0" onClick={() => lucky(s.keys)}>
                  <Clover size={16} className="text-emerald-500" /> {t('J’ai de la chance')}
                </motion.button>
              </div>

              {s.keys.map((k) => (
                <div key={k} className="mb-4">
                  {s.keys.length > 1 && <div className="label">{t({ eyes: 'Forme', eyeColor: 'Couleur de l’iris', outfit: 'Tenue', outfitColor: 'Couleur', accessory: 'Accessoire', background: 'Fond' }[k as string] ?? k)}</div>}
                  <div className={clsx('grid gap-3', k === 'gender' ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-4 xl:grid-cols-6')}>
                    {options[k].map((v, i) => {
                      const locked = isPremium(k, v) && !canPremium;
                      const sel = a[k] === v;
                      const sw = swatch(k, v);
                      return (
                        <motion.button
                          key={v}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.025 }}
                          whileHover={{ y: -3 }}
                          whileTap={{ scale: 0.95 }}
                          disabled={locked}
                          onClick={() => setA({ ...a, [k]: v })}
                          className={clsx(
                            'relative flex flex-col items-center gap-1 rounded-3xl border-2 p-2 transition',
                            sel ? 'border-brand-400 bg-brand-50 shadow-glow dark:bg-brand-900/30' : 'border-ink-100 hover:border-ink-300 dark:border-ink-800',
                            locked && 'cursor-not-allowed opacity-60',
                          )}
                        >
                          {k === 'gender' ? (
                            <Avatar avatar={{ ...a, gender: v }} variant="full" size={78} />
                          ) : sw && k !== 'background' && k !== 'skin' ? (
                            <span className="h-12 w-12 rounded-full border-4 border-white shadow-inner dark:border-ink-700" style={{ background: sw }} />
                          ) : (
                            <Avatar avatar={{ ...a, [k]: v }} size={60} />
                          )}
                          <span className="text-center text-[11px] font-bold leading-tight">{t(avatarLabel(k, v))}</span>
                          {isPremium(k, v) && (
                            <span className="absolute right-1 top-1 rounded-full bg-gradient-to-r from-amber-300 to-yellow-200 p-1 text-amber-900 shadow">
                              {locked ? <Lock size={10} /> : <Crown size={10} />}
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="mt-2 flex justify-between">
                <button className="btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}><ChevronLeft size={16} /> {t('Retour')}</button>
                <button className="btn-primary" onClick={() => setStep(step + 1)}>{step === STEPS.length - 1 ? t('Terminer') : t('Suivant')} <ChevronRight size={16} /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
