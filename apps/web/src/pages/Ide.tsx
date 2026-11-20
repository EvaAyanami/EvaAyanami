import { lazy, Suspense, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Play, Hammer, RotateCcw, Save, Trash2, FilePlus2, Loader2, Maximize2, Minimize2, Terminal, FileCode2 } from 'lucide-react';
import { api, ApiError, LANG_META } from '../lib/api';
import { useFeedback } from '../lib/feedback';
import { PageTitle } from '../components/ui';
import Markdown from '../components/Markdown';
import type { EditorDiagnostic } from '../components/CodeEditor';

const CodeEditor = lazy(() => import('../components/CodeEditor'));

interface Snippet {
  id: string;
  language: string;
  name: string;
  code: string;
  updatedAt: string;
}
interface RunResult {
  compile: { ok: boolean; stderr: string; timeMs: number; diagnostics: EditorDiagnostic[] };
  run: { stdout: string; stderr: string; exitCode: number; timeMs: number; timedOut: boolean } | null;
  help: { title: string; explanation: string; tip: string }[];
  error?: string;
}

const LS = (lang: string) => `cm-ide-${lang}`;

export default function Ide() {
  const { toast, setAssistant } = useFeedback();
  const [lang, setLang] = useState<string>(() => localStorage.getItem('cm-ide-lang') ?? 'rust');
  const [templates, setTemplates] = useState<Record<string, { code: string }>>({});
  const [code, setCode] = useState('');
  const [stdin, setStdin] = useState('');
  const [result, setResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState<'run' | 'compile' | null>(null);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [current, setCurrent] = useState<Snippet | null>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    api<Record<string, { code: string }>>('/ide/templates').then((t) => {
      setTemplates(t);
      setCode(localStorage.getItem(LS(lang)) ?? t[lang].code);
    });
    api<Snippet[]>('/ide/snippets').then(setSnippets);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setAssistant({ language: lang, getCode: () => code, label: 'IDE libre' });
  }, [lang, code, setAssistant]);

  // Sauvegarde automatique locale du brouillon
  useEffect(() => {
    if (!code) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(LS(lang), code);
      } catch {
        /* stockage plein */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [code, lang]);

  function switchLang(l: string) {
    setLang(l);
    localStorage.setItem('cm-ide-lang', l);
    setCurrent(null);
    setResult(null);
    setCode(localStorage.getItem(LS(l)) ?? templates[l]?.code ?? '');
  }

  async function exec(compileOnly: boolean) {
    setBusy(compileOnly ? 'compile' : 'run');
    try {
      const r = await api<RunResult>('/ide/run', { body: { language: lang, code, stdin, compileOnly } });
      setResult(r);
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const name = current?.name ?? prompt('Nom du fichier :', `programme-${snippets.length + 1}`);
    if (!name) return;
    try {
      const s = await api<Snippet>('/ide/snippets', { body: { id: current?.id, language: lang, name, code } });
      setCurrent(s);
      setSnippets((list) => [s, ...list.filter((x) => x.id !== s.id)]);
      toast('Fichier enregistré', 'success');
    } catch (e) {
      toast((e as ApiError).message, 'error');
    }
  }

  async function remove(s: Snippet) {
    if (!confirm(`Supprimer « ${s.name} » ?`)) return;
    await api(`/ide/snippets/${s.id}`, { method: 'DELETE' });
    setSnippets((l) => l.filter((x) => x.id !== s.id));
    if (current?.id === s.id) setCurrent(null);
  }

  return (
    <div className={clsx(full && 'fixed inset-0 z-50 overflow-auto bg-ink-50 p-3 dark:bg-ink-950')}>
      {!full && <PageTitle title="IDE" subtitle="Un environnement libre pour expérimenter : ton code est compilé et exécuté dans un bac à sable isolé." />}
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="card !p-3">
          <div className="mb-3 grid grid-cols-3 gap-1 rounded-2xl bg-ink-100 p-1 dark:bg-ink-800">
            {Object.entries(LANG_META).map(([id, m]) => (
              <button key={id} onClick={() => switchLang(id)} className={clsx('rounded-xl py-1.5 text-xs font-black', lang === id ? 'bg-white shadow dark:bg-ink-900' : 'text-ink-500')} title={m.name}>
                {m.icon} {m.name}
              </button>
            ))}
          </div>
          <button
            className="btn-outline btn-sm mb-2 w-full"
            onClick={() => {
              setCurrent(null);
              setCode(templates[lang]?.code ?? '');
            }}
          >
            <FilePlus2 size={14} /> Nouveau ({LANG_META[lang].file})
          </button>
          <div className="muted mb-1 mt-3 text-xs font-extrabold uppercase">Mes fichiers</div>
          <div className="scrollbar-thin max-h-72 space-y-1 overflow-y-auto">
            {snippets.filter((s) => s.language === lang).length === 0 && <p className="muted text-xs">Aucun fichier enregistré.</p>}
            {snippets
              .filter((s) => s.language === lang)
              .map((s) => (
                <div key={s.id} className={clsx('group flex items-center gap-1 rounded-xl px-2 py-1.5 text-sm', current?.id === s.id ? 'bg-brand-50 dark:bg-brand-900/30' : 'hover:bg-ink-100 dark:hover:bg-ink-800')}>
                  <button
                    className="flex flex-1 items-center gap-1 truncate text-left font-bold"
                    onClick={() => {
                      setCurrent(s);
                      setCode(s.code);
                    }}
                  >
                    <FileCode2 size={14} /> {s.name}
                  </button>
                  <button className="opacity-0 group-hover:opacity-100" onClick={() => remove(s)} aria-label="Supprimer">
                    <Trash2 size={14} className="text-rose-500" />
                  </button>
                </div>
              ))}
          </div>
        </aside>
        <div className="card flex flex-col overflow-hidden !p-0">
          <div className="flex flex-wrap items-center gap-1 border-b border-ink-200 px-3 py-2 dark:border-ink-800">
            <span className="rounded-lg bg-ink-100 px-2 py-1 font-mono text-xs font-bold dark:bg-ink-800">{current?.name ?? LANG_META[lang].file}</span>
            <div className="flex-1" />
            <button className="btn-ghost btn-sm" onClick={() => exec(true)} disabled={!!busy}>
              {busy === 'compile' ? <Loader2 size={16} className="animate-spin" /> : <Hammer size={16} />} Compiler
            </button>
            <button className="btn-primary btn-sm" onClick={() => exec(false)} disabled={!!busy}>
              {busy === 'run' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Exécuter
            </button>
            <button className="btn-ghost btn-sm" onClick={save} title="Enregistrer">
              <Save size={16} />
            </button>
            <button className="btn-ghost btn-sm" onClick={() => confirm('Réinitialiser avec le modèle ?') && setCode(templates[lang]?.code ?? '')} title="Réinitialiser">
              <RotateCcw size={16} />
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setFull((f) => !f)} title="Agrandir">
              {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
          <Suspense fallback={<div className="h-[460px]" />}>
            <CodeEditor value={code} onChange={setCode} language={lang} height={full ? 'calc(100vh - 320px)' : 460} diagnostics={result?.compile.diagnostics} onRun={() => exec(false)} />
          </Suspense>
          <div className="grid border-t border-ink-200 dark:border-ink-800 md:grid-cols-[1fr_2fr]">
            <div className="flex flex-col border-b border-ink-800 bg-ink-900 md:border-b-0 md:border-r">
              <div className="px-3 py-1.5 text-xs font-bold text-ink-400">Entrée (stdin)</div>
              <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} className="h-44 resize-none bg-ink-900 p-3 font-mono text-xs text-ink-100 outline-none" placeholder="Données envoyées au programme…" />
            </div>
            <div className="scrollbar-thin h-52 overflow-auto bg-ink-950 p-3 font-mono text-xs leading-5 text-ink-100">
              <div className="mb-1 flex items-center gap-1 font-bold text-ink-400">
                <Terminal size={14} /> Console
              </div>
              {busy && <div className="text-cyan-400">⏳ {busy === 'compile' ? 'Compilation…' : 'Compilation et exécution…'}</div>}
              {!busy && !result && <div className="text-ink-500">Ctrl+Entrée pour exécuter.</div>}
              {!busy && result && (
                <>
                  {result.error && !result.compile.stderr && <div className="text-rose-400">{result.error}</div>}
                  <div className={result.compile.ok ? 'text-emerald-400' : 'text-rose-400'}>{result.compile.ok ? `✔ Compilé en ${result.compile.timeMs} ms` : '✘ Erreur de compilation'}</div>
                  {result.compile.stderr && <pre className={clsx('whitespace-pre-wrap', result.compile.ok ? 'text-amber-300' : 'text-rose-200')}>{result.compile.stderr}</pre>}
                  {result.run && (
                    <>
                      <pre className="mt-1 whitespace-pre-wrap">{result.run.stdout || <span className="text-ink-500">(aucune sortie)</span>}</pre>
                      {result.run.stderr && <pre className="whitespace-pre-wrap text-rose-300">{result.run.stderr}</pre>}
                      <div className={clsx('text-[11px]', result.run.exitCode === 0 ? 'text-ink-500' : 'text-rose-400')}>
                        {result.run.timedOut ? '⏱ Délai dépassé' : `Code de sortie ${result.run.exitCode}`} · {result.run.timeMs} ms
                      </div>
                    </>
                  )}
                  {result.help.map((h) => (
                    <div key={h.title} className="mt-2 rounded-xl border border-violet-400/40 bg-violet-500/10 p-2 font-sans">
                      <div className="font-extrabold text-violet-300">💡 {h.title}</div>
                      <Markdown className="text-[13px] text-ink-100 [&_p]:my-1">{`${h.explanation}\n\n**Astuce :** ${h.tip}`}</Markdown>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
