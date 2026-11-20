import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Send, X, Sparkles, Loader2, BookOpen, GitCompare, Bug } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useFeedback } from '../lib/feedback';
import Mascot from './Mascot';
import Markdown from './Markdown';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  source?: string;
}

const WELCOME =
  'Coucou, je suis **Kiri** ! 👋 Pose-moi une question sur une notion (*ownership*, *pointeurs*, *interfaces*…), demande une **comparaison** entre Rust, C++ et Java, ou colle un **message d’erreur** : je t’explique tout, sans te donner la solution toute faite. 😉';

export default function Assistant() {
  const { assistant, assistantRequest } = useFeedback();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'assistant', content: WELCOME }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<boolean | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (assistantRequest.open) {
      setOpen(true);
      if (assistantRequest.prefill) setInput(assistantRequest.prefill);
    }
  }, [assistantRequest]);

  useEffect(() => {
    if (open && ai === null) api<{ ai: boolean }>('/assistant/status').then((s) => setAi(s.ai)).catch(() => setAi(false));
  }, [open, ai]);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [msgs, busy]);

  async function send(text = input) {
    const message = text.trim();
    if (!message || busy) return;
    setInput('');
    const history = msgs.filter((m) => m.content !== WELCOME).slice(-8).map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: 'user', content: message }]);
    setBusy(true);
    try {
      const r = await api<{ answer: string; source: string }>('/assistant/ask', {
        body: { message, history, context: { language: assistant.language, chapterSlug: assistant.chapterSlug, exerciseId: assistant.exerciseId, code: assistant.getCode?.() } },
      });
      setMsgs((m) => [...m, { role: 'assistant', content: r.answer, source: r.source }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: `Oups : ${(e as ApiError).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  const quick = [
    { icon: BookOpen, label: 'Explique la notion', text: assistant.label ? `Peux-tu m’expliquer la notion travaillée dans « ${assistant.label} » ?` : 'Explique-moi les références' },
    { icon: GitCompare, label: 'Comparer les langages', text: 'Quelle est la différence entre Rust, C++ et Java pour la gestion de la mémoire ?' },
    { icon: Bug, label: 'Mon code ne marche pas', text: 'Mon code ne fonctionne pas, peux-tu me donner une piste sans la solution ?' },
  ];

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-20 right-4 z-40 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-gradient-to-br from-brand-400 to-violet-500 shadow-xl dark:border-ink-800 lg:bottom-6"
        aria-label="Ouvrir l’assistante Kiri"
      >
        <div className="mt-10">
          <Mascot mood="happy" size={72} animate={false} />
        </div>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            className="fixed inset-x-2 bottom-2 z-50 flex h-[78vh] flex-col overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-2xl dark:border-ink-700 dark:bg-ink-900 sm:inset-x-auto sm:right-4 sm:w-[420px] lg:bottom-6"
          >
            <div className="flex items-center gap-2 bg-gradient-to-r from-brand-500 to-violet-500 px-3 py-2 text-white">
              <div className="-my-3">
                <Mascot mood={busy ? 'thinking' : 'explain'} size={52} animate={false} />
              </div>
              <div className="flex-1">
                <div className="font-black">Kiri</div>
                <div className="text-xs opacity-90">
                  {ai ? (
                    <span className="flex items-center gap-1">
                      <Sparkles size={12} /> Assistante IA
                    </span>
                  ) : (
                    'Assistante pédagogique'
                  )}
                  {assistant.label ? ` · ${assistant.label}` : ''}
                </div>
              </div>
              <button className="rounded-xl p-1.5 hover:bg-white/20" onClick={() => setOpen(false)} aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-3">
              {msgs.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex'}>
                  <div className={m.role === 'user' ? 'max-w-[85%] rounded-2xl rounded-br-md bg-brand-500 px-3 py-2 text-sm font-semibold text-white' : 'max-w-[92%] rounded-2xl rounded-bl-md bg-ink-100 px-3 py-2 text-sm dark:bg-ink-800'}>
                    {m.role === 'user' ? m.content : <Markdown className="text-sm [&_p]:my-1.5 [&_pre]:text-xs">{m.content}</Markdown>}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-sm text-ink-400">
                  <Loader2 size={14} className="animate-spin" /> Kiri réfléchit…
                </div>
              )}
              <div ref={bottom} />
            </div>
            {msgs.length <= 1 && (
              <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                {quick.map((q) => (
                  <button key={q.label} className="chip cursor-pointer hover:bg-brand-100 dark:hover:bg-brand-900/40" onClick={() => send(q.text)}>
                    <q.icon size={12} /> {q.label}
                  </button>
                ))}
              </div>
            )}
            <form
              className="flex gap-2 border-t border-ink-200 p-2 dark:border-ink-800"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="Écris ta question…"
                className="input max-h-32 min-h-[44px] resize-none py-2 text-sm"
              />
              <button className="btn-primary px-3" disabled={busy || !input.trim()} aria-label="Envoyer">
                <Send size={18} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
