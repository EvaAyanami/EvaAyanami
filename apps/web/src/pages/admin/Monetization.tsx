import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Crown, KeyRound, Download, Copy, Trash2, Megaphone, Plus, Save, CreditCard, Settings2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useFeedback } from '../../lib/feedback';
import { Loading, Modal } from '../../components/ui';

const euros = (c: number) => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

const LABELS: Record<string, string> = {
  premiumEnabled: 'Système Premium activé (désactivé = tout le monde illimité)',
  trialDays: 'Jours d’essai Premium offerts à l’inscription (0 = aucun)',
  freeMaxEnergy: 'Énergie maximale (gratuit)',
  energyRegenMinutes: 'Minutes pour recharger 1 énergie',
  codeCostsEnergy: 'Les exercices de code coûtent de l’énergie',
  reviewRefillsEnergy: 'Une révision réussie rend 1 énergie',
  freeDailyRuns: 'Exécutions libres par jour (gratuit)',
  adsEnabled: 'Publicités récompensées',
  adMaxPerDay: 'Publicités récompensées max. par jour',
  adMinSeconds: 'Durée minimale d’une publicité (s)',
  adRewardEnergy: 'Énergie gagnée par publicité',
  adRewardRuns: 'Exécutions gagnées par publicité',
  bannerAds: 'Bannière discrète (AdSense) pour les comptes gratuits',
  aiPremiumOnly: 'Assistante IA réservée à Premium',
  premiumPriceLabel: 'Prix affiché de l’abonnement',
  bestCoderXp: 'Bonus XP du meilleur codeur de la semaine',
};

function Settings() {
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
      toast('Réglages enregistrés', 'success');
      reload();
    } catch (e) {
      toast((e as ApiError).message, 'error');
    }
  }
  return (
    <div className="card space-y-3">
      <h2 className="section-title flex items-center gap-2"><Settings2 size={18} /> Réglages de l’offre gratuite</h2>
      {Object.entries(LABELS).map(([k, label]) => (
        <div key={k} className="flex flex-wrap items-center gap-3">
          <label className="flex-1 text-sm font-bold">{label}</label>
          {typeof s[k] === 'boolean' ? (
            <input type="checkbox" className="h-5 w-5" checked={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.checked })} />
          ) : typeof s[k] === 'string' ? (
            <input className="input !w-40" value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
          ) : (
            <input type="number" className="input !w-28" value={s[k]} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} />
          )}
        </div>
      ))}
      <div>
        <label className="label">Offres de la boutique (JSON, prix en centimes)</label>
        <textarea className="input font-mono text-xs" rows={7} defaultValue={JSON.stringify(s.shopOffers, null, 2)} onChange={(e) => { try { setS({ ...s, shopOffers: JSON.parse(e.target.value) }); } catch { /* saisie en cours */ } }} />
      </div>
      <button className="btn-primary" onClick={save}><Save size={16} /> Enregistrer</button>
    </div>
  );
}

