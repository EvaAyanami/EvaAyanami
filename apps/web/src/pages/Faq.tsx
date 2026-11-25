import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, MessageSquarePlus, Search } from 'lucide-react';
import { PageTitle } from '../components/ui';
import Mascot from '../components/Mascot';
import { useI18n } from '../lib/i18n';

interface QA {
  q: string;
  a: string;
}

const SECTIONS: { title: string; icon: string; items: QA[] }[] = [
  {
    title: 'Premiers pas',
    icon: '🚀',
    items: [
      { q: 'Codemori, c’est quoi ?', a: 'Une plateforme pour apprendre la programmation (Rust, C++, Java, Python, PHP, HTML et CSS) et comprendre l’informatique (hardware, OpenGL, Vulkan), de débutant absolu à expert. Chaque exercice de code est réellement compilé et exécuté.' },
      { q: 'Par où commencer ?', a: 'Fais l’évaluation de départ : elle te place au bon niveau dans chaque langage. Si tu débutes complètement, choisis « Je débute complètement » puis commence par Python ou HTML & CSS, les plus accessibles.' },
      { q: 'Faut-il installer quelque chose ?', a: 'Non. L’éditeur, le compilateur et l’aperçu web sont intégrés au site. Il te faut juste un navigateur récent.' },
      { q: 'Comment fonctionne un chapitre ?', a: 'Un cours (avec exemples et parfois des animations), des exercices interactifs, un mini-projet et un examen. Le chapitre est validé quand l’examen et le mini-projet sont réussis.' },
    ],
  },
  {
    title: 'Progression et récompenses',
    icon: '⭐',
    items: [
      { q: 'Comment gagner de l’XP ?', a: 'En réussissant des exercices, des examens, des chapitres, des projets, des révisions et les défis de la semaine. Une erreur ne fait jamais perdre d’XP.' },
      { q: 'À quoi sert la série quotidienne 🔥 ?', a: 'Elle compte les jours consécutifs où tu apprends. Il suffit de réussir un exercice dans la journée pour la prolonger.' },
      { q: 'Et la flamme d’amitié ?', a: 'C’est une série partagée avec un ami : elle grandit chaque jour où VOUS DEUX avez appris. Des paliers (3, 7, 14, 30, 50, 100 jours…) donnent de l’XP bonus à tous les deux.' },
      { q: 'Peut-on changer son niveau soi-même ?', a: 'Non, pour que la progression reste juste : le niveau vient de l’évaluation (refaisable une fois par semaine) et des examens réussis. Un administrateur peut le corriger si besoin.' },
      { q: 'Qu’est-ce que le « meilleur codeur de la semaine » ?', a: 'La personne qui gagne le plus d’XP du lundi au dimanche. Elle remporte un bonus d’XP et un trophée sur son profil.' },
    ],
  },
  {
    title: 'Offre gratuite et Premium',
    icon: '👑',
    items: [
      { q: 'Codemori est-il gratuit ?', a: 'Oui : tous les cours, exercices, examens et projets sont accessibles gratuitement. Le compte gratuit a une réserve d’énergie et un nombre d’exécutions par jour.' },
      { q: 'Comment fonctionne l’énergie ⚡ ?', a: 'Une mauvaise réponse à un QCM, un code à trous… coûte 1 énergie. Elle se recharge toute seule avec le temps. Une révision réussie ou une courte pub en redonne. Les exercices d’écriture de code ne coûtent jamais d’énergie.' },
      { q: 'Que m’apporte Premium ?', a: 'Énergie et exécutions illimitées, aucune publicité, l’assistante IA de Kiri, la protection de série, des éléments d’avatar exclusifs et un badge sur ton profil.' },
      { q: 'Comment activer une clé ?', a: 'Va dans Premium → Activer une clé et colle ton code KIRI-XXXX-XXXX-XXXX. Le temps s’ajoute à ton Premium actuel.' },
    ],
  },
  {
    title: 'Compte et sécurité',
    icon: '🔐',
    items: [
      { q: 'Pourquoi vérifier mon adresse e-mail ?', a: 'Pour protéger ton compte et pouvoir le récupérer si tu oublies ton mot de passe. Un lien t’est envoyé à l’inscription.' },
      { q: 'Comment activer la double authentification ?', a: 'Profil → Double authentification : scanne le QR code avec une application (Google Authenticator, Aegis, 2FAS…), puis garde précieusement tes codes de secours.' },
      { q: 'Puis-je me connecter avec Google ou Facebook ?', a: 'Oui, si l’administrateur du site l’a activé : les boutons apparaissent sur la page de connexion.' },
      { q: 'Comment supprimer mon compte ?', a: 'Profil → Zone sensible → Supprimer mon compte. Toutes tes données sont effacées définitivement.' },
    ],
  },
  {
    title: 'Code et exercices',
    icon: '💻',
    items: [
      { q: 'Mon code est-il vraiment exécuté ?', a: 'Oui, dans un bac à sable isolé (sans réseau, avec des limites de temps et de mémoire). Les tests cachés vérifient que ta solution fonctionne pour d’autres entrées que l’exemple.' },
      { q: 'Je suis bloqué, que faire ?', a: 'Utilise les indices (3 niveaux), lis l’explication de l’erreur en français, ou demande à Kiri avec le bouton 💬. La solution devient consultable après quelques essais.' },
      { q: 'Et pour HTML et CSS ?', a: 'Ta page s’affiche en direct dans un aperçu. La validation vérifie la structure (balises, attributs) et les styles demandés.' },
    ],
  },
];

export default function Faq() {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(SECTIONS[0].items[0].q);
  const [q, setQ] = useState('');
  const filter = (it: QA) => !q || (t(it.q) + ' ' + t(it.a)).toLowerCase().includes(q.toLowerCase());
  return (
    <div>
      <PageTitle title={t('FAQ')} subtitle={t('Les réponses aux questions les plus fréquentes.')} />
      <div className="mb-6 flex flex-col items-center gap-4 sm:flex-row">
        <Mascot mood="explain" size={90} />
        <div className="relative w-full">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
          <input className="input !pl-11" placeholder={t('Rechercher une question…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {SECTIONS.map((sec, si) => {
          const items = sec.items.filter(filter);
          if (!items.length) return null;
          return (
            <motion.div key={sec.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: si * 0.05 }} className="card">
              <h2 className="section-title mb-2">{sec.icon} {t(sec.title)}</h2>
              <div className="divide-y divide-ink-100 dark:divide-ink-800">
                {items.map((it) => {
                  const isOpen = open === it.q || !!q;
                  return (
                    <div key={it.q}>
                      <button className="flex w-full items-center gap-2 py-3 text-left font-extrabold" onClick={() => setOpen(isOpen && !q ? null : it.q)}>
                        <span className="flex-1">{t(it.q)}</span>
                        <motion.span animate={{ rotate: isOpen ? 180 : 0 }}><ChevronDown size={18} /></motion.span>
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pb-3 text-sm text-ink-600 dark:text-ink-300">
                            {t(it.a)}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="card mt-6 flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
        <MessageSquarePlus size={28} className="text-brand-500" />
        <div className="flex-1">
          <div className="font-black">{t('Tu n’as pas trouvé ta réponse ?')}</div>
          <div className="muted text-sm">{t('Pose ta question, signale un bug ou propose une idée aux développeurs.')}</div>
        </div>
        <Link to="/avis" className="btn-primary">{t('Donner mon avis')}</Link>
      </div>
    </div>
  );
}
