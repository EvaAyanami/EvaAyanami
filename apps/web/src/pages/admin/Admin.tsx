import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { Users, BookOpen, Trophy, Settings, AlertOctagon, Database, LayoutDashboard, FolderKanban, Plus, Save, Trash2, PlayCircle, ChevronLeft, Download, Upload } from 'lucide-react';
import { api, ApiError, LANG_META, LEVEL_NAMES, TYPE_LABEL } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useFeedback } from '../../lib/feedback';
import { PageTitle, Loading, ErrorBox, Bars, Modal } from '../../components/ui';

const TABS = [
  { to: '', label: 'Vue d’ensemble', icon: LayoutDashboard, end: true },
  { to: 'utilisateurs', label: 'Utilisateurs', icon: Users },
  { to: 'cours', label: 'Cours & exercices', icon: BookOpen },
  { to: 'projets', label: 'Projets', icon: FolderKanban },
  { to: 'recompenses', label: 'Récompenses', icon: Trophy },
  { to: 'parametres', label: 'Paramètres', icon: Settings },
  { to: 'journaux', label: 'Journaux', icon: AlertOctagon },
  { to: 'contenu', label: 'Import / export', icon: Database },
];

export default function Admin() {
  return (
    <div>
      <PageTitle title="Administration" subtitle="Gestion des contenus, des utilisateurs et de la plateforme." />
      <div className="scrollbar-thin mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-ink-100 p-1 dark:bg-ink-900">
        {TABS.map((t) => (
          <NavLink key={t.to} to={`/admin/${t.to}`} end={t.end} className={({ isActive }) => clsx('flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-extrabold', isActive ? 'bg-white text-brand-600 shadow dark:bg-ink-800 dark:text-brand-300' : 'text-ink-500')}>
            <t.icon size={16} /> {t.label}
          </NavLink>
        ))}
      </div>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="utilisateurs" element={<UsersTab />} />
        <Route path="cours" element={<Chapters />} />
        <Route path="cours/:id" element={<ChapterEditor />} />
        <Route path="projets" element={<ProjectsTab />} />
        <Route path="recompenses" element={<AchievementsTab />} />
        <Route path="parametres" element={<SettingsTab />} />
        <Route path="journaux" element={<Logs />} />
        <Route path="contenu" element={<ContentTab />} />
      </Routes>
    </div>
  );
}

