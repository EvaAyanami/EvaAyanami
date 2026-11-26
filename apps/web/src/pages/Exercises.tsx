import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Check, Search } from 'lucide-react';
import { useApi, useDebounced } from '../lib/hooks';
import { LANG_META, langMeta, LEVEL_NAMES, levelName, TYPE_LABEL } from '../lib/api';
import { PageTitle, Loading, ErrorBox, LangBadge, Empty } from '../components/ui';
import { t } from '../lib/i18n';

interface List {
  total: number;
  page: number;
  pages: number;
  items: { id: string; type: string; kind: string; title: string; language: string; level: number; difficulty: number; xp: number; chapter: { slug: string; title: string } | null; solved: boolean; attempts: number }[];
}

export default function Exercises() {
  const [language, setLanguage] = useState('');
  const [type, setType] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search, 300);
  const params = new URLSearchParams({ ...(language && { language }), ...(type && { type }), ...(level && { level }), status, ...(q && { search: q }), page: String(page) });
  const { data, error, loading, reload } = useApi<List>(`/exercises?${params}`, [params.toString()]);

  const sel = 'input !w-auto !py-2 text-sm';
  return (
    <div>
      <PageTitle title={t("Exercices")} subtitle="Toute la banque d’exercices interactifs, filtrable par langage, type et niveau." />
      <div className="card mb-4 flex flex-wrap gap-2 !p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-3 top-3 text-ink-400" />
          <input className="input !py-2 pl-9 text-sm" placeholder={t("Rechercher (titre, notion…)")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className={sel} value={language} onChange={(e) => { setLanguage(e.target.value); setPage(1); }}>
          <option value="">{t("Tous les langages")}</option>
          {Object.entries(LANG_META).map(([id, m]) => <option key={id} value={id}>{m.name}</option>)}
        </select>
        <select className={sel} value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">{t("Tous les types")}</option>
          {Object.entries(TYPE_LABEL).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
        </select>
        <select className={sel} value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }}>
          <option value="">{t("Tous les niveaux")}</option>
          {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>{levelName(l)}</option>)}
        </select>
        <select className={sel} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="all">{t("Tous")}</option>
          <option value="todo">{t("À faire")}</option>
          <option value="solved">{t("Réussis")}</option>
        </select>
      </div>
      {loading && !data ? <Loading /> : error || !data ? <ErrorBox message={error ?? 'Erreur'} onRetry={reload} /> : data.items.length === 0 ? (
        <Empty title={t("Aucun exercice trouvé")} text="Essaie d’autres filtres." />
      ) : (
        <>
          <div className="muted mb-2 text-sm font-bold">{data.total} exercices</div>
          <div className="grid gap-2">
            {data.items.map((e) => (
              <Link key={e.id} to={`/exercice/${e.id}`} className="card flex items-center gap-3 !p-3 transition hover:shadow-lg">
                <div className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', e.solved ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30' : 'bg-ink-100 dark:bg-ink-800')}>
                  {e.solved ? <Check size={18} /> : langMeta(e.language)?.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-extrabold">{e.title}</div>
                  <div className="muted truncate text-xs font-bold">{e.chapter?.title} · {TYPE_LABEL[e.type]}{e.kind === 'miniproject' && ' · Mini-projet'}</div>
                </div>
                <LangBadge lang={e.language} />
                <span className="chip hidden sm:inline-flex">{'★'.repeat(e.difficulty)}</span>
                <span className="hidden text-sm font-bold text-amber-500 sm:block">+{e.xp}</span>
              </Link>
            ))}
          </div>
          {data.pages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button className="btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("Précédent")}</button>
              <span className="text-sm font-bold">{page} / {data.pages}</span>
              <button className="btn-outline btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>{t("Suivant")}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
