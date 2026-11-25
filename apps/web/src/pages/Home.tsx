import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flame, Star, Target, Clock, CheckCircle2, Percent, BookOpenCheck, RotateCcw, ArrowRight, Swords, AlertTriangle, PlayCircle, Crown, Trophy } from 'lucide-react';
import { useApi, useIdle } from '../lib/hooks';
import { formatDuration, LANG_META, langMeta } from '../lib/api';
import Duo from '../components/Duo';
import { Podium, type BestCoderData } from './BestCoder';
import { PageTitle, ProgressBar, Ring, Loading, ErrorBox, Bars, LangBadge } from '../components/ui';
import type { Mood } from '../components/Mascot';

interface Dashboard {
  user: { displayName: string; dailyGoalXp: number; xp: number };
  level: { level: number; current: number; next: number; progress: number };
  streak: number;
  streakDoneToday: boolean;
  daily: { xp: number; goal: number; exercises: number };
  learningTimeMs: number;
  solved: number;
  attempts: number;
  successRate: number;
  chaptersDone: number;
  reviewsDue: number;
  languages: { id: string; name: string; color: string; total: number; done: number; validated: number; skillLevel: number; skillName: string; byLevel: { level: number; total: number; validated: number }[]; next: { slug: string; title: string } | null }[];
  recommended: { slug: string; title: string; language: string; level: number } | null;
  resume: { path: string; label: string; language?: string } | null;
  weakPoints: { concept: string; language: string; attempts: number; successRate: number }[];
  recent: { type: string; message: string; at: string }[];
  activity: { date: string; xp: number; exercises: number }[];
  challenges: { id: string; title: string; target: number; xpReward: number; progress: number; done: boolean }[];
}

const ICON: Record<string, string> = { achievement: '🏆', chapter: '🎓', exam: '📝', miniproject: '🛠️', project: '🚀', level: '⬆️', challenge: '⚔️', placement: '🧭', skill: '🎚️', solution: '👀', ide_run_ok: '▶️' };

