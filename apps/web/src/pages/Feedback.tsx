import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Bug, Lightbulb, Sparkles, BookOpen, HelpCircle, ThumbsUp, Send, MessageCircleReply } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useFeedback } from '../lib/feedback';
import { useI18n } from '../lib/i18n';
import { PageTitle, Loading } from '../components/ui';
import Duo from '../components/Duo';

interface Item {
  id: string; kind: string; title: string; body: string; status: string; votes: number; adminReply: string | null; createdAt: string; author: string; mine: boolean; voted: boolean;
}

export const KIND = {
  bug: { label: 'Bug', icon: Bug, color: 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300' },
  idea: { label: 'Nouvelle fonctionnalité', icon: Lightbulb, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  improvement: { label: 'Amélioration', icon: Sparkles, color: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300' },
  content: { label: 'Contenu des cours', icon: BookOpen, color: 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300' },
  other: { label: 'Autre', icon: HelpCircle, color: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300' },
} as const;

export const STATUS: Record<string, { label: string; color: string }> = {
  new: { label: 'Nouveau', color: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300' },
  planned: { label: 'Prévu', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' },
  in_progress: { label: 'En cours', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  done: { label: 'Réalisé', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  rejected: { label: 'Écarté', color: 'bg-rose-100 text-rose-600' },
};

export default function FeedbackPage() {
  const { t } = useI18n();
  const { toast } = useFeedback();
  const loc = useLocation();
  const [sort, setSort] = useState<'top' | 'new'>('top');
  const { data, reload } = useApi<Item[]>(`/feedback?sort=${sort}`, [sort]);
  const [form, setForm] = useState({ kind: 'idea' as keyof typeof KIND, title: '', body: '' });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/feedback', { body: { ...form, page: (loc.state as { from?: string } | null)?.from } });
      setForm({ kind: form.kind, title: '', body: '' });
      setSent(true);
      reload();
      setTimeout(() => setSent(false), 4000);
    } catch (err) {
      toast((err as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function vote(it: Item) {
    try {
      await api(`/feedback/${it.id}/vote`, { body: {} });
      reload();
    } catch (err) {
      toast((err as ApiError).message, 'error');
    }
  }

  return (
    <div>
      <PageTitle title={t('Avis et idées')} subtitle={t('Dis aux développeurs ce qui ne va pas, ce qui pourrait être mieux et ce que tu aimerais voir arriver.')} />
      <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
        <form onSubmit={send} className="card space-y-3 self-start lg:sticky lg:top-20">
          <AnimatePresence mode="wait">
            {sent ? (
              <motion.div key="merci" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center py-4 text-center">
                <Duo scene="highfive" size={90} />
                <div className="mt-2 text-lg font-black">{t('Merci, c’est envoyé !')}</div>
                <div className="muted text-sm">{t('Les développeurs lisent chaque message. Tu peux suivre son statut dans la liste.')}</div>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                  {(Object.keys(KIND) as (keyof typeof KIND)[]).map((k) => {
                    const K = KIND[k];
                    return (
                      <button type="button" key={k} onClick={() => setForm({ ...form, kind: k })} className={clsx('flex flex-col items-center gap-1 rounded-2xl border-2 p-2 text-xs font-black transition', form.kind === k ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/30' : 'border-ink-100 dark:border-ink-800')}>
                        <K.icon size={18} /> {t(K.label)}
                      </button>
                    );
                  })}
                </div>
                <input className="input" placeholder={t('Titre (ex. : mode hors ligne pour les cours)')} value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                <textarea className="input min-h-[140px]" placeholder={form.kind === 'bug' ? t('Que s’est-il passé ? Qu’attendais-tu ? Sur quelle page ?') : t('Décris ton idée et pourquoi elle serait utile.')} value={form.body} maxLength={4000} onChange={(e) => setForm({ ...form, body: e.target.value })} />
                <button className="btn-primary w-full" disabled={busy || form.title.trim().length < 4 || form.body.trim().length < 10}>
                  <Send size={16} /> {t('Envoyer')}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </form>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="section-title flex-1">{t('Idées de la communauté')}</h2>
            {(['top', 'new'] as const).map((s) => (
              <button key={s} onClick={() => setSort(s)} className={clsx('chip cursor-pointer', sort === s && 'bg-brand-500 text-white')}>{s === 'top' ? t('Les plus votées') : t('Récentes')}</button>
            ))}
          </div>
          {!data ? (
            <Loading />
          ) : !data.length ? (
            <p className="muted card text-sm">{t('Aucune idée pour le moment : sois le premier !')}</p>
          ) : (
            <div className="space-y-3">
              {data.map((it, i) => {
                const K = KIND[it.kind as keyof typeof KIND] ?? KIND.other;
                return (
                  <motion.div key={it.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }} className="card flex gap-3 !p-4">
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => vote(it)} className={clsx('flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-2xl border-2 text-sm font-black', it.voted ? 'border-brand-400 bg-brand-50 text-brand-600 dark:bg-brand-900/30' : 'border-ink-100 dark:border-ink-800')}>
                      <ThumbsUp size={16} className={it.voted ? 'fill-brand-300' : ''} /> {it.votes}
                    </motion.button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={clsx('chip', K.color)}><K.icon size={12} /> {t(K.label)}</span>
                        <span className={clsx('chip', STATUS[it.status]?.color)}>{t(STATUS[it.status]?.label ?? it.status)}</span>
                        {it.mine && <span className="chip">{t('ton avis')}</span>}
                      </div>
                      <div className="mt-1 font-black">{it.title}</div>
                      <p className="muted mt-0.5 whitespace-pre-line text-sm">{it.body}</p>
                      {it.adminReply && (
                        <div className="mt-2 flex gap-2 rounded-2xl bg-brand-50 p-2 text-sm dark:bg-brand-900/20">
                          <MessageCircleReply size={16} className="mt-0.5 shrink-0 text-brand-500" />
                          <span><b>{t('Réponse de l’équipe :')}</b> {it.adminReply}</span>
                        </div>
                      )}
                      <div className="muted mt-1 text-xs">{it.author} · {new Date(it.createdAt).toLocaleDateString()}</div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
