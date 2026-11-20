import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import clsx from 'clsx';
import Mascot, { type Mood } from './Mascot';

export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Codemori`;
  }, [title]);
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl text-ink-900 dark:text-white sm:text-3xl">{title}</h1>
        {subtitle && <p className="muted mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function ProgressBar({ value, className, color = 'bg-brand-500' }: { value: number; className?: string; color?: string }) {
  return (
    <div className={clsx('h-3 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800', className)}>
      <motion.div className={clsx('h-full rounded-full', color)} initial={{ width: 0 }} animate={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
    </div>
  );
}

export function Ring({ value, size = 64, stroke = 8, color = '#3b6cf6', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-ink-100 dark:stroke-ink-800" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }}
          transition={{ duration: 0.8 }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-extrabold">{children}</div>
    </div>
  );
}

export function Loading({ text = 'Chargement…' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Mascot mood="thinking" size={110} />
      <p className="muted mt-2 font-bold">{text}</p>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center py-10 text-center">
      <Mascot mood="sad" size={110} />
      <p className="mt-3 font-bold">{message}</p>
      {onRetry && (
        <button className="btn-outline mt-4" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}

export function MascotSays({ mood = 'neutral', children, size = 90, className }: { mood?: Mood; children: ReactNode; size?: number; className?: string }) {
  return (
    <div className={clsx('flex items-end gap-2', className)}>
      <div className="shrink-0">
        <Mascot mood={mood} size={size} />
      </div>
      <motion.div
        key={String(children).slice(0, 40)}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="relative mb-6 rounded-3xl rounded-bl-md border-2 border-ink-200 bg-white px-4 py-3 font-semibold shadow-soft dark:border-ink-700 dark:bg-ink-900"
      >
        {children}
      </motion.div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 p-3 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className={clsx('card scrollbar-thin max-h-[92vh] w-full overflow-y-auto', wide ? 'max-w-4xl' : 'max-w-lg')}
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl">{title}</h2>
              <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Empty({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center py-10 text-center">
      <Mascot mood="explain" size={100} />
      <h3 className="mt-2 text-lg">{title}</h3>
      {text && <p className="muted mt-1 max-w-md">{text}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** Histogramme minimaliste en SVG. */
export function Bars({ data, height = 120, color = '#3b6cf6', label }: { data: { key: string; value: number; title?: string }[]; height?: number; color?: string; label?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {data.map((d) => (
        <div key={d.key} className="group relative flex h-full flex-1 flex-col justify-end">
          <motion.div
            className="min-h-[3px] w-full rounded-t-md"
            style={{ background: color, opacity: d.value ? 1 : 0.2 }}
            initial={{ height: 0 }}
            animate={{ height: `${(d.value / max) * 100}%` }}
            transition={{ duration: 0.5 }}
          />
          <div className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-900 px-2 py-1 text-xs font-bold text-white group-hover:block">
            {d.title ?? d.key} : {label ? label(d.value) : d.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LangBadge({ lang }: { lang: string }) {
  const map: Record<string, string> = { rust: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', cpp: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300', java: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
  const name: Record<string, string> = { rust: 'Rust', cpp: 'C++', java: 'Java' };
  return <span className={clsx('chip', map[lang])}>{name[lang] ?? lang}</span>;
}
