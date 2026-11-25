import { useState } from 'react';
import clsx from 'clsx';
import { Trash2, Save } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useFeedback } from '../../lib/feedback';
import { Loading } from '../../components/ui';
import { KIND, STATUS } from '../Feedback';

export default function FeedbackAdmin() {
  const { toast } = useFeedback();
  const [status, setStatus] = useState('');
  const { data, reload } = useApi<any[]>(`/admin/feedback${status ? `?status=${status}` : ''}`, [status]);
  const [replies, setReplies] = useState<Record<string, string>>({});
  async function patch(id: string, body: object) {
    try {
      await api(`/admin/feedback/${id}`, { method: 'PATCH', body });
      toast('Avis mis à jour', 'success');
      reload();
    } catch (e) {
      toast((e as ApiError).message, 'error');
    }
  }
  if (!data) return <Loading />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {['', ...Object.keys(STATUS)].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={clsx('chip cursor-pointer', status === s && 'bg-brand-500 text-white')}>{s ? STATUS[s].label : 'Tous'} </button>
        ))}
      </div>
      {!data.length && <p className="muted card text-sm">Aucun avis.</p>}
      {data.map((f) => {
        const K = KIND[f.kind as keyof typeof KIND] ?? KIND.other;
        return (
          <div key={f.id} className="card space-y-2 !p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={clsx('chip', K.color)}><K.icon size={12} /> {K.label}</span>
              <span className="font-black">{f.title}</span>
              <span className="muted text-xs">👍 {f.votes} · {f.user ? `${f.user.username}#${f.user.discriminator} (${f.user.email})` : 'anonyme'} · {new Date(f.createdAt).toLocaleString('fr-FR')}{f.page ? ` · page ${f.page}` : ''}</span>
            </div>
            <p className="whitespace-pre-line text-sm">{f.body}</p>
            <div className="flex flex-wrap items-center gap-2">
              <select className="input !w-40" value={f.status} onChange={(e) => patch(f.id, { status: e.target.value })}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <input className="input flex-1" placeholder="Réponse publique de l’équipe…" value={replies[f.id] ?? f.adminReply ?? ''} onChange={(e) => setReplies({ ...replies, [f.id]: e.target.value })} />
              <button className="btn-outline btn-sm" onClick={() => patch(f.id, { adminReply: (replies[f.id] ?? f.adminReply ?? '') || null })}><Save size={14} /> Répondre</button>
              <button className="btn-ghost btn-sm" onClick={async () => { if (confirm('Supprimer cet avis ?')) { await api(`/admin/feedback/${f.id}`, { method: 'DELETE' }); reload(); } }}><Trash2 size={14} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
