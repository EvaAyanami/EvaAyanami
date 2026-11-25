/**
 * Kiri et l'avatar de l'utilisateur, ensemble : petites scènes animées
 * aux moments clés (bienvenue, réussite, niveau, échec, record…).
 */
import { motion } from 'framer-motion';
import Mascot from './Mascot';
import Avatar, { type AvatarData } from './Avatar';
import { useAuth } from '../lib/auth';

export type Scene = 'wave' | 'highfive' | 'celebrate' | 'comfort' | 'cheer' | 'trophy';

const SPARKS = ['#22d3ee', '#8b5cf6', '#fbbf24', '#f472b6', '#34d399', '#5f8cfb'];

export default function Duo({ scene = 'wave', size = 120, avatar, className }: { scene?: Scene; size?: number; avatar?: Partial<AvatarData> | null; className?: string }) {
  const { user } = useAuth();
  const data = avatar ?? (user as any)?.avatar;
  const kiriMood = scene === 'comfort' ? 'explain' : scene === 'wave' ? 'happy' : scene === 'cheer' ? 'happy' : 'celebrate';
  const meMood = scene === 'comfort' ? 'sad' : scene === 'wave' ? 'neutral' : 'celebrate';
  const mePose = scene === 'wave' ? 'wave' : scene === 'highfive' ? 'highfive' : scene === 'comfort' ? 'down' : 'up';

  // Mouvements : les deux personnages se rapprochent pour le « tape-m'en cinq », sautent ensemble à la fête…
  const kiriAnim =
    scene === 'highfive' ? { x: [0, size * 0.18, size * 0.12], rotate: [0, 6, 0] } : scene === 'celebrate' || scene === 'trophy' ? { y: [0, -size * 0.12, 0] } : scene === 'comfort' ? { x: [0, size * 0.1], rotate: [0, 5] } : { y: [0, -3, 0] };
  const meAnim =
    scene === 'highfive' ? { x: [0, -size * 0.18, -size * 0.12], rotate: [0, -6, 0] } : scene === 'celebrate' || scene === 'trophy' ? { y: [0, -size * 0.12, 0] } : scene === 'comfort' ? { y: [0, 2, 0] } : { y: [0, -3, 0] };
  const loop = scene === 'celebrate' || scene === 'trophy' || scene === 'cheer' || scene === 'wave';

  return (
    <div className={`relative flex items-end justify-center ${className ?? ''}`} style={{ height: size * 1.25 }}>
      <motion.div animate={kiriAnim} transition={{ duration: scene === 'highfive' ? 0.9 : 0.8, repeat: loop ? Infinity : 0, repeatDelay: scene === 'celebrate' ? 0.15 : 0.6, ease: 'easeOut' }}>
        <Mascot mood={kiriMood} size={size} />
      </motion.div>

      {/* Contact du « tape-m'en cinq » ou du réconfort */}
      {(scene === 'highfive' || scene === 'celebrate' || scene === 'trophy') && (
        <div className="pointer-events-none absolute left-1/2 top-[30%] -translate-x-1/2">
          {SPARKS.map((c, i) => (
            <motion.span
              key={i}
              className="absolute block h-2.5 w-2.5 rounded-full"
              style={{ background: c }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
              animate={{ x: Math.cos((i / SPARKS.length) * Math.PI * 2) * size * 0.35, y: Math.sin((i / SPARKS.length) * Math.PI * 2) * size * 0.3, opacity: [0, 1, 0], scale: [0.4, 1.2, 0.6] }}
              transition={{ duration: 1, delay: scene === 'highfive' ? 0.55 : i * 0.05, repeat: scene === 'highfive' ? 0 : Infinity, repeatDelay: 0.6 }}
            />
          ))}
          {scene === 'highfive' && (
            <motion.div className="absolute -left-4 -top-6 text-2xl" initial={{ scale: 0, rotate: -30 }} animate={{ scale: [0, 1.4, 1], rotate: 0 }} transition={{ delay: 0.55, duration: 0.5 }}>
              ✋
            </motion.div>
          )}
          {scene === 'trophy' && (
            <motion.div className="absolute -left-5 -top-12 text-4xl" initial={{ y: 20, opacity: 0 }} animate={{ y: [20, -6, 0], opacity: 1 }} transition={{ duration: 0.8 }}>
              🏆
            </motion.div>
          )}
        </div>
      )}
      {scene === 'comfort' && (
        <motion.div className="absolute left-1/2 top-[10%] -translate-x-1/2 text-xl" animate={{ y: [0, -8, 0], opacity: [0.6, 1, 0.6] }} transition={{ duration: 2, repeat: Infinity }}>
          💜
        </motion.div>
      )}
      {scene === 'cheer' && (
        <motion.div className="absolute left-1/2 top-[8%] -translate-x-1/2 text-xl" animate={{ rotate: [-10, 10, -10] }} transition={{ duration: 0.8, repeat: Infinity }}>
          📣
        </motion.div>
      )}

      <motion.div animate={meAnim} transition={{ duration: scene === 'highfive' ? 0.9 : 0.8, repeat: loop ? Infinity : 0, repeatDelay: scene === 'celebrate' ? 0.15 : 0.6, delay: loop ? 0.12 : 0, ease: 'easeOut' }}>
        <Avatar avatar={data} variant="full" size={size} mood={meMood} pose={mePose} animate flip />
      </motion.div>
    </div>
  );
}
