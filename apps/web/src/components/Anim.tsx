/**
 * Animations pédagogiques des cours (hardware, OpenGL, Vulkan…).
 * Dans un chapitre : un bloc de code Markdown ```anim nom```.
 * Certaines sont interactives (clique sur les bits, les entrées des portes…).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play } from 'lucide-react';

function useTick(ms: number, running = true) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setT((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms, running]);
  return t;
}

function Frame({ title, children, caption, running, onToggle }: { title: string; children: ReactNode; caption?: ReactNode; running?: boolean; onToggle?: () => void }) {
  return (
    <figure className="not-prose my-5 overflow-hidden rounded-3xl border-2 border-ink-100 bg-gradient-to-br from-ink-50 to-white dark:border-ink-800 dark:from-ink-900 dark:to-ink-950">
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-2 text-xs font-black uppercase tracking-wider text-ink-500 dark:border-ink-800">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Animation · {title}
        <div className="flex-1" />
        {onToggle && (
          <button onClick={onToggle} className="rounded-lg p-1 hover:bg-ink-100 dark:hover:bg-ink-800" aria-label={running ? 'Pause' : 'Lecture'}>
            {running ? <Pause size={14} /> : <Play size={14} />}
          </button>
        )}
      </div>
      <div className="p-4">{children}</div>
      {caption && <figcaption className="border-t border-ink-100 px-4 py-2 text-sm text-ink-600 dark:border-ink-800 dark:text-ink-300">{caption}</figcaption>}
    </figure>
  );
}

/* ---------------- Binaire ---------------- */
function Binary() {
  const [bits, setBits] = useState([0, 0, 0, 0, 0, 1, 0, 1]);
  const [auto, setAuto] = useState(false);
  const t = useTick(900, auto);
  useEffect(() => {
    if (!auto) return;
    setBits((b) => {
      const n = (parseInt(b.join(''), 2) + 1) % 256;
      return n.toString(2).padStart(8, '0').split('').map(Number);
    });
  }, [t, auto]);
  const value = parseInt(bits.join(''), 2);
  return (
    <Frame title="Le binaire" running={auto} onToggle={() => setAuto((a) => !a)} caption={<>Clique sur un bit pour l’allumer ou l’éteindre. Chaque position vaut le double de celle de droite : <b>{bits.map((b, i) => (b ? 2 ** (7 - i) : 0)).filter(Boolean).join(' + ') || '0'} = {value}</b>.</>}>
      <div className="flex flex-wrap justify-center gap-2">
        {bits.map((b, i) => (
          <button key={i} onClick={() => setBits((x) => x.map((v, j) => (j === i ? 1 - v : v)))} className="flex flex-col items-center">
            <motion.div
              animate={{ backgroundColor: b ? '#22d3ee' : '#1f2538', scale: b ? 1.05 : 1, boxShadow: b ? '0 0 18px #22d3ee' : '0 0 0 transparent' }}
              className="flex h-14 w-11 items-center justify-center rounded-xl font-mono text-2xl font-black text-white"
            >
              {b}
            </motion.div>
            <span className="mt-1 text-[11px] font-bold text-ink-500">{2 ** (7 - i)}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 text-center font-mono text-lg font-black">
        = <span className="text-brand-500">{value}</span> en décimal · <span className="text-violet-500">0x{value.toString(16).toUpperCase().padStart(2, '0')}</span> en hexadécimal
      </div>
    </Frame>
  );
}

/* ---------------- Portes logiques ---------------- */
const GATES: Record<string, (a: number, b: number) => number> = { ET: (a, b) => a & b, OU: (a, b) => a | b, XOR: (a, b) => a ^ b, NON: (a) => 1 - a, NAND: (a, b) => 1 - (a & b) };
function Gates() {
  const [a, setA] = useState(1);
  const [b, setB] = useState(0);
  return (
    <Frame title="Portes logiques" caption="Clique sur les entrées A et B : les fils s’allument quand ils transportent un 1. Toute la logique d’un processeur est construite avec ces portes.">
      <div className="grid gap-3 sm:grid-cols-5">
        {Object.entries(GATES).map(([name, f]) => {
          const out = f(a, b);
          return (
            <div key={name} className="rounded-2xl bg-white p-2 text-center shadow-sm dark:bg-ink-800">
              <svg viewBox="0 0 120 70" className="w-full">
                <motion.path d="M0 20 H40" strokeWidth="4" animate={{ stroke: a ? '#22d3ee' : '#94a3b8' }} />
                {name !== 'NON' && <motion.path d="M0 50 H40" strokeWidth="4" animate={{ stroke: b ? '#22d3ee' : '#94a3b8' }} />}
                <rect x="40" y="8" width="44" height="54" rx="14" fill="#3b6cf6" />
                <text x="62" y="40" textAnchor="middle" fontSize="12" fontWeight="900" fill="#fff">{name}</text>
                <motion.path d="M84 35 H120" strokeWidth="4" animate={{ stroke: out ? '#22d3ee' : '#94a3b8' }} />
                <motion.circle cx="114" cy="35" r="6" animate={{ fill: out ? '#facc15' : '#475569', scale: out ? [1, 1.3, 1] : 1 }} transition={{ duration: 0.4 }} />
              </svg>
              <div className="text-xs font-black">sortie : {out}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-center gap-3">
        {[['A', a, setA], ['B', b, setB]].map(([n, v, set]) => (
          <button key={n as string} onClick={() => (set as (x: number) => void)(1 - (v as number))} className={`rounded-2xl px-4 py-2 font-black ${v ? 'bg-cyan-400 text-ink-900' : 'bg-ink-200 dark:bg-ink-700'}`}>
            {n as string} = {v as number}
          </button>
        ))}
      </div>
    </Frame>
  );
}

/* ---------------- Transistor ---------------- */
function Transistor() {
  const [on, setOn] = useState(true);
  const t = useTick(120, on);
  return (
    <Frame title="Le transistor, un interrupteur" caption="Une petite tension sur la grille (G) ouvre le passage entre source et drain : le courant circule = 1. Sans tension, rien ne passe = 0. Un processeur moderne en contient des milliards.">
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 240 120" className="w-full max-w-md">
          <rect x="70" y="50" width="100" height="30" rx="8" fill="#334155" />
          <rect x="105" y="22" width="30" height="22" rx="4" fill={on ? '#facc15' : '#64748b'} />
          <text x="120" y="37" textAnchor="middle" fontSize="11" fontWeight="900" fill="#1f2538">G</text>
          <text x="80" y="100" fontSize="11" fontWeight="800" fill="#64748b">source</text>
          <text x="140" y="100" fontSize="11" fontWeight="800" fill="#64748b">drain</text>
          <path d="M10 65 H70 M170 65 H230" stroke="#94a3b8" strokeWidth="6" />
          {on &&
            Array.from({ length: 6 }, (_, i) => {
              const x = ((t * 6 + i * 40) % 240) + 0;
              return <circle key={i} cx={x} cy={65} r="5" fill="#22d3ee" />;
            })}
        </svg>
        <button onClick={() => setOn((o) => !o)} className={`mt-2 rounded-2xl px-4 py-2 font-black ${on ? 'bg-amber-300 text-ink-900' : 'bg-ink-200 dark:bg-ink-700'}`}>
          Tension sur la grille : {on ? 'oui → 1' : 'non → 0'}
        </button>
      </div>
    </Frame>
  );
}

/* ---------------- Cycle du processeur ---------------- */
const STAGES = [
  { n: 'Lecture (fetch)', d: 'Le processeur lit l’instruction à l’adresse du compteur ordinal (PC) en mémoire.' },
  { n: 'Décodage', d: 'L’unité de contrôle comprend l’instruction : quelle opération, quels registres.' },
  { n: 'Exécution', d: 'L’UAL (unité arithmétique et logique) fait le calcul.' },
  { n: 'Écriture', d: 'Le résultat est rangé dans un registre ; le PC passe à l’instruction suivante.' },
];
const PROG = ['LOAD R1, 5', 'LOAD R2, 7', 'ADD R3, R1, R2', 'STORE R3, [100]'];
function CpuCycle() {
  const [run, setRun] = useState(true);
  const t = useTick(1100, run);
  const stage = t % 4;
  const pc = Math.floor(t / 4) % PROG.length;
  const regs = { R1: pc >= 1 || (pc === 0 && stage === 3) ? 5 : 0, R2: pc >= 2 || (pc === 1 && stage === 3) ? 7 : 0, R3: pc >= 3 || (pc === 2 && stage === 3) ? 12 : 0 };
  return (
    <Frame title="Le cycle d’instruction" running={run} onToggle={() => setRun((r) => !r)} caption={<><b>{STAGES[stage].n}</b> — {STAGES[stage].d}</>}>
      <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
        <div className="rounded-2xl bg-ink-900 p-3 font-mono text-sm text-ink-100">
          <div className="mb-1 text-[11px] font-bold text-ink-400">MÉMOIRE (programme)</div>
          {PROG.map((ins, i) => (
            <motion.div key={i} animate={{ backgroundColor: i === pc ? 'rgba(34,211,238,0.25)' : 'rgba(0,0,0,0)' }} className="flex gap-2 rounded px-2 py-0.5">
              <span className="text-ink-500">{String(i * 4).padStart(2, '0')}</span> {ins} {i === pc && <span className="ml-auto text-cyan-300">← PC</span>}
            </motion.div>
          ))}
        </div>
        <div>
          <div className="grid grid-cols-4 gap-1">
            {STAGES.map((s, i) => (
              <motion.div key={i} animate={{ backgroundColor: i === stage ? '#3b6cf6' : 'rgba(100,116,139,0.15)', color: i === stage ? '#fff' : '#64748b', scale: i === stage ? 1.05 : 1 }} className="rounded-xl px-1 py-2 text-center text-[11px] font-black">
                {s.n.split(' ')[0]}
              </motion.div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {Object.entries(regs).map(([k, v]) => (
              <motion.div key={k} animate={{ scale: [1, v ? 1.08 : 1, 1] }} className="rounded-xl bg-white p-2 text-center shadow-sm dark:bg-ink-800">
                <div className="text-[10px] font-bold text-ink-500">registre</div>
                <div className="font-mono text-lg font-black">{k} = {v}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ---------------- Pipeline ---------------- */
function Pipeline() {
  const [run, setRun] = useState(true);
  const t = useTick(1000, run);
  const cols = 8;
  const cyc = t % cols;
  const names = ['F', 'D', 'E', 'W'];
  return (
    <Frame title="Le pipeline" running={run} onToggle={() => setRun((r) => !r)} caption="Comme une chaîne de montage : pendant qu’une instruction s’exécute, la suivante est décodée et une autre lue. 4 instructions avancent en parallèle, une par étage.">
      <div className="overflow-x-auto">
        <table className="mx-auto border-separate border-spacing-1 text-center text-xs font-black">
          <thead>
            <tr>
              <th />
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} className={c === cyc ? 'text-brand-500' : 'text-ink-400'}>cycle {c + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }, (_, r) => (
              <tr key={r}>
                <td className="pr-2 text-ink-500">instr. {r + 1}</td>
                {Array.from({ length: cols }, (_, c) => {
                  const s = c - r;
                  const show = s >= 0 && s < 4 && c <= cyc;
                  return (
                    <td key={c}>
                      <motion.div initial={false} animate={{ opacity: show ? 1 : 0.08, scale: show && c === cyc ? 1.1 : 1 }} className="h-8 w-12 rounded-lg leading-8 text-white" style={{ background: ['#3b6cf6', '#8b5cf6', '#f59e0b', '#10b981'][Math.max(0, Math.min(3, s))] }}>
                        {show ? names[s] : ''}
                      </motion.div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}

/* ---------------- Hiérarchie mémoire ---------------- */
const MEM = [
  { n: 'Registres', s: '≈ 1 Ko', l: '0,3 ns', w: 18, c: '#ef4444' },
  { n: 'Cache L1', s: '≈ 64 Ko', l: '1 ns', w: 30, c: '#f97316' },
  { n: 'Cache L2/L3', s: '1 à 64 Mo', l: '4 à 40 ns', w: 46, c: '#f59e0b' },
  { n: 'RAM', s: '8 à 64 Go', l: '≈ 80 ns', w: 64, c: '#10b981' },
  { n: 'SSD', s: '0,5 à 4 To', l: '≈ 50 µs', w: 82, c: '#3b82f6' },
  { n: 'Disque dur', s: '1 à 20 To', l: '≈ 5 ms', w: 100, c: '#8b5cf6' },
];
function MemoryHierarchy() {
  const [hover, setHover] = useState(0);
  return (
    <Frame title="La hiérarchie mémoire" caption={<>Plus une mémoire est proche du processeur, plus elle est <b>rapide</b>, <b>petite</b> et <b>chère</b>. Survole un étage : <b>{MEM[hover].n}</b> — capacité {MEM[hover].s}, temps d’accès {MEM[hover].l}.</>}>
      <div className="flex flex-col items-center gap-1.5">
        {MEM.map((m, i) => (
          <motion.div
            key={m.n}
            onMouseEnter={() => setHover(i)}
            onClick={() => setHover(i)}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: `${m.w}%`, opacity: 1, scale: hover === i ? 1.04 : 1 }}
            transition={{ delay: i * 0.12 }}
            className="cursor-pointer rounded-xl py-2 text-center text-sm font-black text-white shadow"
            style={{ background: m.c }}
          >
            {m.n}
          </motion.div>
        ))}
      </div>
    </Frame>
  );
}

/* ---------------- Bus CPU ↔ RAM ---------------- */
function Bus() {
  const [run, setRun] = useState(true);
  const t = useTick(60, run);
  const x = (t * 3) % 300;
  const back = Math.floor(t / 100) % 2 === 1;
  return (
    <Frame title="Le bus : CPU ↔ RAM" running={run} onToggle={() => setRun((r) => !r)} caption="Le processeur envoie une adresse sur le bus d’adresses ; la mémoire répond avec la donnée sur le bus de données. Ces allers-retours prennent du temps : c’est pour ça qu’il y a des caches.">
      <svg viewBox="0 0 400 130" className="w-full">
        <rect x="10" y="30" width="80" height="70" rx="14" fill="#3b6cf6" />
        <text x="50" y="70" textAnchor="middle" fontWeight="900" fill="#fff">CPU</text>
        <rect x="310" y="20" width="80" height="90" rx="10" fill="#10b981" />
        <text x="350" y="70" textAnchor="middle" fontWeight="900" fill="#fff">RAM</text>
        <path d="M90 50 H310 M90 82 H310" stroke="#cbd5e1" strokeWidth="8" strokeLinecap="round" />
        <text x="200" y="40" textAnchor="middle" fontSize="10" fontWeight="800" fill="#64748b">bus d’adresses</text>
        <text x="200" y="104" textAnchor="middle" fontSize="10" fontWeight="800" fill="#64748b">bus de données</text>
        {!back ? (
          <g transform={`translate(${90 + (x % 220)} 50)`}>
            <rect x="-22" y="-9" width="44" height="18" rx="6" fill="#f59e0b" />
            <text y="4" textAnchor="middle" fontSize="9" fontWeight="900" fill="#1f2538">@0x2A</text>
          </g>
        ) : (
          <g transform={`translate(${310 - (x % 220)} 82)`}>
            <rect x="-18" y="-9" width="36" height="18" rx="6" fill="#22d3ee" />
            <text y="4" textAnchor="middle" fontSize="9" fontWeight="900" fill="#1f2538">42</text>
          </g>
        )}
      </svg>
    </Frame>
  );
}

/* ---------------- Stockage ---------------- */
function Storage() {
  const t = useTick(50);
  const cell = Math.floor(t / 6) % 16;
  return (
    <Frame title="Disque dur ou SSD ?" caption="Le disque dur lit des données magnétiques sur des plateaux qui tournent, avec une tête mobile (millisecondes). Le SSD lit des cellules électroniques sans aucune pièce mobile (microsecondes) : bien plus rapide.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col items-center">
          <svg viewBox="0 0 140 140" className="w-40">
            <motion.g animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} style={{ originX: '70px', originY: '70px' }}>
              <circle cx="70" cy="70" r="60" fill="#94a3b8" />
              <circle cx="70" cy="70" r="45" fill="none" stroke="#cbd5e1" strokeWidth="2" />
              <circle cx="70" cy="70" r="30" fill="none" stroke="#cbd5e1" strokeWidth="2" />
              <rect x="66" y="12" width="8" height="10" fill="#f59e0b" />
              <circle cx="70" cy="70" r="8" fill="#475569" />
            </motion.g>
            <motion.path d="M130 130 L82 40" stroke="#1f2538" strokeWidth="6" strokeLinecap="round" animate={{ rotate: [0, 8, -4, 0] }} transition={{ duration: 2, repeat: Infinity }} style={{ originX: '130px', originY: '130px' }} />
          </svg>
          <div className="text-sm font-black">Disque dur (HDD)</div>
        </div>
        <div className="flex flex-col items-center">
          <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-ink-900 p-3">
            {Array.from({ length: 16 }, (_, i) => (
              <motion.div key={i} animate={{ backgroundColor: i === cell ? '#22d3ee' : '#334155', scale: i === cell ? 1.15 : 1 }} className="h-7 w-7 rounded-md" />
            ))}
          </div>
          <div className="mt-2 text-sm font-black">SSD (mémoire flash)</div>
        </div>
      </div>
    </Frame>
  );
}

/* ---------------- Pipeline graphique ---------------- */
const GSTAGES = [
  { n: 'Sommets', d: 'Le programme envoie au GPU une liste de sommets (positions, couleurs, coordonnées de texture) stockée dans un buffer.' },
  { n: 'Vertex shader', d: 'Exécuté une fois par sommet : il transforme la position (modèle → monde → caméra → écran).' },
  { n: 'Assemblage', d: 'Les sommets sont regroupés en primitives : ici, des triangles.' },
  { n: 'Rastérisation', d: 'Chaque triangle est découpé en fragments : les pixels qu’il recouvre.' },
  { n: 'Fragment shader', d: 'Exécuté une fois par fragment : il calcule la couleur (texture, lumière…).' },
  { n: 'Image', d: 'Tests de profondeur et mélange, puis le pixel est écrit dans le framebuffer affiché à l’écran.' },
];
function GpuPipeline() {
  const [run, setRun] = useState(true);
  const t = useTick(1500, run);
  const s = t % GSTAGES.length;
  const pts = [[30, 95], [95, 20], [150, 100]];
  return (
    <Frame title="Le pipeline graphique" running={run} onToggle={() => setRun((r) => !r)} caption={<><b>{GSTAGES[s].n}</b> — {GSTAGES[s].d}</>}>
      <div className="mb-3 flex flex-wrap gap-1">
        {GSTAGES.map((g, i) => (
          <motion.div key={g.n} animate={{ backgroundColor: i === s ? '#8b5cf6' : 'rgba(100,116,139,0.15)', color: i === s ? '#fff' : '#64748b' }} className="flex-1 rounded-xl px-2 py-1.5 text-center text-[11px] font-black">
            {i + 1}. {g.n}
          </motion.div>
        ))}
      </div>
      <svg viewBox="0 0 180 120" className="mx-auto h-48 w-full max-w-md rounded-2xl bg-ink-900">
        {s >= 3 &&
          Array.from({ length: 18 }, (_, x) =>
            Array.from({ length: 12 }, (_, y) => {
              const px = x * 10 + 5;
              const py = y * 10 + 5;
              // test « point dans le triangle »
              const [a, b, c] = pts;
              const sign = (p1: number[], p2: number[], p3: number[]) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
              const d1 = sign([px, py], a, b), d2 = sign([px, py], b, c), d3 = sign([px, py], c, a);
              const inside = !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
              if (!inside) return null;
              const col = s >= 4 ? `hsl(${(px + py) * 1.4}, 80%, 60%)` : '#475569';
              return <motion.rect key={`${x}-${y}`} x={x * 10 + 0.5} y={y * 10 + 0.5} width="9" height="9" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: (x + y) * 0.01 }} fill={col} />;
            }),
          )}
        {s >= 2 && s < 5 && <polygon points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#22d3ee" strokeWidth="1.5" />}
        {pts.map(([x, y], i) => (
          <motion.circle key={i} r="4" fill="#facc15" initial={false} animate={{ cx: s === 0 ? 20 + i * 20 : x, cy: s === 0 ? 20 : y, opacity: s >= 5 ? 0 : 1 }} transition={{ duration: 0.8 }} />
        ))}
        {s === 5 && <text x="90" y="116" textAnchor="middle" fontSize="8" fontWeight="900" fill="#e2e8f0">framebuffer → écran</text>}
      </svg>
    </Frame>
  );
}

/* ---------------- Transformations ---------------- */
function Transforms() {
  const [run, setRun] = useState(true);
  const t = useTick(1600, run);
  const mode = t % 4;
  const labels = ['Translation : déplacer', 'Rotation : tourner', 'Mise à l’échelle : agrandir', 'Les trois combinées : M = T × R × S'];
  const tr = [
    { x: 40, y: 0, rotate: 0, scale: 1 },
    { x: 0, y: 0, rotate: 45, scale: 1 },
    { x: 0, y: 0, rotate: 0, scale: 1.6 },
    { x: 40, y: -10, rotate: 30, scale: 1.3 },
  ][mode];
  return (
    <Frame title="Transformations 3D" running={run} onToggle={() => setRun((r) => !r)} caption={<><b>{labels[mode]}</b>. En 3D, chaque transformation est une matrice 4×4 ; on les multiplie pour obtenir la matrice modèle, puis on applique la vue (caméra) et la projection.</>}>
      <div className="relative mx-auto h-48 max-w-md overflow-hidden rounded-2xl bg-[linear-gradient(#e2e8f0_1px,transparent_1px),linear-gradient(90deg,#e2e8f0_1px,transparent_1px)] bg-[size:20px_20px] dark:bg-[linear-gradient(#1f2538_1px,transparent_1px),linear-gradient(90deg,#1f2538_1px,transparent_1px)]">
        <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-dashed border-ink-300" />
        <motion.div animate={tr} transition={{ type: 'spring', stiffness: 80, damping: 12 }} className="absolute left-1/2 top-1/2 -ml-6 -mt-6 h-12 w-12 rounded-md bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg" />
      </div>
    </Frame>
  );
}

/* ---------------- Image Vulkan ---------------- */
const VK = [
  { n: 'vkAcquireNextImageKHR', d: 'On demande une image libre à la swapchain. Un sémaphore « image disponible » sera signalé quand elle sera prête.' },
  { n: 'Enregistrer les commandes', d: 'Dans un command buffer : début de rendu, liaison du pipeline, draw calls, fin du rendu.' },
  { n: 'vkQueueSubmit', d: 'On soumet le command buffer à la file graphique. Le GPU attend le sémaphore puis travaille ; à la fin il signale « rendu terminé » et une fence.' },
  { n: 'vkQueuePresentKHR', d: 'La file de présentation attend « rendu terminé » puis affiche l’image à l’écran.' },
  { n: 'Attendre la fence', d: 'Le CPU attend la fence de cette image avant de réutiliser ses ressources pour une nouvelle image.' },
];
function VulkanFrame() {
  const [run, setRun] = useState(true);
  const t = useTick(1700, run);
  const s = t % VK.length;
  return (
    <Frame title="Une image avec Vulkan" running={run} onToggle={() => setRun((r) => !r)} caption={<><b>{VK[s].n}</b> — {VK[s].d}</>}>
      <div className="grid gap-2 sm:grid-cols-5">
        {VK.map((v, i) => (
          <motion.div key={v.n} animate={{ y: i === s ? -6 : 0, backgroundColor: i === s ? '#a41e22' : 'rgba(100,116,139,0.12)', color: i === s ? '#fff' : '#64748b' }} className="rounded-2xl p-2 text-center text-[11px] font-black">
            <div className="text-lg">{['🖼️', '📝', '🚀', '📺', '⏳'][i]}</div>
            {v.n}
          </motion.div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-6 text-xs font-bold">
        <span className="flex items-center gap-1"><motion.span animate={{ backgroundColor: s >= 1 && s <= 2 ? '#22c55e' : '#94a3b8' }} className="h-3 w-3 rounded-full" /> sémaphore image disponible</span>
        <span className="flex items-center gap-1"><motion.span animate={{ backgroundColor: s >= 3 ? '#22c55e' : '#94a3b8' }} className="h-3 w-3 rounded-full" /> sémaphore rendu terminé</span>
        <span className="flex items-center gap-1"><motion.span animate={{ backgroundColor: s === 4 ? '#f59e0b' : '#94a3b8' }} className="h-3 w-3 rounded-sm" /> fence</span>
      </div>
    </Frame>
  );
}

/* ---------------- Carte mère ---------------- */
const PARTS = [
  { id: 'cpu', n: 'Processeur (CPU)', d: 'Exécute les instructions. Dans son socket, refroidi par un ventirad.', x: 40, y: 18, w: 26, h: 22, c: '#3b6cf6' },
  { id: 'ram', n: 'Mémoire vive (RAM)', d: 'Barrettes qui gardent les données des programmes en cours. Effacée à l’extinction.', x: 72, y: 12, w: 10, h: 40, c: '#10b981' },
  { id: 'gpu', n: 'Carte graphique (GPU)', d: 'Branchée sur un port PCIe x16 : des milliers de petits cœurs pour la 3D et le calcul parallèle.', x: 12, y: 58, w: 62, h: 12, c: '#8b5cf6' },
  { id: 'ssd', n: 'SSD M.2', d: 'Stockage rapide, branché directement sur la carte mère via PCIe (NVMe).', x: 40, y: 46, w: 22, h: 6, c: '#f59e0b' },
  { id: 'chipset', n: 'Chipset', d: 'Le « carrefour » qui relie le processeur aux ports USB, SATA, réseau…', x: 70, y: 66, w: 12, h: 12, c: '#64748b' },
  { id: 'psu', n: 'Alimentation (ATX 24 broches)', d: 'Le connecteur qui apporte l’énergie à toute la carte.', x: 88, y: 20, w: 6, h: 26, c: '#ef4444' },
];
function Motherboard() {
  const [sel, setSel] = useState(PARTS[0]);
  return (
    <Frame title="La carte mère" caption={<><b>{sel.n}</b> — {sel.d}</>}>
      <svg viewBox="0 0 100 86" className="mx-auto w-full max-w-lg">
        <rect x="2" y="2" width="96" height="82" rx="4" fill="#065f46" />
        {[...Array(12)].map((_, i) => <path key={i} d={`M${4 + i * 8} 4 V82`} stroke="#047857" strokeWidth="0.4" />)}
        {PARTS.map((p) => (
          <motion.g key={p.id} onClick={() => setSel(p)} onMouseEnter={() => setSel(p)} whileHover={{ scale: 1.05 }} className="cursor-pointer" style={{ originX: `${p.x + p.w / 2}px`, originY: `${p.y + p.h / 2}px` }}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="1.5" fill={p.c} stroke={sel.id === p.id ? '#facc15' : 'none'} strokeWidth="1" />
            <text x={p.x + p.w / 2} y={p.y + p.h / 2 + 1.4} textAnchor="middle" fontSize="3.6" fontWeight="900" fill="#fff">{p.id.toUpperCase()}</text>
          </motion.g>
        ))}
      </svg>
    </Frame>
  );
}

/* ---------------- Additionneur ---------------- */
function Adder() {
  const [a, setA] = useState(1);
  const [b, setB] = useState(1);
  return (
    <Frame title="Le demi-additionneur" caption={<>Deux portes suffisent pour additionner deux bits : <b>somme = A XOR B</b>, <b>retenue = A ET B</b>. Ici : {a} + {b} = <b>{a & b}{a ^ b}</b> en binaire ({a + b} en décimal). En les chaînant, on additionne des nombres de 64 bits.</>}>
      <div className="flex flex-wrap items-center justify-center gap-4">
        {[['A', a, setA], ['B', b, setB]].map(([n, v, set]) => (
          <button key={n as string} onClick={() => (set as (x: number) => void)(1 - (v as number))} className={`h-14 w-14 rounded-2xl text-xl font-black ${v ? 'bg-cyan-400 text-ink-900 shadow-[0_0_16px_#22d3ee]' : 'bg-ink-200 dark:bg-ink-700'}`}>
            {n as string}={v as number}
          </button>
        ))}
        <span className="text-2xl font-black">→</span>
        <AnimatePresence mode="popLayout">
          <motion.div key={`${a}${b}`} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex gap-2">
            <div className="rounded-2xl bg-amber-300 px-3 py-2 text-center font-black text-ink-900">retenue<br />{a & b}</div>
            <div className="rounded-2xl bg-emerald-400 px-3 py-2 text-center font-black text-ink-900">somme<br />{a ^ b}</div>
          </motion.div>
        </AnimatePresence>
      </div>
    </Frame>
  );
}

/* ---------------- Réseau ---------------- */
function Network() {
  const [run, setRun] = useState(true);
  const t = useTick(70, run);
  const p = (t % 100) / 100;
  const nodes = [[30, 60], [130, 25], [230, 60], [330, 30]];
  const seg = Math.min(2, Math.floor(p * 3));
  const local = p * 3 - seg;
  const [x1, y1] = nodes[seg];
  const [x2, y2] = nodes[seg + 1];
  return (
    <Frame title="Un paquet sur le réseau" running={run} onToggle={() => setRun((r) => !r)} caption="Les données sont découpées en paquets. Chaque paquet porte l’adresse IP de destination et passe de routeur en routeur jusqu’à elle.">
      <svg viewBox="0 0 360 100" className="w-full">
        {nodes.slice(0, -1).map((n, i) => <path key={i} d={`M${n[0]} ${n[1]} L${nodes[i + 1][0]} ${nodes[i + 1][1]}`} stroke="#cbd5e1" strokeWidth="3" strokeDasharray="6 4" />)}
        {nodes.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="14" fill={i === 0 ? '#3b6cf6' : i === 3 ? '#10b981' : '#64748b'} />
            <text x={x} y={y + 4} textAnchor="middle" fontSize="11">{i === 0 ? '💻' : i === 3 ? '🖥️' : '📡'}</text>
          </g>
        ))}
        <g transform={`translate(${x1 + (x2 - x1) * local} ${y1 + (y2 - y1) * local})`}>
          <rect x="-16" y="-8" width="32" height="16" rx="4" fill="#f59e0b" />
          <text y="4" textAnchor="middle" fontSize="8" fontWeight="900">IP</text>
        </g>
      </svg>
    </Frame>
  );
}

const SCENES: Record<string, () => JSX.Element> = {
  binary: Binary,
  gates: Gates,
  transistor: Transistor,
  adder: Adder,
  'cpu-cycle': CpuCycle,
  pipeline: Pipeline,
  'memory-hierarchy': MemoryHierarchy,
  bus: Bus,
  storage: Storage,
  motherboard: Motherboard,
  network: Network,
  'gpu-pipeline': GpuPipeline,
  transforms: Transforms,
  'vulkan-frame': VulkanFrame,
};
export const ANIMATIONS = Object.keys(SCENES);

export default function Anim({ name }: { name: string }) {
  const Scene = SCENES[name.trim()];
  if (!Scene) return <div className="my-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-600">Animation inconnue : {name}</div>;
  return <Scene />;
}