function Stat({ icon: Icon, label, value, color }: { icon: typeof Star; label: string; value: string | number; color: string }) {
  return (
    <div className="card flex items-center gap-3 !p-4">
      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${color}`}>
        <Icon size={22} />
      </div>
      <div>
        <div className="text-xl font-black">{value}</div>
        <div className="muted text-xs font-bold">{label}</div>
      </div>
    </div>
  );
}

/** Message d'accueil de l'essai Premium (juste après l'inscription). */
function TrialWelcome() {
  const [days, setDays] = useState(() => {
    try {
      return Number(sessionStorage.getItem('cm-trial') ?? 0);
    } catch {
      return 0;
    }
  });
  if (!days) return null;
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="premium-shine flex items-center gap-3 rounded-3xl bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 p-4 text-amber-950 shadow-lg">
      <Crown size={32} />
      <div className="flex-1">
        <div className="font-black">Cadeau de bienvenue : {days} jours de Premium offerts !</div>
        <div className="text-sm font-bold opacity-80">Énergie illimitée, zéro pub, IA de Kiri, avatars exclusifs… profites-en pour tout découvrir.</div>
      </div>
      <button className="btn-ghost btn-sm" onClick={() => { sessionStorage.removeItem('cm-trial'); setDays(0); }}>OK</button>
    </motion.div>
  );
}

function BestCoderWidget() {
  const { data } = useApi<BestCoderData>('/community/best-coder');
  if (!data || (!data.leaders.length && !data.lastWinner)) return null;
  const me = data.leaders.find((l) => l.me);
  return (
    <Link to="/meilleur-codeur" className="card group block transition hover:shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="section-title flex items-center gap-2"><Trophy size={20} className="text-amber-500" /> Meilleur codeur de la semaine</h2>
        <span className="muted text-xs font-bold">{me ? `Tu es ${me.rank}ᵉ` : 'Gagne de l’XP pour entrer dans la course'}</span>
      </div>
      {data.leaders.length ? <Podium leaders={data.leaders} /> : <p className="muted text-sm">La course vient de commencer !</p>}
      {data.lastWinner && (
        <p className="muted mt-3 text-center text-xs font-bold">Semaine dernière : 🏆 {data.lastWinner.displayName} ({data.lastWinner.xp} XP)</p>
      )}
    </Link>
  );
}

export default function Home() {
  const { data, error, loading, reload } = useApi<Dashboard>('/dashboard');
  const idle = useIdle(90_000);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Erreur'} onRetry={reload} />;

  const hour = new Date().getHours();
  const hello = hour < 6 ? 'Encore debout' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
  const goalDone = data.daily.xp >= data.daily.goal;
  const mood: Mood = idle ? 'sleep' : goalDone ? 'celebrate' : data.streak > 0 && !data.streakDoneToday ? 'thinking' : 'happy';
  const message = idle
    ? 'Zzz… Je faisais une petite sieste. On reprend quand tu veux !'
    : goalDone
      ? `Objectif du jour atteint (${data.daily.xp} XP) ! Tu peux continuer pour le plaisir 😄`
      : data.streak > 0 && !data.streakDoneToday
        ? `Ta série de ${data.streak} jour${data.streak > 1 ? 's' : ''} t’attend : un exercice suffit pour la prolonger !`
        : data.reviewsDue > 0
          ? `Tu as ${data.reviewsDue} révision${data.reviewsDue > 1 ? 's' : ''} à faire : c’est le meilleur moyen de ne rien oublier.`
          : 'Prête pour une nouvelle session ? On continue là où tu t’es arrêté.';

  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86400_000);
    const key = d.toISOString().slice(0, 10);
    const a = data.activity.find((x) => x.date === key);
    return { key, value: a?.xp ?? 0, title: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) };
  });

  return (
    <div>
      <PageTitle title={`${hello}, ${data.user.displayName} !`} subtitle={`Niveau ${data.level.level} · ${data.solved} exercices réussis`} />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Colonne principale */}
        <div className="space-y-4 lg:col-span-2">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-violet-600 !p-0 text-white">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <div className="shrink-0 self-center">
                <Duo scene={mood === 'celebrate' ? 'celebrate' : data.streak >= 3 ? 'cheer' : mood === 'sleep' ? 'comfort' : 'wave'} size={88} />
              </div>
              <div className="flex-1">
                <motion.div key={message} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="relative rounded-3xl rounded-tl-md border-2 border-white/30 bg-white/15 px-4 py-3 font-semibold text-white sm:rounded-bl-md sm:rounded-tl-3xl">
                  {message}
                </motion.div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {data.resume && (
                    <Link to={data.resume.path} className="btn bg-white text-brand-600 shadow-[0_4px_0_0_rgba(0,0,0,0.15)] hover:bg-brand-50">
                      <PlayCircle size={18} /> Reprendre : {data.resume.label.slice(0, 40)}
                    </Link>
                  )}
                  {data.recommended && (!data.resume || !data.resume.path.endsWith(data.recommended.slug)) && (
                    <Link to={`/chapitre/${data.recommended.slug}`} className="btn bg-white/15 text-white hover:bg-white/25">
                      Prochaine leçon : {data.recommended.title} <ArrowRight size={16} />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          <TrialWelcome />
          <BestCoderWidget />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat icon={Flame} label="Série quotidienne" value={`${data.streak} j`} color="bg-orange-100 text-orange-500 dark:bg-orange-900/30" />
            <Stat icon={Star} label="XP totale" value={data.user.xp} color="bg-amber-100 text-amber-500 dark:bg-amber-900/30" />
            <Stat icon={Clock} label="Temps d’apprentissage" value={formatDuration(data.learningTimeMs)} color="bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30" />
            <Stat icon={CheckCircle2} label="Exercices réussis" value={data.solved} color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30" />
            <Stat icon={Percent} label="Taux de réussite" value={`${Math.round(data.successRate * 100)} %`} color="bg-violet-100 text-violet-600 dark:bg-violet-900/30" />
            <Stat icon={BookOpenCheck} label="Chapitres terminés" value={data.chaptersDone} color="bg-brand-100 text-brand-600 dark:bg-brand-900/30" />
          </div>

          {/* Progression par langage */}
          <div className="card">
            <h2 className="section-title mb-3">Progression par langage</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {data.languages.map((l) => (
                <Link key={l.id} to={`/parcours/${l.id}`} className="rounded-3xl border-2 border-ink-100 p-4 transition hover:border-brand-200 dark:border-ink-800 dark:hover:border-brand-800">
                  <div className="flex items-center gap-3">
                    <Ring value={l.total ? l.validated / l.total : 0} color={langMeta(l.id)?.color}>
                      <span className="text-xl">{langMeta(l.id)?.icon}</span>
                    </Ring>
                    <div>
                      <div className="font-black">{l.name}</div>
                      <div className="muted text-xs font-bold">{l.skillName}</div>
                      <div className="text-xs font-bold">
                        {l.validated}/{l.total} chapitres
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-1">
                    {l.byLevel.map((b) => (
                      <div key={b.level} className="flex-1" title={`Niveau ${b.level} : ${b.validated}/${b.total}`}>
                        <ProgressBar value={b.total ? b.validated / b.total : 0} className="h-2" />
                      </div>
                    ))}
                  </div>
                  {l.next && <div className="mt-2 truncate text-xs font-bold text-brand-500">→ {l.next.title}</div>}
                </Link>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">Activité des 30 derniers jours</h2>
              <Link to="/statistiques" className="text-sm font-bold text-brand-500">
                Statistiques →
              </Link>
            </div>
            <Bars data={days} label={(v) => `${v} XP`} />
          </div>

          <div className="card">
            <h2 className="section-title mb-3">Dernières activités</h2>
            {data.recent.length === 0 ? (
              <p className="muted text-sm">Aucune activité pour l’instant. Lance-toi dans ton premier chapitre !</p>
            ) : (
              <ul className="space-y-2">
                {data.recent.map((r, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-lg">{ICON[r.type] ?? '✨'}</span>
                    <span className="flex-1 font-semibold">{r.message}</span>
                    <span className="muted text-xs">{new Date(r.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Colonne latérale */}
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center gap-2">
              <Target className="text-brand-500" />
              <h2 className="section-title">Objectif du jour</h2>
            </div>
            <div className="mt-3 flex items-center gap-4">
              <Ring value={data.daily.xp / data.daily.goal} size={84} stroke={10} color={goalDone ? '#10b981' : '#3b6cf6'}>
                {Math.min(100, Math.round((data.daily.xp / data.daily.goal) * 100))} %
              </Ring>
              <div>
                <div className="text-2xl font-black">
                  {data.daily.xp} <span className="muted text-base">/ {data.daily.goal} XP</span>
                </div>
                <div className="muted text-sm">{data.daily.exercises} exercices aujourd’hui</div>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="section-title">Niveau {data.level.level}</h2>
            <ProgressBar value={data.level.progress} className="mt-3" color="bg-gradient-to-r from-amber-400 to-orange-500" />
            <div className="muted mt-1 text-xs font-bold">Prochain niveau à {data.level.next} XP</div>
          </div>

          <Link to="/revisions" className="card flex items-center gap-3 transition hover:shadow-lg">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-900/30">
              <RotateCcw />
            </div>
            <div className="flex-1">
              <div className="font-black">Révisions</div>
              <div className="muted text-sm">{data.reviewsDue ? `${data.reviewsDue} à faire maintenant` : 'Rien à réviser pour le moment'}</div>
            </div>
            <ArrowRight className="text-ink-400" />
          </Link>

          <div className="card">
            <div className="mb-3 flex items-center gap-2">
              <Swords className="text-violet-500" />
              <h2 className="section-title">Défis de la semaine</h2>
            </div>
            <div className="space-y-3">
              {data.challenges.map((c) => (
                <div key={c.id}>
                  <div className="flex justify-between text-sm font-bold">
                    <span className={c.done ? 'text-emerald-500' : ''}>
                      {c.done ? '✔ ' : ''}
                      {c.title}
                    </span>
                    <span className="text-amber-500">+{c.xpReward}</span>
                  </div>
                  <ProgressBar value={c.progress / c.target} className="mt-1 h-2" color={c.done ? 'bg-emerald-500' : 'bg-violet-500'} />
                  <div className="muted text-right text-xs">
                    {c.progress}/{c.target}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="text-amber-500" />
              <h2 className="section-title">Points faibles</h2>
            </div>
            {data.weakPoints.length === 0 ? (
              <p className="muted text-sm">Pas encore assez de données. Continue à t’entraîner !</p>
            ) : (
              <ul className="space-y-2">
                {data.weakPoints.map((w) => (
                  <li key={w.concept + w.language} className="flex items-center gap-2 text-sm">
                    <LangBadge lang={w.language} />
                    <span className="flex-1 font-bold">{w.concept}</span>
                    <span className="font-bold text-rose-500">{Math.round(w.successRate * 100)} %</span>
                  </li>
                ))}
              </ul>
            )}
            {data.weakPoints.length > 0 && (
              <Link to="/revisions" className="btn-outline btn-sm mt-3 w-full">
                Réviser mes points faibles
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