function Overview() {
  const { data, error, loading, reload } = useApi<any>('/admin/overview');
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Erreur'} onRetry={reload} />;
  const c = data.counts;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Utilisateurs', c.users],
          ['Actifs (7 j)', c.active7],
          ['Tentatives (24 h)', c.attemptsToday],
          ['Tentatives (7 j)', c.attempts7],
          ['Chapitres', c.chapters],
          ['Exercices', c.exercises],
          ['Projets', c.projects],
          ['Erreurs (7 j)', c.errors],
        ].map(([l, v]) => (
          <div key={l} className="card !p-4">
            <div className="text-2xl font-black">{v}</div>
            <div className="muted text-xs font-bold">{l}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="section-title mb-2">Ressources</h3>
          <ul className="space-y-1 text-sm">
            <li>Service d’exécution : <b className={data.runner.ok === false ? 'text-rose-500' : 'text-emerald-500'}>{data.runner.ok === false ? 'injoignable' : `${data.runner.driver} · ${data.runner.active} actif(s), ${data.runner.queued} en file, ${data.runner.jobs} exécutions`}</b></li>
            <li>API : {data.system.rssMb} Mo RSS · tas {data.system.heapMb} Mo · uptime {Math.round(data.system.uptimeSec / 3600)} h · Node {data.system.node}</li>
            <li>Base de données : {data.system.dbSize}</li>
            <li>IA : {data.system.ai === 'none' ? 'désactivée' : data.system.ai}</li>
          </ul>
        </div>
        <div className="card">
          <h3 className="section-title mb-2">Tentatives par jour (30 j)</h3>
          <Bars data={data.perDay.map((d: any) => ({ key: d.day, value: d.attempts, title: `${d.day} (${d.users} utilisateurs)` }))} />
        </div>
        <div className="card lg:col-span-2">
          <h3 className="section-title mb-2">Exercices les plus difficiles</h3>
          {data.hardest.length === 0 && <p className="muted text-sm">Pas encore assez de données.</p>}
          {data.hardest.map((h: any) => (
            <div key={h.id} className="flex gap-2 py-1 text-sm">
              <span className="chip">{h.language}</span>
              <span className="flex-1 font-bold">{h.title || h.id}</span>
              <span>{h.attempts} tentatives</span>
              <span className="font-black text-rose-500">{Math.round(h.successRate * 100)} %</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const { toast } = useFeedback();
  const [search, setSearch] = useState('');
  const { data, reload } = useApi<{ total: number; users: any[] }>(`/admin/users?search=${encodeURIComponent(search)}`, [search]);
  const act = async (id: string, body: object, msg: string) => {
    try {
      await api(`/admin/users/${id}`, { method: 'PATCH', body });
      toast(msg, 'success');
      reload();
    } catch (e) {
      toast((e as ApiError).message, 'error');
    }
  };
  return (
    <div className="card">
      <input className="input mb-3" placeholder="Rechercher par e-mail ou pseudo…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-500">
              <th className="p-2">Utilisateur</th><th className="p-2">Rôle</th><th className="p-2">XP</th><th className="p-2">Dernière activité</th><th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u.id} className="border-t border-ink-100 dark:border-ink-800">
                <td className="p-2"><div className="font-bold">{u.displayName} {u.disabled && <span className="chip bg-rose-100 text-rose-600">désactivé</span>}</div><div className="muted text-xs">@{u.username} · {u.email}</div></td>
                <td className="p-2">{u.role === 'ADMIN' ? '🛡️ Admin' : 'Apprenant'}</td>
                <td className="p-2">{u.xp} (niv. {u.level})</td>
                <td className="p-2 text-xs">{new Date(u.lastActiveAt).toLocaleString('fr-FR')}</td>
                <td className="flex flex-wrap gap-1 p-2">
                  <button className="btn-outline btn-sm" onClick={() => act(u.id, { role: u.role === 'ADMIN' ? 'USER' : 'ADMIN' }, 'Rôle modifié')}>{u.role === 'ADMIN' ? 'Retirer admin' : 'Promouvoir'}</button>
                  <button className="btn-outline btn-sm" onClick={() => act(u.id, { disabled: !u.disabled }, u.disabled ? 'Compte réactivé' : 'Compte désactivé')}>{u.disabled ? 'Réactiver' : 'Désactiver'}</button>
                  {u.lockedUntil && new Date(u.lockedUntil) > new Date() && <button className="btn-outline btn-sm" onClick={() => act(u.id, { unlock: true }, 'Compte déverrouillé')}>Déverrouiller</button>}
                  <button className="btn-outline btn-sm" onClick={() => { const p = prompt('Nouveau mot de passe (8 caractères min.) :'); if (p) act(u.id, { password: p }, 'Mot de passe réinitialisé'); }}>Mot de passe</button>
                  <button className="btn-outline btn-sm" onClick={() => confirm('Réinitialiser toute la progression ?') && act(u.id, { resetProgress: true }, 'Progression réinitialisée')}>Reset</button>
                  <button className="btn-danger btn-sm" onClick={async () => { if (confirm(`Supprimer ${u.email} ?`)) { await api(`/admin/users/${u.id}`, { method: 'DELETE' }).catch((e) => toast(e.message, 'error')); reload(); } }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="muted mt-2 text-xs">{data?.total ?? 0} utilisateurs</div>
    </div>
  );
}

function Chapters() {
  const [lang, setLang] = useState('rust');
  const nav = useNavigate();
  const { toast } = useFeedback();
  const { data, reload } = useApi<any[]>(`/admin/chapters?language=${lang}`, [lang]);
  async function create() {
    const title = prompt('Titre du nouveau chapitre :');
    if (!title) return;
    const slug = `${lang}-${title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    try {
      const c = await api<any>('/admin/chapters', { body: { slug, languageId: lang, level: 1, order: 99, title, summary: '', concepts: [], sections: [{ title: 'Introduction', body: 'À rédiger…' }], minutes: 20, published: false, examPass: 70 } });
      nav(`/admin/cours/${c.id}`);
    } catch (e) {
      toast((e as ApiError).message, 'error');
      reload();
    }
  }
  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {Object.entries(LANG_META).map(([id, m]) => (
          <button key={id} onClick={() => setLang(id)} className={clsx('btn-sm btn', lang === id ? 'bg-brand-500 text-white' : 'bg-ink-100 dark:bg-ink-800')}>{m.icon} {m.name}</button>
        ))}
        <div className="flex-1" />
        <button className="btn-primary btn-sm" onClick={create}><Plus size={14} /> Nouveau chapitre</button>
      </div>
      {[1, 2, 3, 4, 5].map((lv) => (
        <div key={lv} className="mb-4">
          <h3 className="mb-1 text-sm font-black text-ink-500">{lv}. {LEVEL_NAMES[lv]}</h3>
          {data?.filter((c) => c.level === lv).map((c) => (
            <button key={c.id} onClick={() => nav(`/admin/cours/${c.id}`)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-ink-50 dark:hover:bg-ink-800">
              <span className="w-6 text-ink-400">{c.order + 1}</span>
              <span className="flex-1 font-bold">{c.title}</span>
              {!c.published && <span className="chip">brouillon</span>}
              {c.customized && <span className="chip bg-violet-100 text-violet-700">modifié</span>}
              <span className="muted text-xs">{c._count.exercises} exercices</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

const TEMPLATES: Record<string, object> = {
  mcq: { type: 'mcq', prompt: 'Question ?', choices: ['Réponse A', 'Réponse B'], answer: 0, explanation: '', hints: [], concepts: [], difficulty: 1 },
  fill: { type: 'fill', prompt: 'Complète le code.', code: 'let {{?}} x = 5;', blanks: [['mut']], explanation: '', hints: [], concepts: [], difficulty: 1 },
  order: { type: 'order', prompt: 'Remets les lignes dans l’ordre.', lines: ['ligne 1', 'ligne 2'], explanation: '', hints: [], concepts: [], difficulty: 1 },
  predict: { type: 'predict', prompt: 'Que va afficher ce programme ?', code: '', output: '', explanation: '', hints: [], concepts: [], difficulty: 1 },
  bugfix: { type: 'bugfix', prompt: 'Trouve et corrige l’erreur.', code: '', bugLines: [1], choices: ['Explication A', 'Explication B'], answer: 0, solution: '', tests: [{ input: '', output: '' }], explanation: '', hints: [], concepts: [], difficulty: 2 },
  code: { type: 'code', prompt: 'Écris un programme qui…', starter: '', solution: '', tests: [{ input: '1', output: '1' }, { input: '2', output: '2', hidden: true }], require: [], forbid: [], explanation: '', hints: [], concepts: [], difficulty: 2 },
};

function ChapterEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { toast } = useFeedback();
  const { data, error, loading, reload } = useApi<any>(`/admin/chapters/${id}`, [id]);
  const [ch, setCh] = useState<any>(null);
  const [edit, setEdit] = useState<{ id?: string; json: string; meta?: any; checks?: { ok: boolean; message: string }[] } | null>(null);
  useEffect(() => {
    if (data) setCh({ ...data, conceptsText: data.concepts.join(', ') });
  }, [data]);
  if (loading && !data) return <Loading />;
  if (error || !ch) return <ErrorBox message={error ?? 'Erreur'} onRetry={reload} />;

  async function saveChapter() {
    try {
      await api(`/admin/chapters/${id}`, {
        method: 'PUT',
        body: { title: ch.title, summary: ch.summary, level: Number(ch.level), order: Number(ch.order), minutes: Number(ch.minutes), published: ch.published, examPass: Number(ch.examPass), concepts: ch.conceptsText.split(',').map((s: string) => s.trim()).filter(Boolean), sections: ch.sections },
      });
      toast('Chapitre enregistré', 'success');
    } catch (e) {
      toast((e as ApiError).message, 'error');
    }
  }

  async function openExercise(exId: string) {
    const r = await api<any>(`/admin/exercises/${exId}`);
    setEdit({ id: exId, json: JSON.stringify(r.def, null, 2), meta: r.meta });
  }

  async function saveExercise() {
    if (!edit) return;
    let def: any;
    try {
      def = JSON.parse(edit.json);
    } catch {
      return toast('JSON invalide', 'error');
    }
    try {
      if (edit.id) await api(`/admin/exercises/${edit.id}`, { method: 'PUT', body: { def } });
      else await api('/admin/exercises', { body: { def, meta: edit.meta } });
      toast('Exercice enregistré', 'success');
      if (!edit.id) setEdit(null);
      reload();
    } catch (e) {
      toast((e as ApiError).message, 'error');
    }
  }

  async function verify() {
    if (!edit?.id) return;
    const r = await api<{ checks: { ok: boolean; message: string }[] }>(`/admin/exercises/${edit.id}/verify`, { body: {} });
    setEdit({ ...edit, checks: r.checks });
  }

  function newExercise(kind: string, type: string) {
    const def = { id: `${ch.slug}-${kind}-${Date.now().toString(36)}`, ...TEMPLATES[type] };
    setEdit({ json: JSON.stringify(def, null, 2), meta: { kind, chapterId: ch.id, language: ch.languageId, level: ch.level, order: ch.exercises.length } });
  }

  return (
    <div className="space-y-4">
      <button className="btn-ghost btn-sm" onClick={() => nav('/admin/cours')}><ChevronLeft size={16} /> Chapitres</button>
      <div className="card space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div><label className="label">Titre</label><input className="input" value={ch.title} onChange={(e) => setCh({ ...ch, title: e.target.value })} /></div>
          <div><label className="label">Notions (séparées par des virgules)</label><input className="input" value={ch.conceptsText} onChange={(e) => setCh({ ...ch, conceptsText: e.target.value })} /></div>
        </div>
        <div><label className="label">Résumé</label><textarea className="input" rows={2} value={ch.summary} onChange={(e) => setCh({ ...ch, summary: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div><label className="label">Niveau</label><select className="input" value={ch.level} onChange={(e) => setCh({ ...ch, level: e.target.value })}>{[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>{l} — {LEVEL_NAMES[l]}</option>)}</select></div>
          <div><label className="label">Ordre</label><input type="number" className="input" value={ch.order} onChange={(e) => setCh({ ...ch, order: e.target.value })} /></div>
          <div><label className="label">Durée (min)</label><input type="number" className="input" value={ch.minutes} onChange={(e) => setCh({ ...ch, minutes: e.target.value })} /></div>
          <div><label className="label">Seuil examen (%)</label><input type="number" className="input" value={ch.examPass} onChange={(e) => setCh({ ...ch, examPass: e.target.value })} /></div>
          <label className="flex items-end gap-2 pb-3 font-bold"><input type="checkbox" checked={ch.published} onChange={(e) => setCh({ ...ch, published: e.target.checked })} className="h-5 w-5" /> Publié</label>
        </div>
        <h3 className="section-title">Sections du cours (Markdown)</h3>
        {ch.sections.map((s: any, i: number) => (
          <div key={i} className="rounded-2xl border border-ink-200 p-3 dark:border-ink-700">
            <div className="flex gap-2">
              <input className="input" value={s.title} onChange={(e) => setCh({ ...ch, sections: ch.sections.map((x: any, j: number) => (j === i ? { ...x, title: e.target.value } : x)) })} />
              <button className="btn-danger btn-sm" onClick={() => setCh({ ...ch, sections: ch.sections.filter((_: any, j: number) => j !== i) })}><Trash2 size={14} /></button>
            </div>
            <textarea className="input mt-2 font-mono text-xs" rows={10} value={s.body} onChange={(e) => setCh({ ...ch, sections: ch.sections.map((x: any, j: number) => (j === i ? { ...x, body: e.target.value } : x)) })} />
          </div>
        ))}
        <div className="flex gap-2">
          <button className="btn-outline btn-sm" onClick={() => setCh({ ...ch, sections: [...ch.sections, { title: 'Nouvelle section', body: '' }] })}><Plus size={14} /> Section</button>
          <div className="flex-1" />
          <button className="btn-primary" onClick={saveChapter}><Save size={16} /> Enregistrer le chapitre</button>
        </div>
      </div>

      <div className="card">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="section-title flex-1">Exercices, mini-projet et examen</h3>
          <select className="input !w-auto !py-1.5 text-sm" defaultValue="" onChange={(e) => { const [k, t] = e.target.value.split(':'); if (k) newExercise(k, t); e.target.value = ''; }}>
            <option value="">+ Ajouter…</option>
            {['practice', 'exam'].flatMap((k) => Object.keys(TEMPLATES).map((t) => <option key={k + t} value={`${k}:${t}`}>{k === 'exam' ? 'Examen' : 'Exercice'} — {TYPE_LABEL[t]}</option>))}
            <option value="miniproject:code">Mini-projet — Écrire du code</option>
          </select>
        </div>
        {ch.exercises.map((e: any) => (
          <button key={e.id} onClick={() => openExercise(e.id)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-ink-50 dark:hover:bg-ink-800">
            <span className="chip">{{ practice: 'Exercice', exam: 'Examen', miniproject: 'Mini-projet' }[e.kind as string] ?? e.kind}</span>
            <span className="chip">{TYPE_LABEL[e.type]}</span>
            <span className="flex-1 truncate">{e.title || e.prompt}</span>
            {e.customized && <span className="chip bg-violet-100 text-violet-700">modifié</span>}
          </button>
        ))}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Exercice ${edit.id}` : 'Nouvel exercice'} wide>
        {edit && (
          <>
            <p className="muted mb-2 text-xs">Définition complète (JSON) : consigne, réponses, solution, <b>tests</b> (ajoute <code>"hidden": true</code> pour un test caché), règles <code>require</code>/<code>forbid</code> (expressions régulières), indices.</p>
            <textarea className="input font-mono text-xs" rows={22} value={edit.json} onChange={(e) => setEdit({ ...edit, json: e.target.value })} spellCheck={false} />
            {edit.checks && <ul className="mt-2 space-y-1 text-sm">{edit.checks.map((c, i) => <li key={i} className={c.ok ? 'text-emerald-500' : 'text-rose-500'}>{c.ok ? '✔' : '✘'} {c.message}</li>)}</ul>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-primary" onClick={saveExercise}><Save size={16} /> Enregistrer</button>
              {edit.id && <button className="btn-outline" onClick={verify}><PlayCircle size={16} /> Vérifier (exécuter la solution)</button>}
              {edit.id && <button className="btn-danger" onClick={async () => { if (confirm('Supprimer cet exercice ?')) { await api(`/admin/exercises/${edit.id}`, { method: 'DELETE' }); setEdit(null); reload(); } }}><Trash2 size={16} /></button>}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function ProjectsTab() {
  const { toast } = useFeedback();
  const { data, reload } = useApi<any[]>('/admin/projects');
  const [edit, setEdit] = useState<{ id: string; json: string; kind: 'project' | 'step' } | null>(null);
  async function save() {
    if (!edit) return;
    try {
      const body = JSON.parse(edit.json);
      if (edit.kind === 'project') await api(`/admin/projects/${edit.id}`, { method: 'PUT', body });
      else await api(`/admin/exercises/${edit.id}`, { method: 'PUT', body: { def: body } });
      toast('Enregistré', 'success');
      setEdit(null);
      reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  return (
    <div className="space-y-3">
      {data?.map((p) => (
        <div key={p.id} className="card">
          <div className="flex items-center gap-2">
            <span className="chip">{LEVEL_NAMES[p.level]}</span>
            <h3 className="flex-1 font-black">{p.title}</h3>
            {!p.published && <span className="chip">masqué</span>}
            <button className="btn-outline btn-sm" onClick={() => setEdit({ id: p.id, kind: 'project', json: JSON.stringify({ title: p.title, summary: p.summary, description: p.description, objectives: p.objectives, constraints: p.constraints, published: p.published, level: p.level }, null, 2) })}>Modifier</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {p.steps.map((s: any) => (
              <button key={s.id} className="chip cursor-pointer" onClick={async () => { const r = await api<any>(`/admin/exercises/${s.id}`); setEdit({ id: s.id, kind: 'step', json: JSON.stringify({ title: r.def.title, prompt: r.def.prompt, hints: r.def.hints, xp: r.def.xp, starters: r.def.starters, solutions: r.def.solutions, tests: r.def.tests }, null, 2) }); }}>
                {s.order + 1}. {s.title}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Édition" wide>
        {edit && (
          <>
            <textarea className="input font-mono text-xs" rows={22} value={edit.json} onChange={(e) => setEdit({ ...edit, json: e.target.value })} spellCheck={false} />
            <button className="btn-primary mt-3" onClick={save}><Save size={16} /> Enregistrer</button>
          </>
        )}
      </Modal>
    </div>
  );
}

function AchievementsTab() {
  const { toast } = useFeedback();
  const { data, reload } = useApi<any[]>('/admin/achievements');
  const [edit, setEdit] = useState<string | null>(null);
  const TYPES = 'exercises_solved, xp_total, streak, chapters_completed, chapter_mastered, code_success, ide_runs, concept_solved, projects_completed, reviews_done, placement_done, perfect_exam, languages_started';
  async function save() {
    try {
      await api('/admin/achievements', { body: JSON.parse(edit!) });
      toast('Récompense enregistrée', 'success');
      setEdit(null);
      reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  return (
    <div className="card">
      <div className="mb-3 flex justify-end">
        <button className="btn-primary btn-sm" onClick={() => setEdit(JSON.stringify({ id: 'nouveau-succes', title: 'Titre', description: 'Description', icon: '🏅', xp: 20, hidden: false, order: 99, condition: { type: 'exercises_solved', threshold: 5 } }, null, 2))}><Plus size={14} /> Nouvelle récompense</button>
      </div>
      {data?.map((a) => (
        <div key={a.id} className="flex items-center gap-3 border-b border-ink-100 py-2 text-sm last:border-0 dark:border-ink-800">
          <span className="text-2xl">{a.icon}</span>
          <div className="flex-1"><div className="font-bold">{a.title}</div><div className="muted text-xs">{a.description} · {a.condition.type} ≥ {a.condition.threshold}</div></div>
          <span className="muted text-xs">{a._count.users} obtenus</span>
          <button className="btn-outline btn-sm" onClick={() => { const { _count, ...rest } = a; setEdit(JSON.stringify(rest, null, 2)); }}>Modifier</button>
          <button className="btn-danger btn-sm" onClick={async () => { if (confirm('Supprimer ?')) { await api(`/admin/achievements/${a.id}`, { method: 'DELETE' }); reload(); } }}><Trash2 size={14} /></button>
        </div>
      ))}
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Récompense">
        <p className="muted mb-2 text-xs">Types de condition : {TYPES}. Options : <code>language</code>, <code>concept</code>.</p>
        <textarea className="input font-mono text-xs" rows={14} value={edit ?? ''} onChange={(e) => setEdit(e.target.value)} />
        <button className="btn-primary mt-3" onClick={save}><Save size={16} /> Enregistrer</button>
      </Modal>
    </div>
  );
}

const SETTING_LABELS: Record<string, string> = {
  examPassScore: 'Score de réussite par défaut des examens (%)',
  xpRetryFactor: 'Facteur d’XP après plus de 2 tentatives',
  xpSolutionFactor: 'Facteur d’XP après consultation de la solution',
  xpReview: 'XP par révision réussie',
  xpExamPassed: 'XP pour un examen réussi',
  xpChapterCompleted: 'XP pour un chapitre terminé',
  xpProjectCompleted: 'XP pour un projet terminé',
  defaultDailyGoal: 'Objectif quotidien par défaut (XP)',
  placementQuestionsPerLanguage: 'Questions du test de placement par langage',
  reviewSessionSize: 'Taille d’une session de révision',
  solutionMinAttempts: 'Tentatives minimales avant la solution',
  leaderboardEnabled: 'Classement activé',
  aiEnabled: 'Assistant IA activé (si configuré)',
};

function SettingsTab() {
  const { toast } = useFeedback();
  const { data, reload } = useApi<{ settings: Record<string, any> }>('/admin/settings');
  const [s, setS] = useState<Record<string, any> | null>(null);
  useEffect(() => {
    if (data) setS(data.settings);
  }, [data]);
  if (!s) return <Loading />;
  async function save() {
    try {
      await api('/admin/settings', { method: 'PUT', body: s });
      toast('Paramètres enregistrés', 'success');
      reload();
    } catch (e) {
      toast((e as ApiError).message, 'error');
    }
  }
  return (
    <div className="card space-y-3">
      {Object.entries(SETTING_LABELS).map(([k, label]) => (
        <div key={k} className="flex flex-wrap items-center gap-3">
          <label className="flex-1 font-bold">{label}</label>
          {typeof s[k] === 'boolean' ? (
            <input type="checkbox" className="h-5 w-5" checked={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.checked })} />
          ) : (
            <input type="number" step="any" className="input !w-32" value={s[k]} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} />
          )}
        </div>
      ))}
      <div>
        <label className="label">Modèles de défis hebdomadaires (JSON)</label>
        <textarea className="input font-mono text-xs" rows={8} value={JSON.stringify(s.weeklyChallenges, null, 2)} onChange={(e) => { try { setS({ ...s, weeklyChallenges: JSON.parse(e.target.value) }); } catch { /* saisie en cours */ } }} />
      </div>
      <button className="btn-primary" onClick={save}><Save size={16} /> Enregistrer</button>
    </div>
  );
}

function Logs() {
  const { data, reload } = useApi<any[]>('/admin/errors');
  return (
    <div className="card">
      <div className="mb-3 flex justify-between">
        <span className="font-bold">{data?.length ?? 0} entrées</span>
        <button className="btn-outline btn-sm" onClick={async () => { if (confirm('Vider le journal ?')) { await api('/admin/errors', { method: 'DELETE' }); reload(); } }}>Vider</button>
      </div>
      {data?.length === 0 && <p className="muted text-sm">Aucune erreur enregistrée. 🎉</p>}
      {data?.map((e) => (
        <details key={e.id} className="border-b border-ink-100 py-2 text-sm dark:border-ink-800">
          <summary className="cursor-pointer"><span className="muted text-xs">{new Date(e.createdAt).toLocaleString('fr-FR')}</span> <b className="text-rose-500">{e.message}</b> <span className="muted">{e.context?.method} {e.context?.url}</span></summary>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-ink-900 p-2 text-xs text-ink-100">{e.stack}</pre>
        </details>
      ))}
    </div>
  );
}

function ContentTab() {
  const { toast } = useFeedback();
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function importNow(force: boolean) {
    if (force && !confirm('Écraser aussi les contenus modifiés dans l’administration ?')) return;
    setBusy(true);
    try {
      const r = await api<{ logs: string[] }>('/admin/content/import', { body: { force } });
      setLogs(r.logs);
      toast('Import terminé', 'success');
    } catch (e) {
      toast((e as ApiError).message, 'error');
      setLogs([(e as ApiError).message]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card space-y-3">
      <p>Le contenu pédagogique est stocké dans des fichiers YAML structurés (dossier <code className="code-inline">content/</code>) importés en base. Les éléments modifiés ici sont marqués « modifié » et ne sont pas écrasés par un import normal.</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy} onClick={() => importNow(false)}><Upload size={16} /> Importer les fichiers</button>
        <button className="btn-outline" disabled={busy} onClick={() => importNow(true)}>Import forcé (écrase les modifications)</button>
        <a className="btn-outline" href="/api/admin/content/export"><Download size={16} /> Exporter la base (JSON)</a>
      </div>
      {logs.length > 0 && <pre className="whitespace-pre-wrap rounded-xl bg-ink-900 p-3 text-xs text-ink-100">{logs.join('\n')}</pre>}
    </div>
  );
}
