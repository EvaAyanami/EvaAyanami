/**
 * Retours visuels globaux : toasts, célébrations (XP, niveau, succès, défis)
 * et contexte de l'assistante (chapitre / exercice en cours).
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Flame, Star, Trophy, Target, X } from 'lucide-react';
import Duo from '../components/Duo';
import { useAuth } from './auth';

export interface Rewards {
  xp: number;
  totalXp: number;
  level: number;
  levelUp: boolean;
  streak: number;
  streakIncreased: boolean;
  dailyXp: number;
  dailyGoal: number;
  dailyGoalReached: boolean;
  achievements: { id: string; title: string; description: string; icon: string; xp: number }[];
  challenges: { title: string; xpReward: number }[];
  flames?: { friend: string; flame: number; milestone?: { days: number; title: string; xp: number } }[];
}

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error' | 'xp';
}

interface AssistantContext {
  language?: string;
  chapterSlug?: string;
  exerciseId?: string;
  getCode?: () => string | undefined;
  label?: string;
}

interface FeedbackCtx {
  toast: (text: string, kind?: Toast['kind']) => void;
  celebrate: (r: Rewards | undefined, extra?: { title?: string; text?: string }) => void;
  assistant: AssistantContext;
  setAssistant: (c: AssistantContext) => void;
  openAssistant: (prefill?: string) => void;
  assistantRequest: { open: number; prefill?: string };
}

const Ctx = createContext<FeedbackCtx>(null as unknown as FeedbackCtx);

interface Celebration {
  title: string;
  text: string;
  rewards?: Rewards;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [assistant, setAssistant] = useState<AssistantContext>({});
  const [assistantRequest, setAssistantRequest] = useState<{ open: number; prefill?: string }>({ open: 0 });
  const seq = useRef(0);
  const { refresh } = useAuth();

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const celebrate = useCallback(
    (r: Rewards | undefined, extra?: { title?: string; text?: string }) => {
      if (!r && !extra) return;
      if (r?.xp) toast(`+${r.xp} XP`, 'xp');
      if (r?.streakIncreased && r.streak > 1) toast(`🔥 Série de ${r.streak} jours !`, 'success');
      for (const f of r?.flames ?? []) if (!f.milestone) toast(`🔥 Flamme avec ${f.friend} : ${f.flame} jour${f.flame > 1 ? 's' : ''} !`, 'success');
      const flameMilestone = r?.flames?.find((f) => f.milestone);
      const big = extra || flameMilestone || r?.levelUp || (r?.achievements.length ?? 0) > 0 || (r?.challenges.length ?? 0) > 0 || r?.dailyGoalReached;
      if (big) {
        let title = extra?.title ?? '';
        let text = extra?.text ?? '';
        if (!title && flameMilestone) {
          title = `Flamme « ${flameMilestone.milestone!.title} » ! 🔥`;
          text = `${flameMilestone.flame} jours d’apprentissage avec ${flameMilestone.friend}. Vous gagnez tous les deux +${flameMilestone.milestone!.xp} XP !`;
        } else if (!title && r?.levelUp) {
          title = `Niveau ${r.level} atteint !`;
          text = 'Tu progresses à toute vitesse. Kiri est fière de toi !';
        } else if (!title && r?.achievements.length) {
          title = 'Nouveau succès !';
          text = r.achievements.map((a) => a.title).join(', ');
        } else if (!title && r?.challenges.length) {
          title = 'Défi hebdomadaire réussi !';
          text = r.challenges.map((c) => c.title).join(', ');
        } else if (!title && r?.dailyGoalReached) {
          title = 'Objectif du jour atteint !';
          text = `${r.dailyXp} XP aujourd’hui. Reviens demain pour prolonger ta série !`;
        }
        setCelebration({ title, text, rewards: r });
      }
      refresh();
    },
    [toast, refresh],
  );

  const openAssistant = useCallback((prefill?: string) => setAssistantRequest((s) => ({ open: s.open + 1, prefill })), []);

  return (
    <Ctx.Provider value={{ toast, celebrate, assistant, setAssistant, openAssistant, assistantRequest }}>
      {children}
      {/* Toasts */}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ y: -20, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -10, opacity: 0 }}
              className={`pointer-events-auto rounded-2xl px-4 py-2 text-sm font-extrabold shadow-lg ${
                t.kind === 'xp'
                  ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white'
                  : t.kind === 'success'
                    ? 'bg-emerald-500 text-white'
                    : t.kind === 'error'
                      ? 'bg-rose-500 text-white'
                      : 'bg-ink-800 text-white dark:bg-white dark:text-ink-900'
              }`}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {/* Célébration */}
      <AnimatePresence>
        {celebration && (
          <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCelebration(null)}>
            <motion.div
              className="card relative w-full max-w-md text-center"
              initial={{ scale: 0.8, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="btn-ghost btn-sm absolute right-3 top-3" onClick={() => setCelebration(null)} aria-label="Fermer">
                <X size={18} />
              </button>
              <div className="mx-auto -mt-2 w-fit">
                <Duo scene={celebration.rewards?.levelUp || celebration.rewards?.achievements.length ? 'celebrate' : 'highfive'} size={110} />
              </div>
              <h2 className="mt-2 text-2xl text-ink-900 dark:text-white">{celebration.title}</h2>
              <p className="muted mt-1">{celebration.text}</p>
              {celebration.rewards && (
                <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-2xl bg-amber-50 p-2 dark:bg-amber-900/20">
                    <Star className="mx-auto text-amber-500" size={20} />
                    <div className="font-extrabold">+{celebration.rewards.xp} XP</div>
                  </div>
                  <div className="rounded-2xl bg-orange-50 p-2 dark:bg-orange-900/20">
                    <Flame className="mx-auto text-orange-500" size={20} />
                    <div className="font-extrabold">{celebration.rewards.streak} j</div>
                  </div>
                  <div className="rounded-2xl bg-brand-50 p-2 dark:bg-brand-900/30">
                    <Target className="mx-auto text-brand-500" size={20} />
                    <div className="font-extrabold">
                      {celebration.rewards.dailyXp}/{celebration.rewards.dailyGoal}
                    </div>
                  </div>
                </div>
              )}
              {!!celebration.rewards?.achievements.length && (
                <div className="mt-4 space-y-2 text-left">
                  {celebration.rewards.achievements.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 rounded-2xl bg-violet-50 p-3 dark:bg-violet-900/20">
                      <span className="text-2xl">{a.icon}</span>
                      <div>
                        <div className="flex items-center gap-1 font-extrabold">
                          <Trophy size={14} className="text-violet-500" /> {a.title}
                        </div>
                        <div className="muted text-sm">{a.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button className="btn-primary mt-5 w-full" onClick={() => setCelebration(null)}>
                Continuer
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

export const useFeedback = () => useContext(Ctx);
