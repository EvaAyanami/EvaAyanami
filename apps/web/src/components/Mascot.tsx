/**
 * Kiri — mascotte originale de Codemori.
 * Jeune fille chibi aux cheveux bleus courts, yeux rouge rosé, uniforme
 * scolaire technologique (veste marine, col à liseré cyan, ruban violet) et
 * barrette « </> » cyan, son signe distinctif.
 */
import { motion } from 'framer-motion';
import { useEffect, useId, useState } from 'react';

export type Mood = 'neutral' | 'happy' | 'thinking' | 'coding' | 'sad' | 'celebrate' | 'explain' | 'sleep';

export const MASCOT_NAME = 'Kiri';

interface Props {
  mood?: Mood;
  size?: number;
  className?: string;
  animate?: boolean;
}

export default function Mascot({ mood = 'neutral', size = 160, className, animate = true }: Props) {
  const uid = useId().replace(/:/g, '');
  const [blink, setBlink] = useState(false);
  const eyesOpen = ['neutral', 'thinking', 'coding', 'sad', 'explain'].includes(mood);

  useEffect(() => {
    if (!eyesOpen || !animate) return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 140);
        loop();
      }, 2500 + Math.random() * 3000);
    };
    loop();
    return () => clearTimeout(t);
  }, [eyesOpen, animate]);

  const id = (s: string) => `${s}-${uid}`;
  const tilt = mood === 'sleep' ? 8 : mood === 'thinking' ? -4 : 0;
  const armsUp = mood === 'celebrate';

  return (
    <motion.svg
      viewBox="0 0 200 240"
      width={size}
      height={(size * 240) / 200}
      className={className}
      role="img"
      aria-label={`${MASCOT_NAME} (${mood})`}
      initial={animate ? { scale: 0.9, opacity: 0 } : false}
      animate={animate ? { scale: 1, opacity: 1 } : undefined}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
    >
      <defs>
        <linearGradient id={id('hair')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6d9cff" />
          <stop offset="0.55" stopColor="#4271e6" />
          <stop offset="1" stopColor="#2c4fb8" />
        </linearGradient>
        <linearGradient id={id('hairBack')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3d63cf" />
          <stop offset="1" stopColor="#24408f" />
        </linearGradient>
        <radialGradient id={id('iris')} cx="0.5" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ff8aa0" />
          <stop offset="0.5" stopColor="#e8395e" />
          <stop offset="1" stopColor="#9e1238" />
        </radialGradient>
        <linearGradient id={id('jacket')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2c4596" />
          <stop offset="1" stopColor="#1d2c66" />
        </linearGradient>
        <linearGradient id={id('screen')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>

      {/* Ombre au sol */}
      <ellipse cx="100" cy="232" rx="46" ry="6" fill="#1e2a5a" opacity="0.15" />

      <motion.g
        animate={animate && mood !== 'sleep' ? { y: [0, -4, 0] } : animate ? { y: [0, 2, 0] } : undefined}
        transition={{ duration: mood === 'celebrate' ? 0.8 : 3.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* ---------- Corps ---------- */}
        {/* Jambes */}
        <rect x="80" y="196" width="14" height="26" rx="6" fill="#ffe3d3" />
        <rect x="106" y="196" width="14" height="26" rx="6" fill="#ffe3d3" />
        <path d="M76 216h22v8a4 4 0 0 1-4 4H80a4 4 0 0 1-4-4z" fill="#f1f5ff" stroke="#c7d2f0" />
        <path d="M102 216h22v8a4 4 0 0 1-4 4h-14a4 4 0 0 1-4-4z" fill="#f1f5ff" stroke="#c7d2f0" />
        <rect x="76" y="222" width="22" height="3" rx="1.5" fill="#22d3ee" />
        <rect x="102" y="222" width="22" height="3" rx="1.5" fill="#22d3ee" />
        {/* Jupe plissée */}
        <path d="M70 186 L130 186 L138 206 L62 206 Z" fill="#e8ecf8" stroke="#c4cde6" />
        <path d="M82 188 l-4 18 M100 188 v18 M118 188 l4 18" stroke="#c4cde6" strokeWidth="1.5" />
        {/* Veste */}
        <path d="M66 152 Q100 140 134 152 L138 190 Q100 198 62 190 Z" fill={`url(#${id('jacket')})`} />
        {/* Col et liseré cyan */}
        <path d="M78 148 L100 172 L122 148" fill="#f4f7ff" stroke="#22d3ee" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M100 172 V192" stroke="#22d3ee" strokeWidth="1.5" opacity="0.7" />
        <circle cx="100" cy="180" r="1.8" fill="#9fe9f7" />
        <circle cx="100" cy="187" r="1.8" fill="#9fe9f7" />
        {/* Ruban violet */}
        <path d="M100 160 l-11 -6 v12 z M100 160 l11 -6 v12 z" fill="#8b5cf6" />
        <circle cx="100" cy="160" r="3.5" fill="#a78bfa" />
        {/* Insigne */}
        <rect x="114" y="168" width="12" height="8" rx="2" fill="#22d3ee" opacity="0.85" />

        {/* ---------- Bras ---------- */}
        {armsUp ? (
          <g>
            <path d="M68 158 Q52 140 50 118" stroke={`url(#${id('jacket')})`} strokeWidth="13" strokeLinecap="round" fill="none" />
            <path d="M132 158 Q148 140 150 118" stroke={`url(#${id('jacket')})`} strokeWidth="13" strokeLinecap="round" fill="none" />
            <circle cx="50" cy="113" r="8" fill="#ffe3d3" />
            <circle cx="150" cy="113" r="8" fill="#ffe3d3" />
          </g>
        ) : mood === 'explain' ? (
          <g>
            <path d="M68 158 Q58 174 62 186" stroke={`url(#${id('jacket')})`} strokeWidth="13" strokeLinecap="round" fill="none" />
            <circle cx="63" cy="189" r="7.5" fill="#ffe3d3" />
            <path d="M132 158 Q150 148 158 132" stroke={`url(#${id('jacket')})`} strokeWidth="13" strokeLinecap="round" fill="none" />
            <circle cx="160" cy="128" r="7.5" fill="#ffe3d3" />
            <line x1="162" y1="126" x2="186" y2="96" stroke="#8b5cf6" strokeWidth="3.5" strokeLinecap="round" />
            <circle cx="187" cy="94" r="4" fill="#22d3ee" />
          </g>
        ) : mood === 'thinking' ? (
          <g>
            <path d="M68 158 Q58 174 62 186" stroke={`url(#${id('jacket')})`} strokeWidth="13" strokeLinecap="round" fill="none" />
            <circle cx="63" cy="189" r="7.5" fill="#ffe3d3" />
            <path d="M132 160 Q142 150 128 140" stroke={`url(#${id('jacket')})`} strokeWidth="13" strokeLinecap="round" fill="none" />
            <circle cx="124" cy="138" r="7.5" fill="#ffe3d3" />
          </g>
        ) : mood !== 'coding' ? (
          <g>
            <path d="M68 158 Q56 172 60 188" stroke={`url(#${id('jacket')})`} strokeWidth="13" strokeLinecap="round" fill="none" />
            <path d="M132 158 Q144 172 140 188" stroke={`url(#${id('jacket')})`} strokeWidth="13" strokeLinecap="round" fill="none" />
            <circle cx="61" cy="191" r="7.5" fill="#ffe3d3" />
            <circle cx="139" cy="191" r="7.5" fill="#ffe3d3" />
          </g>
        ) : null}

        {/* ---------- Tête ---------- */}
        <g transform={`rotate(${tilt} 100 140)`}>
          {/* Cheveux arrière (carré court) */}
          <path d="M38 92 Q36 30 100 26 Q164 30 162 92 L164 138 Q150 146 138 140 L62 140 Q50 146 36 138 Z" fill={`url(#${id('hairBack')})`} />
          {/* Cou */}
          <rect x="91" y="132" width="18" height="16" rx="6" fill="#f7d3c2" />
          {/* Visage */}
          <ellipse cx="100" cy="96" rx="52" ry="48" fill="#ffe7d9" />
          {/* Oreilles */}
          <ellipse cx="49" cy="104" rx="6" ry="9" fill="#ffd9c7" />
          <ellipse cx="151" cy="104" rx="6" ry="9" fill="#ffd9c7" />

          {/* Joues */}
          <ellipse cx="68" cy="120" rx="9" ry="5" fill="#ff8fa8" opacity={mood === 'sad' ? 0.25 : 0.45} />
          <ellipse cx="132" cy="120" rx="9" ry="5" fill="#ff8fa8" opacity={mood === 'sad' ? 0.25 : 0.45} />

          {/* Yeux */}
          <Eyes mood={mood} blink={blink} iris={`url(#${id('iris')})`} />

          {/* Sourcils */}
          {mood === 'sad' ? (
            <g stroke="#2c4fb8" strokeWidth="3" strokeLinecap="round">
              <path d="M66 78 Q74 74 84 76" transform="rotate(-10 75 76)" />
              <path d="M116 76 Q126 74 134 78" transform="rotate(10 125 76)" />
            </g>
          ) : mood === 'thinking' ? (
            <g stroke="#2c4fb8" strokeWidth="3" strokeLinecap="round">
              <path d="M66 76 Q75 72 84 76" />
              <path d="M116 73 Q125 68 134 72" />
            </g>
          ) : null}

          {/* Bouche */}
          <Mouth mood={mood} />

          {/* Frange */}
          <path
            d="M44 96 Q40 40 100 34 Q160 40 156 96 Q150 70 140 66 L136 82 Q128 64 118 62 L112 80 Q104 60 94 62 L88 80 Q80 62 70 66 L66 84 Q58 70 50 74 Z"
            fill={`url(#${id('hair')})`}
          />
          {/* Mèches latérales */}
          <path d="M46 84 Q40 116 50 140 Q56 120 56 96 Z" fill={`url(#${id('hair')})`} />
          <path d="M154 84 Q160 116 150 140 Q144 120 144 96 Z" fill={`url(#${id('hair')})`} />
          {/* Reflet */}
          <path d="M66 46 Q100 32 134 46" stroke="#b9d0ff" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.7" />
          {/* Mèche rebelle */}
          <path d="M100 34 Q104 18 116 16 Q106 24 106 36 Z" fill="#4a7af0" />
          {/* Barrette « </> » */}
          <g transform="rotate(-18 142 58)">
            <rect x="128" y="50" width="30" height="15" rx="7.5" fill="#0e1a40" />
            <path d="M136 53.5 l-4 4 4 4 M150 53.5 l4 4 -4 4 M145 52.5 l-3 10" stroke="#22d3ee" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </g>

        {/* ---------- Accessoires par humeur ---------- */}
        {mood === 'coding' && (
          <g>
            <path d="M58 168 L142 168 L150 200 L50 200 Z" fill="#cfd8ee" />
            <rect x="62" y="146" width="76" height="26" rx="4" fill="#0e1a40" transform="skewX(-0)" />
            <rect x="65" y="149" width="70" height="20" rx="2" fill={`url(#${id('screen')})`} opacity="0.9" />
            <text x="100" y="164" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="11" fontWeight="700" fill="#fff">
              {'</>'}
            </text>
            <circle cx="56" cy="186" r="7.5" fill="#ffe3d3" />
            <circle cx="144" cy="186" r="7.5" fill="#ffe3d3" />
          </g>
        )}
        {mood === 'thinking' && (
          <motion.g animate={animate ? { opacity: [0.4, 1, 0.4] } : undefined} transition={{ duration: 2, repeat: Infinity }}>
            <circle cx="164" cy="40" r="4" fill="#a78bfa" />
            <circle cx="174" cy="28" r="6" fill="#a78bfa" />
            <text x="178" y="18" fontSize="22" fontWeight="900" fill="#8b5cf6">?</text>
          </motion.g>
        )}
        {mood === 'sad' && <path d="M156 70 q6 10 0 14 q-6 -4 0 -14z" fill="#7dd3fc" />}
        {mood === 'sleep' && (
          <motion.g animate={animate ? { y: [0, -6, 0], opacity: [0.5, 1, 0.5] } : undefined} transition={{ duration: 3, repeat: Infinity }}>
            <text x="150" y="40" fontSize="18" fontWeight="900" fill="#5f8cfb">Z</text>
            <text x="166" y="24" fontSize="13" fontWeight="900" fill="#8b5cf6">z</text>
            <text x="176" y="12" fontSize="10" fontWeight="900" fill="#22d3ee">z</text>
          </motion.g>
        )}
        {mood === 'celebrate' && (
          <motion.g animate={animate ? { rotate: [0, 8, -8, 0] } : undefined} transition={{ duration: 1.2, repeat: Infinity }} style={{ originX: '100px', originY: '80px' }}>
            {[
              [24, 40, '#22d3ee'], [176, 44, '#8b5cf6'], [30, 90, '#fbbf24'], [172, 96, '#f472b6'], [60, 18, '#5f8cfb'], [140, 14, '#34d399'],
            ].map(([x, y, c], i) => (
              <path key={i} d={`M${x} ${Number(y) - 7} l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z`} fill={String(c)} />
            ))}
          </motion.g>
        )}
        {(mood === 'happy' || mood === 'explain') && (
          <g fill="#fbbf24" opacity="0.9">
            <path d="M30 60 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z" />
            <path d="M170 70 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z" />
          </g>
        )}
      </motion.g>
    </motion.svg>
  );
}

function Eyes({ mood, blink, iris }: { mood: Mood; blink: boolean; iris: string }) {
  if (mood === 'happy' || mood === 'celebrate') {
    return (
      <g stroke="#2a1b3d" strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M66 104 Q77 90 88 104" />
        <path d="M112 104 Q123 90 134 104" />
      </g>
    );
  }
  if (mood === 'sleep') {
    return (
      <g stroke="#2a1b3d" strokeWidth="3.5" strokeLinecap="round" fill="none">
        <path d="M66 102 Q77 110 88 102" />
        <path d="M112 102 Q123 110 134 102" />
      </g>
    );
  }
  const look = mood === 'thinking' ? { x: 3, y: -4 } : mood === 'coding' ? { x: 0, y: 4 } : { x: 0, y: 0 };
  const lid = mood === 'coding' ? 0.78 : 1;
  const eye = (cx: number) => (
    <g>
      <ellipse cx={cx} cy={102} rx="12" ry={14 * lid} fill="#fff" />
      <ellipse cx={cx + look.x} cy={103 + look.y} rx="9.5" ry={12 * lid} fill={iris} />
      <ellipse cx={cx + look.x} cy={105 + look.y} rx="4.5" ry={6 * lid} fill="#4a0a1e" />
      <circle cx={cx + look.x - 3.5} cy={97 + look.y} r="3.6" fill="#fff" />
      <circle cx={cx + look.x + 3.5} cy={109 + look.y} r="1.8" fill="#fff" opacity="0.85" />
      <path d={`M${cx - 13} ${102 - 13 * lid} Q${cx} ${102 - 19 * lid} ${cx + 13} ${102 - 12 * lid}`} stroke="#2a1b3d" strokeWidth="3.2" fill="none" strokeLinecap="round" />
    </g>
  );
  return (
    <motion.g animate={{ scaleY: blink ? 0.08 : 1 }} transition={{ duration: 0.07 }} style={{ originY: '102px', originX: '100px' }}>
      {eye(77)}
      {eye(123)}
    </motion.g>
  );
}

function Mouth({ mood }: { mood: Mood }) {
  switch (mood) {
    case 'happy':
    case 'celebrate':
      return (
        <g>
          <path d="M88 122 Q100 138 112 122 Z" fill="#c2304f" />
          <path d="M93 129 Q100 134 107 129" fill="#ff8fa8" />
        </g>
      );
    case 'explain':
      return <path d="M91 123 Q100 133 109 123 Z" fill="#c2304f" />;
    case 'thinking':
      return <path d="M96 127 Q101 124 106 127" stroke="#7a2a3d" strokeWidth="2.6" fill="none" strokeLinecap="round" />;
    case 'sad':
      return <path d="M92 128 Q96 124 100 127 Q104 130 108 126" stroke="#7a2a3d" strokeWidth="2.6" fill="none" strokeLinecap="round" />;
    case 'sleep':
      return <ellipse cx="100" cy="127" rx="3.5" ry="3" fill="#c2304f" opacity="0.8" />;
    case 'coding':
      return <path d="M94 125 Q100 129 106 125" stroke="#7a2a3d" strokeWidth="2.6" fill="none" strokeLinecap="round" />;
    default:
      return <path d="M93 124 Q100 130 107 124" stroke="#7a2a3d" strokeWidth="2.8" fill="none" strokeLinecap="round" />;
  }
}
