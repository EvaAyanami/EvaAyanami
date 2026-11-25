/**
 * Avatar des utilisateurs, dessiné dans le style de Kiri (chibi, grands yeux,
 * uniforme techno). Sert de photo de profil (buste) et de personnage animé
 * aux côtés de Kiri (corps entier).
 */
import { motion } from 'framer-motion';
import { useId } from 'react';

export interface AvatarData {
  gender: string;
  skin: string;
  hairStyle: string;
  hairColor: string;
  eyes: string;
  eyeColor: string;
  mouth: string;
  outfit: string;
  outfitColor: string;
  accessory: string;
  background: string;
  blush: boolean;
}

export const DEFAULT_AVATAR: AvatarData = {
  gender: 'neutre', skin: 'clair', hairStyle: 'court', hairColor: 'brun', eyes: 'rond', eyeColor: 'noisette', mouth: 'sourire',
  outfit: 'uniforme', outfitColor: 'marine', accessory: 'barrette', background: 'ciel', blush: true,
};

export type AvatarMood = 'neutral' | 'happy' | 'sad' | 'surprised' | 'celebrate';
export type AvatarPose = 'idle' | 'wave' | 'up' | 'highfive' | 'down';

export const SKIN: Record<string, [string, string]> = {
  porcelaine: ['#fff1ea', '#ffe0d2'], clair: ['#ffe7d9', '#ffd9c7'], peche: ['#ffd7bd', '#f5c2a2'],
  dore: ['#f1c08f', '#e0a872'], cannelle: ['#c98a5e', '#b07549'], cacao: ['#8d5a3b', '#76482e'],
};
export const HAIR: Record<string, [string, string]> = {
  bleu: ['#6d9cff', '#2c4fb8'], noir: ['#555b72', '#1b1e2b'], brun: ['#9a6644', '#4e2f1f'], chatain: ['#c4915d', '#7a5130'],
  blond: ['#ffe38f', '#d9a93c'], roux: ['#ff9a5a', '#c2501f'], rose: ['#ffb8d4', '#e0609a'], violet: ['#c9a8ff', '#7c4ddb'],
  vert: ['#86e6b8', '#2f9e6e'], blanc: ['#ffffff', '#c2cbe0'], arcenciel: ['#ff7eb6', '#7c4ddb'], or: ['#ffe27a', '#d99a00'],
};
export const IRIS: Record<string, [string, string, string]> = {
  rubis: ['#ff8aa0', '#e8395e', '#9e1238'], saphir: ['#9cc3ff', '#3b6cf6', '#1d3a9e'], emeraude: ['#8ff0c0', '#22a06b', '#0e5c3b'],
  ambre: ['#ffd27a', '#e59a1a', '#8a5200'], noisette: ['#d8b088', '#9a6a3c', '#553415'], violet: ['#d8c2ff', '#8b5cf6', '#4c1d95'],
  gris: ['#e2e8f0', '#8794ad', '#3f4a61'], or: ['#fff4b8', '#f5b800', '#9a6a00'],
};
export const OUTFIT: Record<string, [string, string]> = {
  marine: ['#2c4596', '#1d2c66'], rouge: ['#e2465b', '#a3243a'], vert: ['#2f9e6e', '#1d6b49'], violet: ['#8b5cf6', '#5b34c4'],
  noir: ['#3a3f52', '#1c1f2b'], blanc: ['#f4f6fb', '#c9d0e2'], orange: ['#ff9a3c', '#d4691a'], rose: ['#ff8fbf', '#d9568f'],
};
export const BACKGROUND: Record<string, string[]> = {
  ciel: ['#dbeafe', '#bfdbfe'], menthe: ['#d1fae5', '#a7f3d0'], lavande: ['#ede9fe', '#d8cffd'], peche: ['#ffedd5', '#fed7aa'],
  nuit: ['#26324d', '#0f172a'], code: ['#15245a', '#0b1330'], galaxie: ['#312e81', '#7c3aed', '#0b0e18'], dore: ['#fff3c4', '#fbbf24'], aurore: ['#22d3ee', '#a78bfa', '#f472b6'],
};

