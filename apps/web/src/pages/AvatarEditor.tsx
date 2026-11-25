import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Crown, Dices, Save, Undo2, Lock } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth, type User } from '../lib/auth';
import { useFeedback } from '../lib/feedback';
import { useApi } from '../lib/hooks';
import { PageTitle, Loading } from '../components/ui';
import Avatar, { DEFAULT_AVATAR, type AvatarData } from '../components/Avatar';
import Duo, { type Scene } from '../components/Duo';
import AvatarWizard, { avatarLabel, swatch } from '../components/AvatarWizard';

type Key = keyof Omit<AvatarData, 'blush'>;

const TABS: { key: Key; label: string; emoji: string }[] = [
  { key: 'gender', label: 'Genre', emoji: '🧑‍💻' },
  { key: 'skin', label: 'Peau', emoji: '🙂' },
  { key: 'hairStyle', label: 'Coiffure', emoji: '💇' },
  { key: 'hairColor', label: 'Cheveux', emoji: '🎨' },
  { key: 'eyes', label: 'Yeux', emoji: '👀' },
  { key: 'eyeColor', label: 'Iris', emoji: '💎' },
  { key: 'mouth', label: 'Bouche', emoji: '👄' },
  { key: 'outfit', label: 'Tenue', emoji: '👕' },
  { key: 'outfitColor', label: 'Couleur', emoji: '🧵' },
  { key: 'accessory', label: 'Accessoire', emoji: '🎀' },
  { key: 'background', label: 'Fond', emoji: '🌌' },
];

const label = (k: Key, v: string) => avatarLabel(k, v);

const SCENES: { scene: Scene; label: string }[] = [
  { scene: 'wave', label: 'Coucou' },
  { scene: 'highfive', label: 'Tape-m’en cinq' },
  { scene: 'celebrate', label: 'Fête' },
  { scene: 'comfort', label: 'Réconfort' },
  { scene: 'trophy', label: 'Trophée' },
];