function Codes() {
  const { toast } = useFeedback();
  const { data, reload } = useApi<any[]>('/admin/premium/codes');
  const [form, setForm] = useState({ days: 30, count: 10, maxUses: 1, note: '' });
  const [created, setCreated] = useState<string[]>([]);
  async function generate() {
    try {
      const r = await api<{ codes: string[] }>('/admin/premium/codes', { body: { ...form, note: form.note || undefined } });
      setCreated(r.codes);
      reload();
    } catch (e) {
      toast((e as ApiError).message, 'error');
    }
  }
  const unused = data?.filter((c) => c.uses === 0 && !c.buyer && c.maxUses === 1).length ?? 0;
  return (
    <div className="card space-y-3">
      <h2 className="section-title flex items-center gap-2"><KeyRound size={18} /> Clés Premium</h2>
      <p className="muted text-sm">
        Génère des clés pour les offrir, les vendre en main propre ou sur <b>Discord</b> : exporte-les en .txt et importe-les comme « stock de clés » (serials) sur Sell.app, Sellix ou Ko-fi. Le bot de la boutique livre automatiquement une clé à chaque achat.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-xs font-bold">Durée (jours)<input type="number" className="input mt-1" value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} /></label>
        <label className="text-xs font-bold">Nombre<input type="number" className="input mt-1" value={form.count} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })} /></label>
        <label className="text-xs font-bold">Utilisations / clé<input type="number" className="input mt-1" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) })} /></label>
        <label className="text-xs font-bold">Lot / note<input className="input mt-1" placeholder="discord-1-mois" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={generate}><Plus size={16} /> Générer</button>
        <a className="btn-outline" href={`/api/admin/premium/codes/export${form.note ? `?note=${encodeURIComponent(form.note)}` : ''}`}><Download size={16} /> Exporter les {form.note ? `clés du lot « ${form.note} »` : `${unused} clés inutilisées`} (.txt)</a>
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-ink-500"><th className="p-2">Clé</th><th className="p-2">Jours</th><th className="p-2">Utilisée</th><th className="p-2">Origine</th><th /></tr></thead>
          <tbody>
            {data?.map((c) => (
              <tr key={c.id} className="border-t border-ink-100 dark:border-ink-800">
                <td className="p-2 font-mono text-xs font-bold">{c.code}</td>
                <td className="p-2">{c.days}</td>
                <td className="p-2 text-xs">{c.uses}/{c.maxUses}{c.redemptions[0] && ` · ${c.redemptions.map((r: any) => `${r.user.username}#${r.user.discriminator}`).join(', ')}`}</td>
                <td className="p-2 text-xs">{c.buyer ? `achat ${euros(c.amountCents ?? 0)} · ${c.buyer.username}` : c.note ?? '—'}</td>
                <td className="p-2"><button className="btn-ghost btn-sm" onClick={async () => { if (confirm('Supprimer cette clé ?')) { await api(`/admin/premium/codes/${c.id}`, { method: 'DELETE' }); reload(); } }}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={created.length > 0} onClose={() => setCreated([])} title={`${created.length} clé(s) générée(s)`}>
        <textarea readOnly className="input font-mono text-xs" rows={10} value={created.join('\n')} />
        <button className="btn-primary mt-2 w-full" onClick={() => navigator.clipboard?.writeText(created.join('\n')).then(() => toast('Clés copiées', 'success'))}><Copy size={16} /> Copier</button>
      </Modal>
    </div>
  );
}

const EMPTY_AD = { title: '', body: '', imageUrl: '', linkUrl: '', linkLabel: '', durationSec: 15, weight: 1, enabled: true };
function Ads() {
  const { toast } = useFeedback();
  const { data, reload } = useApi<any[]>('/admin/ads');
  const [edit, setEdit] = useState<any | null>(null);
  async function save() {
    try {
      const body = { ...edit, imageUrl: edit.imageUrl || null, linkUrl: edit.linkUrl || null, linkLabel: edit.linkLabel || null };
      delete body.id; delete body.views; delete body.clicks; delete body.createdAt;
      await api(edit.id ? `/admin/ads/${edit.id}` : '/admin/ads', { method: edit.id ? 'PUT' : 'POST', body });
      setEdit(null);
      reload();
    } catch (e) {
      toast((e as ApiError).message, 'error');
    }
  }
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="section-title flex items-center gap-2"><Megaphone size={18} /> Annonces maison</h2>
        <button className="btn-outline btn-sm" onClick={() => setEdit({ ...EMPTY_AD })}><Plus size={14} /> Nouvelle</button>
      </div>
      <p className="muted text-sm">Affichées pendant les pubs récompensées quand AdSense n’est pas configuré : partenaires, sponsors, ton Discord, ta boutique… Sans annonce, des messages de Kiri sont utilisés.</p>
      {data?.map((a) => (
        <div key={a.id} className={clsx('flex items-center gap-3 rounded-2xl bg-ink-50 p-3 dark:bg-ink-800/60', !a.enabled && 'opacity-50')}>
          <div className="flex-1">
            <div className="font-bold">{a.title}</div>
            <div className="muted text-xs">{a.views} vues · {a.clicks} clics · poids {a.weight}</div>
          </div>
          <button className="btn-ghost btn-sm" onClick={() => setEdit(a)}>Modifier</button>
          <button className="btn-ghost btn-sm" onClick={async () => { await api(`/admin/ads/${a.id}`, { method: 'DELETE' }); reload(); }}><Trash2 size={14} /></button>
        </div>
      ))}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Modifier l’annonce' : 'Nouvelle annonce'}>
        {edit && (
          <div className="space-y-2">
            {(['title', 'body', 'imageUrl', 'linkUrl', 'linkLabel'] as const).map((k) => (
              <input key={k} className="input" placeholder={{ title: 'Titre', body: 'Texte', imageUrl: 'Image (https://…)', linkUrl: 'Lien (https://… ou /premium)', linkLabel: 'Texte du bouton' }[k]} value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
            ))}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-bold">Durée (s)<input type="number" className="input mt-1" value={edit.durationSec} onChange={(e) => setEdit({ ...edit, durationSec: Number(e.target.value) })} /></label>
              <label className="text-xs font-bold">Poids<input type="number" className="input mt-1" value={edit.weight} onChange={(e) => setEdit({ ...edit, weight: Number(e.target.value) })} /></label>
            </div>
            <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={edit.enabled} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} /> Active</label>
            <button className="btn-primary w-full" onClick={save}><Save size={16} /> Enregistrer</button>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function Monetization() {
  const { data } = useApi<any>('/admin/billing');
  if (!data) return <Loading />;
  const cards = [
    { label: 'Membres Premium', value: data.premium, icon: Crown },
    { label: 'Anciens Premium', value: data.former, icon: Crown },
    { label: 'Ventes boutique', value: `${data.sales.count} · ${euros(data.sales.totalCents)}`, icon: CreditCard },
    { label: 'Pubs vues (24 h)', value: `${data.adViewsDay} (${data.adRewardsDay} récompensées)`, icon: Megaphone },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card !p-4"><c.icon size={18} className="text-amber-500" /><div className="mt-1 text-xl font-black">{c.value}</div><div className="muted text-xs font-bold">{c.label}</div></div>
        ))}
      </div>
      <div className="card text-sm">
        <h2 className="section-title mb-2">Encaissement</h2>
        <ul className="space-y-1">
          <li><b>Paiement par carte (Stripe)</b> : {data.stripe.configured ? '✅ boutique + abonnement mensuel' : data.stripe.payments ? '✅ boutique (abonnement mensuel : STRIPE_PRICE_ID absent)' : '❌ non configuré'} {data.stripe.webhook ? '· webhook ✅' : '· webhook ❌'}</li>
          <li className="muted text-xs">URL du webhook à déclarer dans Stripe : <code>{data.stripe.webhookUrl}</code></li>
          <li><b>Publicités</b> : {data.adsProvider === 'adsense' ? `Google AdSense (${data.adsense.client ?? 'client manquant'}) · bloc récompensé ${data.adsense.slotReward ? '✅' : '❌'} · bannière ${data.adsense.slotBanner ? '✅' : '❌'}` : 'annonces maison (pas de revenu publicitaire)'}</li>
        </ul>
        <p className="muted mt-2 text-xs">Guide complet : <code>docs/monetisation.md</code> dans le dépôt.</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Codes />
        <div className="space-y-4">
          <Settings />
          <Ads />
        </div>
      </div>
    </div>
  );
}