interface Props {
  avatar?: Partial<AvatarData> | null;
  size?: number;
  /** « portrait » : buste dans un cercle (photo de profil) ; « full » : personnage entier. */
  variant?: 'portrait' | 'full';
  mood?: AvatarMood;
  pose?: AvatarPose;
  animate?: boolean;
  className?: string;
  ring?: 'premium' | 'none';
  /** Retourne le personnage (pour faire face à Kiri). */
  flip?: boolean;
}

export default function Avatar({ avatar, size = 48, variant = 'portrait', mood = 'neutral', pose = 'idle', animate = false, className, ring = 'none', flip }: Props) {
  const a = { ...DEFAULT_AVATAR, ...(avatar ?? {}) };
  const uid = useId().replace(/:/g, '');
  const id = (s: string) => `${s}-${uid}`;
  const [skin, skinShade] = SKIN[a.skin] ?? SKIN.clair;
  const [hairLight, hairDark] = HAIR[a.hairColor] ?? HAIR.brun;
  const [o1, o2] = OUTFIT[a.outfitColor] ?? OUTFIT.marine;
  const bg = BACKGROUND[a.background] ?? BACKGROUND.ciel;
  const portrait = variant === 'portrait';
  const hairFill = `url(#${id('hair')})`;

  const svg = (
    <svg
      viewBox={portrait ? '22 18 156 156' : '0 0 200 240'}
      width={size}
      height={portrait ? size : (size * 240) / 200}
      className={portrait ? undefined : className}
      role="img"
      aria-label="Avatar"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <defs>
        <linearGradient id={id('hair')} x1="0" y1="0" x2={a.hairColor === 'arcenciel' ? '1' : '0'} y2="1">
          {a.hairColor === 'arcenciel' ? (
            <>
              <stop offset="0" stopColor="#ff7eb6" />
              <stop offset="0.25" stopColor="#ffd166" />
              <stop offset="0.5" stopColor="#5eead4" />
              <stop offset="0.75" stopColor="#60a5fa" />
              <stop offset="1" stopColor="#a78bfa" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor={hairLight} />
              <stop offset="1" stopColor={hairDark} />
            </>
          )}
        </linearGradient>
        <linearGradient id={id('outfit')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={o1} />
          <stop offset="1" stopColor={o2} />
        </linearGradient>
        <radialGradient id={id('iris')} cx="0.5" cy="0.35" r="0.7">
          {(IRIS[a.eyeColor] ?? IRIS.noisette).map((c, i) => (
            <stop key={i} offset={[0, 0.5, 1][i]} stopColor={c} />
          ))}
        </radialGradient>
        <linearGradient id={id('bg')} x1="0" y1="0" x2="1" y2="1">
          {bg.map((c, i) => (
            <stop key={i} offset={i / Math.max(1, bg.length - 1)} stopColor={c} />
          ))}
        </linearGradient>
        <clipPath id={id('clip')}>
          <circle cx="100" cy="96" r="78" />
        </clipPath>
      </defs>

      {portrait && (
        <>
          <circle cx="100" cy="96" r="78" fill={`url(#${id('bg')})`} />
          <Backdrop kind={a.background} />
        </>
      )}

      <g clipPath={portrait ? `url(#${id('clip')})` : undefined}>
        {!portrait && <ellipse cx="100" cy="232" rx="44" ry="6" fill="#1e2a5a" opacity="0.15" />}
        <motion.g
          animate={animate ? (mood === 'celebrate' ? { y: [0, -10, 0] } : mood === 'sad' ? { y: [0, 1.5, 0] } : { y: [0, -3, 0] }) : undefined}
          transition={{ duration: mood === 'celebrate' ? 0.7 : 3.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* Cheveux arrière (longs, carré, couettes…) */}
          <BackHair style={a.hairStyle} fill={hairFill} />
          {a.outfit === 'cape' && <path d="M58 150 Q100 136 142 150 L156 226 Q100 236 44 226 Z" fill="#7f1d1d" />}

          {/* Corps */}
          {!portrait && (
            <>
              <rect x="80" y="196" width="14" height="26" rx="6" fill={skin} />
              <rect x="106" y="196" width="14" height="26" rx="6" fill={skin} />
              <path d="M76 216h22v8a4 4 0 0 1-4 4H80a4 4 0 0 1-4-4z" fill="#f1f5ff" stroke="#c7d2f0" />
              <path d="M102 216h22v8a4 4 0 0 1-4 4h-14a4 4 0 0 1-4-4z" fill="#f1f5ff" stroke="#c7d2f0" />
              {a.gender === 'codeuse' ? (
                <path d="M70 186 L130 186 L138 206 L62 206 Z" fill={o2} />
              ) : a.gender === 'codeur' ? (
                <g fill={o2}>
                  <path d="M72 186 H128 V206 H104 L100 194 L96 206 H72 Z" />
                </g>
              ) : (
                <path d="M71 186 H129 L132 202 H68 Z" fill={o2} />
              )}
            </>
          )}
          <path d="M66 152 Q100 140 134 152 L138 190 Q100 198 62 190 Z" fill={`url(#${id('outfit')})`} />
          <Outfit kind={a.outfit} c1={o1} c2={o2} />

          {/* Bras */}
          <Arms pose={portrait ? 'idle' : pose} fill={`url(#${id('outfit')})`} skin={skin} armor={a.outfit === 'armure'} />

          {/* Tête */}
          <g>
            <rect x="91" y="132" width="18" height="16" rx="6" fill={skinShade} />
            <ellipse cx="100" cy="96" rx="52" ry="48" fill={skin} />
            <ellipse cx="49" cy="104" rx="6" ry="9" fill={skinShade} />
            <ellipse cx="151" cy="104" rx="6" ry="9" fill={skinShade} />
            {a.blush && (
              <>
                <ellipse cx="68" cy="120" rx="9" ry="5" fill="#ff8fa8" opacity="0.45" />
                <ellipse cx="132" cy="120" rx="9" ry="5" fill="#ff8fa8" opacity="0.45" />
              </>
            )}
            <Eyes shape={a.eyes} mood={mood} iris={`url(#${id('iris')})`} lashes={a.gender === 'codeuse'} />
            {mood === 'sad' && (
              <g stroke={hairDark} strokeWidth="3" strokeLinecap="round">
                <path d="M66 78 Q74 74 84 76" transform="rotate(-10 75 76)" />
                <path d="M116 76 Q126 74 134 78" transform="rotate(10 125 76)" />
              </g>
            )}
            {a.eyes === 'determine' && mood === 'neutral' && (
              <g stroke={hairDark} strokeWidth="3.4" strokeLinecap="round">
                <path d="M65 76 L86 80" />
                <path d="M135 76 L114 80" />
              </g>
            )}
            <Mouth kind={a.mouth} mood={mood} />
            <FrontHair style={a.hairStyle} fill={hairFill} dark={hairDark} />
            <Accessory kind={a.accessory} />
          </g>
        </motion.g>
      </g>
      {portrait && <circle cx="100" cy="96" r="77" fill="none" stroke="white" strokeOpacity="0.5" strokeWidth="2" />}
    </svg>
  );

  if (!portrait) return svg;
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full ${ring === 'premium' ? 'premium-ring p-[3px]' : ''} ${className ?? ''}`}
      style={{ width: size + (ring === 'premium' ? 6 : 0), height: size + (ring === 'premium' ? 6 : 0) }}
    >
      {svg}
    </span>
  );
}

function Backdrop({ kind }: { kind: string }) {
  if (kind === 'code')
    return (
      <g fill="#22d3ee" opacity="0.25" fontFamily="JetBrains Mono, monospace" fontSize="12" fontWeight="700">
        <text x="34" y="52">{'</>'}</text>
        <text x="140" y="70">{'{ }'}</text>
        <text x="40" y="150">fn</text>
        <text x="146" y="150">;</text>
      </g>
    );
  if (kind === 'galaxie' || kind === 'nuit')
    return (
      <g fill="#fff">
        {[[40, 50, 1.6], [150, 40, 1.2], [60, 140, 1], [160, 120, 1.8], [120, 30, 1], [36, 100, 1.2]].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} opacity="0.85" />
        ))}
      </g>
    );
  if (kind === 'dore' || kind === 'aurore')
    return (
      <g fill="#fff" opacity="0.8">
        <path d="M40 50 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
        <path d="M156 60 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z" />
      </g>
    );
  return null;
}

function BackHair({ style, fill }: { style: string; fill: string }) {
  switch (style) {
    case 'long':
      return <path d="M46 84 Q34 150 52 196 L148 196 Q166 150 154 84 Q100 70 46 84Z" fill={fill} />;
    case 'carre':
      return <path d="M44 86 Q38 130 52 146 L148 146 Q162 130 156 86 Q100 70 44 86Z" fill={fill} />;
    case 'queue':
      return <path d="M146 70 Q190 90 172 160 Q168 120 150 104 Z" fill={fill} />;
    case 'couettes':
      return (
        <g fill={fill}>
          <path d="M50 92 Q14 110 26 170 Q36 130 56 118 Z" />
          <path d="M150 92 Q186 110 174 170 Q164 130 144 118 Z" />
        </g>
      );
    case 'boucle':
      return (
        <g fill={fill}>
          {[[46, 96], [42, 118], [50, 138], [154, 96], [158, 118], [150, 138]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="12" />
          ))}
        </g>
      );
    default:
      return null;
  }
}

function FrontHair({ style, fill, dark }: { style: string; fill: string; dark: string }) {
  const bangs = 'M44 96 Q40 40 100 34 Q160 40 156 96 Q150 70 140 66 L136 82 Q128 64 118 62 L112 80 Q104 60 94 62 L88 80 Q80 62 70 66 L66 84 Q58 70 50 74 Z';
  const sides = (
    <>
      <path d="M46 84 Q40 116 50 140 Q56 120 56 96 Z" fill={fill} />
      <path d="M154 84 Q160 116 150 140 Q144 120 144 96 Z" fill={fill} />
    </>
  );
  const shine = <path d="M66 46 Q100 32 134 46" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.35" />;
  switch (style) {
    case 'rase':
      return <path d="M50 84 Q48 44 100 40 Q152 44 150 84 Q140 62 100 58 Q60 62 50 84Z" fill={fill} opacity="0.92" />;
    case 'herisse':
      return (
        <g>
          <path d="M44 92 L40 54 L58 62 L60 30 L80 50 L96 18 L108 46 L128 22 L132 52 L156 40 L150 66 L160 90 Q146 70 132 72 L124 60 L112 74 L100 58 L88 74 L76 60 L66 76 Q54 70 44 92Z" fill={fill} />
          {shine}
        </g>
      );
    case 'boucle':
      return (
        <g fill={fill}>
          {[[58, 60], [78, 46], [100, 40], [122, 46], [142, 60], [52, 80], [148, 80]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="17" />
          ))}
        </g>
      );
    case 'chignon':
      return (
        <g>
          <circle cx="100" cy="28" r="17" fill={fill} />
          <path d="M44 92 Q40 40 100 36 Q160 40 156 92 Q146 60 100 58 Q54 60 44 92Z" fill={fill} />
          <path d="M88 22 Q100 16 112 22" stroke={dark} strokeWidth="2" fill="none" opacity="0.5" />
          {shine}
        </g>
      );
    case 'carre':
    case 'long':
    case 'couettes':
    case 'queue':
      return (
        <g>
          <path d="M44 100 Q40 38 100 34 Q160 38 156 100 Q150 68 128 62 Q124 76 112 78 Q110 64 100 62 Q86 66 80 80 Q74 66 62 70 Q50 76 44 100Z" fill={fill} />
          {style !== 'queue' && sides}
          {style === 'queue' && <circle cx="150" cy="72" r="6" fill="#f472b6" />}
          {style === 'couettes' && (
            <>
              <circle cx="52" cy="90" r="5" fill="#f472b6" />
              <circle cx="148" cy="90" r="5" fill="#f472b6" />
            </>
          )}
          {shine}
        </g>
      );
    default:
      return (
        <g>
          <path d={bangs} fill={fill} />
          {sides}
          {shine}
          <path d="M100 34 Q104 18 116 16 Q106 24 106 36 Z" fill={fill} />
        </g>
      );
  }
}

function Eyes({ shape, mood, iris, lashes }: { shape: string; mood: AvatarMood; iris: string; lashes?: boolean }) {
  if (mood === 'happy' || mood === 'celebrate' || shape === 'rieur') {
    return (
      <g stroke="#2a1b3d" strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M66 104 Q77 90 88 104" />
        <path d="M112 104 Q123 90 134 104" />
      </g>
    );
  }
  const ry = shape === 'amande' ? 10 : mood === 'surprised' ? 15 : 14;
  const rx = shape === 'amande' ? 13 : 12;
  const eye = (cx: number) => (
    <g key={cx}>
      <ellipse cx={cx} cy={102} rx={rx} ry={ry} fill="#fff" />
      <ellipse cx={cx} cy={103} rx={rx - 2.5} ry={ry - 2} fill={iris} />
      <ellipse cx={cx} cy={105} rx="4.5" ry={ry * 0.43} fill="#2a0f1e" />
      <circle cx={cx - 3.5} cy={98} r="3.4" fill="#fff" />
      <circle cx={cx + 3.5} cy={108} r="1.7" fill="#fff" opacity="0.85" />
      <path d={`M${cx - 13} ${102 - ry + 1} Q${cx} ${102 - ry - 5} ${cx + 13} ${102 - ry + 2}`} stroke="#2a1b3d" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      {lashes && (
        <path
          d={cx < 100 ? `M${cx - 12} ${102 - ry + 2} l-5 -3 M${cx - 9} ${102 - ry - 1} l-3 -4` : `M${cx + 12} ${102 - ry + 3} l5 -3 M${cx + 9} ${102 - ry} l3 -4`}
          stroke="#2a1b3d"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      )}
    </g>
  );
  return <g>{[eye(77), eye(123)]}</g>;
}

function Mouth({ kind, mood }: { kind: string; mood: AvatarMood }) {
  if (mood === 'sad') return <path d="M92 128 Q100 122 108 128" stroke="#7a2a3d" strokeWidth="2.6" fill="none" strokeLinecap="round" />;
  if (mood === 'surprised') return <ellipse cx="100" cy="127" rx="5" ry="6" fill="#c2304f" />;
  if (mood === 'happy' || mood === 'celebrate' || kind === 'grand')
    return (
      <g>
        <path d="M88 122 Q100 138 112 122 Z" fill="#c2304f" />
        <path d="M93 129 Q100 134 107 129" fill="#ff8fa8" />
      </g>
    );
  switch (kind) {
    case 'chat':
      return <path d="M90 124 Q95 129 100 124 Q105 129 110 124" stroke="#7a2a3d" strokeWidth="2.6" fill="none" strokeLinecap="round" />;
    case 'neutre':
      return <path d="M94 126 H106" stroke="#7a2a3d" strokeWidth="2.6" strokeLinecap="round" />;
    case 'langue':
      return (
        <g>
          <path d="M92 123 Q100 130 108 123" stroke="#7a2a3d" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M100 127 q6 0 5 6 q-5 3 -6 -2z" fill="#ff7a96" />
        </g>
      );
    default:
      return <path d="M93 124 Q100 130 107 124" stroke="#7a2a3d" strokeWidth="2.8" fill="none" strokeLinecap="round" />;
  }
}

function Outfit({ kind, c1, c2 }: { kind: string; c1: string; c2: string }) {
  switch (kind) {
    case 'sweat':
      return (
        <g>
          <path d="M72 150 Q100 166 128 150 Q120 140 100 140 Q80 140 72 150Z" fill={c2} />
          <path d="M92 152 V170 M108 152 V170" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
          <rect x="84" y="174" width="32" height="12" rx="5" fill={c2} opacity="0.7" />
        </g>
      );
    case 'tshirt':
      return (
        <g>
          <path d="M88 146 Q100 156 112 146" stroke="#fff" strokeWidth="2.5" fill="none" opacity="0.8" />
          <text x="100" y="178" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="12" fontWeight="700" fill="#fff" opacity="0.9">{'</>'}</text>
        </g>
      );
    case 'chemise':
      return (
        <g>
          <path d="M84 146 L100 160 L116 146 L112 142 L100 150 L88 142Z" fill="#fff" />
          {[166, 174, 182].map((y) => (
            <circle key={y} cx="100" cy={y} r="1.8" fill="#fff" />
          ))}
        </g>
      );
    case 'kimono':
      return (
        <g>
          <path d="M80 146 L112 190 M120 146 L96 176" stroke="#fff" strokeWidth="5" />
          <rect x="66" y="176" width="68" height="10" fill="#fbbf24" />
        </g>
      );
    case 'cape':
      return (
        <g>
          <path d="M78 148 L100 170 L122 148" fill="#f4f7ff" stroke="#fbbf24" strokeWidth="2.5" />
          <circle cx="100" cy="166" r="5" fill="#fbbf24" />
        </g>
      );
    case 'armure':
      return (
        <g>
          <path d="M70 152 Q100 142 130 152 L132 176 Q100 186 68 176Z" fill="#cbd5e1" stroke="#64748b" strokeWidth="2" />
          <path d="M100 150 V182" stroke="#64748b" strokeWidth="2" />
          <circle cx="100" cy="164" r="6" fill={c1} stroke="#fbbf24" strokeWidth="2" />
        </g>
      );
    default:
      return (
        <g>
          <path d="M78 148 L100 172 L122 148" fill="#f4f7ff" stroke="#22d3ee" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M100 160 l-11 -6 v12 z M100 160 l11 -6 v12 z" fill="#8b5cf6" />
          <circle cx="100" cy="160" r="3.5" fill="#a78bfa" />
        </g>
      );
  }
}

function Arms({ pose, fill, skin, armor }: { pose: AvatarPose; fill: string; skin: string; armor: boolean }) {
  const hand = armor ? '#cbd5e1' : skin;
  const arm = (d: string, hx: number, hy: number, key: string, wave = false) => (
    <motion.g
      key={key}
      animate={wave ? { rotate: [0, -16, 6, -16, 0] } : undefined}
      transition={wave ? { duration: 1.2, repeat: Infinity } : undefined}
      style={{ originX: '132px', originY: '158px' }}
    >
      <path d={d} stroke={fill} strokeWidth="13" strokeLinecap="round" fill="none" />
      <circle cx={hx} cy={hy} r="7.5" fill={hand} />
    </motion.g>
  );
  const left = arm('M68 158 Q58 174 62 186', 63, 189, 'l');
  switch (pose) {
    case 'wave':
      return <g>{left}{arm('M132 158 Q150 146 156 124', 158, 119, 'r', true)}</g>;
    case 'up':
      return <g>{arm('M68 158 Q52 140 50 118', 50, 113, 'l')}{arm('M132 158 Q148 140 150 118', 150, 113, 'r')}</g>;
    case 'highfive':
      return <g>{left}{arm('M132 158 Q156 150 168 132', 171, 128, 'r')}</g>;
    case 'down':
      return <g>{arm('M68 158 Q62 176 74 190', 76, 192, 'l')}{arm('M132 158 Q138 176 126 190', 124, 192, 'r')}</g>;
    default:
      return <g>{left}{arm('M132 158 Q142 174 138 186', 137, 189, 'r')}</g>;
  }
}

function Accessory({ kind }: { kind: string }) {
  switch (kind) {
    case 'barrette':
      return (
        <g transform="rotate(-18 142 58)">
          <rect x="128" y="50" width="30" height="15" rx="7.5" fill="#0e1a40" />
          <path d="M136 53.5 l-4 4 4 4 M150 53.5 l4 4 -4 4 M145 52.5 l-3 10" stroke="#22d3ee" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'lunettes':
      return (
        <g stroke="#1e293b" strokeWidth="3" fill="#bae6fd" fillOpacity="0.25">
          <rect x="60" y="90" width="34" height="26" rx="10" />
          <rect x="106" y="90" width="34" height="26" rx="10" />
          <path d="M94 100 H106" fill="none" />
        </g>
      );
    case 'casque':
      return (
        <g>
          <path d="M44 100 Q44 36 100 34 Q156 36 156 100" stroke="#1e293b" strokeWidth="7" fill="none" />
          <rect x="34" y="92" width="18" height="30" rx="8" fill="#8b5cf6" />
          <rect x="148" y="92" width="18" height="30" rx="8" fill="#8b5cf6" />
          <path d="M40 120 Q48 140 72 136" stroke="#1e293b" strokeWidth="3" fill="none" />
          <circle cx="74" cy="136" r="4" fill="#1e293b" />
        </g>
      );
    case 'noeud':
      return (
        <g transform="translate(126 36) rotate(15)">
          <path d="M0 10 L-16 0 V20Z M0 10 L16 0 V20Z" fill="#f43f5e" />
          <circle cx="0" cy="10" r="5" fill="#fb7185" />
        </g>
      );
    case 'bandeau':
      return <path d="M46 70 Q100 50 154 70 L154 80 Q100 60 46 80Z" fill="#ef4444" />;
    case 'etoile':
      return <path d="M140 40 l5 11 12 1.5 -9 8 2.5 12 -10.5 -6 -10.5 6 2.5 -12 -9 -8 12 -1.5z" fill="#fbbf24" stroke="#d97706" strokeWidth="1.5" />;
    case 'couronne':
      return (
        <g transform="translate(0 -4)">
          <path d="M70 40 L74 16 L86 30 L100 10 L114 30 L126 16 L130 40 Z" fill="#fbbf24" stroke="#d97706" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="100" cy="30" r="3.5" fill="#ef4444" />
          <circle cx="84" cy="34" r="2.2" fill="#22d3ee" />
          <circle cx="116" cy="34" r="2.2" fill="#8b5cf6" />
        </g>
      );
    case 'aureole':
      return <ellipse cx="100" cy="22" rx="30" ry="7" fill="none" stroke="#fde047" strokeWidth="5" opacity="0.95" />;
    case 'chat':
      return (
        <g>
          <path d="M52 62 L58 22 L84 46Z" fill="#334155" />
          <path d="M148 62 L142 22 L116 46Z" fill="#334155" />
          <path d="M60 52 L62 32 L76 46Z M140 52 L138 32 L124 46Z" fill="#f9a8d4" />
        </g>
      );
    case 'cornes':
      return (
        <g fill="#dc2626">
          <path d="M66 54 Q56 34 66 20 Q70 38 80 46Z" />
          <path d="M134 54 Q144 34 134 20 Q130 38 120 46Z" />
        </g>
      );
    default:
      return null;
  }
}