export default function AvatarEditor() {
  const { user, setUser, refresh } = useAuth();
  const { toast, celebrate } = useFeedback();
  const nav = useNavigate();
  const opts = useApi<{ options: Record<Key, string[]>; premium: Partial<Record<Key, string[]>> }>('/avatar/options');
  const [a, setA] = useState<AvatarData>(() => ({ ...DEFAULT_AVATAR, ...(user?.avatar ?? {}) }));
  const [bio, setBio] = useState('');
  const [tab, setTab] = useState<Key>('hairStyle');
  const [scene, setScene] = useState<Scene>('wave');
  const [sceneKey, setSceneKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [wizard, setWizard] = useState(() => !user?.hasAvatar || new URLSearchParams(location.search).has('assistant'));
  const canPremium = !!user?.premium || user?.role === 'ADMIN';

  useEffect(() => {
    api<{ avatar: AvatarData; bio: string }>('/me/avatar').then((r) => {
      setA(r.avatar);
      setBio(r.bio);
    });
  }, []);

  const isPremiumItem = (k: Key, v: string) => !!opts.data?.premium[k]?.includes(v);
  const usesPremium = useMemo(() => TABS.some((t) => isPremiumItem(t.key, a[t.key])), [a, opts.data]); // eslint-disable-line react-hooks/exhaustive-deps

  function randomize() {
    if (!opts.data) return;
    const next = { ...a };
    for (const t of TABS) {
      const list = opts.data.options[t.key].filter((v) => canPremium || !isPremiumItem(t.key, v));
      (next as any)[t.key] = list[Math.floor(Math.random() * list.length)];
    }
    next.blush = Math.random() > 0.3;
    setA(next);
    setScene('celebrate');
    setSceneKey((k) => k + 1);
  }

  async function save(override?: AvatarData) {
    setSaving(true);
    try {
      await api('/me/avatar', { method: 'PUT', body: { avatar: override ?? a, bio } });
      if (override) {
        setA(override);
        setWizard(false);
      }
      const r = await api<{ user: User | null }>('/auth/me');
      if (r.user) setUser(r.user);
      else await refresh();
      celebrate(undefined, { title: 'Nouveau look ! ✨', text: 'Kiri adore ton avatar. Il apparaît maintenant sur ton profil et à côté de Kiri.' });
    } catch (e) {
      if ((e as ApiError).status !== 402) ((e as ApiError).status !== 402 && toast((e as ApiError).message, 'error'));
    } finally {
      setSaving(false);
    }
  }

  if (!opts.data || !user) return <Loading />;
  const values = opts.data.options[tab];
  if (wizard)
    return (
      <div>
        <PageTitle title="Créer mon avatar" subtitle="Réponds à quelques questions, ou laisse le hasard choisir pour toi !" />
        <AvatarWizard initial={a} options={opts.data.options} premium={opts.data.premium} canPremium={canPremium} onDone={(x) => save(x)} onCancel={() => setWizard(false)} />
      </div>
    );

  return (
    <div>
      <PageTitle title="Mon avatar" subtitle="Crée ton personnage, dans le style de Kiri. Il te représente partout dans Codemori." />
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        {/* Aperçu */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="card flex flex-col items-center">
            <motion.div key={JSON.stringify(a)} initial={{ scale: 0.92, rotate: -3 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}>
              <Avatar avatar={a} size={180} ring={user.premium ? 'premium' : 'none'} />
            </motion.div>
            <div className="mt-3 text-center">
              <div className="text-lg font-black">{user.displayName}</div>
              <div className="muted font-mono text-sm">{user.tag}</div>
            </div>
            <div className="mt-4 flex w-full gap-2">
              <button className="btn-outline flex-1" onClick={randomize}><Dices size={16} /> J’ai de la chance</button>
              <button className="btn-ghost" onClick={() => setWizard(true)} title="Assistant de création">🪄</button>
              <button className="btn-ghost" onClick={() => setA({ ...DEFAULT_AVATAR })} title="Par défaut"><Undo2 size={16} /></button>
            </div>
          </div>
          <div className="card">
            <div className="mb-2 flex flex-wrap gap-1">
              {SCENES.map((s) => (
                <button key={s.scene} className={clsx('chip cursor-pointer', scene === s.scene && 'bg-brand-500 text-white')} onClick={() => { setScene(s.scene); setSceneKey((k) => k + 1); }}>
                  {s.label}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={`${scene}-${sceneKey}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Duo scene={scene} size={110} avatar={a} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Choix */}
        <div className="card min-w-0">
          <div className="scrollbar-thin -mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={clsx('relative shrink-0 rounded-2xl px-3 py-2 text-sm font-extrabold transition', tab === t.key ? 'text-white' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800')}
              >
                {tab === t.key && <motion.span layoutId="avatar-tab" className="absolute inset-0 rounded-2xl bg-brand-500" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
                <span className="relative">{t.emoji} {t.label}</span>
              </button>
            ))}
          </div>

          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5">
            {values.map((v, i) => {
              const locked = isPremiumItem(tab, v) && !canPremium;
              const selected = a[tab] === v;
              const sw = swatch(tab, v);
              return (
                <motion.button
                  key={v}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.02 }}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => (locked ? nav('/premium') : setA({ ...a, [tab]: v }))}
                  className={clsx(
                    'relative flex flex-col items-center gap-1 rounded-3xl border-2 p-2 transition',
                    selected ? 'border-brand-400 bg-brand-50 shadow-glow dark:bg-brand-900/30' : 'border-ink-100 hover:border-ink-300 dark:border-ink-800',
                    locked && 'opacity-80',
                  )}
                >
                  {sw && tab !== 'background' && tab !== 'skin' ? (
                    <span className="h-14 w-14 rounded-full border-4 border-white shadow-inner dark:border-ink-700" style={{ background: sw }} />
                  ) : (
                    <Avatar avatar={{ ...a, [tab]: v }} size={64} />
                  )}
                  <span className="text-center text-[11px] font-bold leading-tight">{label(tab, v)}</span>
                  {isPremiumItem(tab, v) && (
                    <span className="absolute right-1 top-1 rounded-full bg-gradient-to-r from-amber-300 to-yellow-200 p-1 text-amber-900 shadow">
                      {locked ? <Lock size={11} /> : <Crown size={11} />}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </motion.div>

          <label className="mt-5 flex items-center gap-2 font-bold">
            <input type="checkbox" className="h-5 w-5 accent-brand-500" checked={a.blush} onChange={(e) => setA({ ...a, blush: e.target.checked })} />
            Joues roses
          </label>

          <div className="mt-4">
            <label className="label">Petite bio (facultatif, 160 caractères)</label>
            <input className="input" maxLength={160} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Ex. : Fan de Rust, je vise le niveau Expertise !" />
          </div>

          {usesPremium && !canPremium && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <Crown size={18} /> Certains éléments sont réservés aux membres Premium. <Link to="/premium" className="underline">Découvrir</Link>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button className="btn-primary" onClick={() => save()} disabled={saving || (usesPremium && !canPremium)}><Save size={16} /> Enregistrer</button>
            <Link to={`/u/${encodeURIComponent(user.tag)}`} className="btn-ghost">Voir mon profil public</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
