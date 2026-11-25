import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import { useAuth } from './lib/auth';
import { applyTheme } from './lib/theme';
import Login from './pages/Login';
import { VerifyEmail, ForgotPassword, ResetPassword } from './pages/AccountPages';
import { useI18n } from './lib/i18n';

const Home = lazy(() => import('./pages/Home'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Learn = lazy(() => import('./pages/Learn'));
const Path = lazy(() => import('./pages/Path'));
const Chapter = lazy(() => import('./pages/Chapter'));
const Exam = lazy(() => import('./pages/Exam'));
const Exercises = lazy(() => import('./pages/Exercises'));
const ExercisePage = lazy(() => import('./pages/ExercisePage'));
const Ide = lazy(() => import('./pages/Ide'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectPage = lazy(() => import('./pages/ProjectPage'));
const Review = lazy(() => import('./pages/Review'));
const Achievements = lazy(() => import('./pages/Achievements'));
const Stats = lazy(() => import('./pages/Stats'));
const Profile = lazy(() => import('./pages/Profile'));
const Admin = lazy(() => import('./pages/admin/Admin'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Premium = lazy(() => import('./pages/Premium'));
const Friends = lazy(() => import('./pages/Friends'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
const AvatarEditor = lazy(() => import('./pages/AvatarEditor'));
const BestCoder = lazy(() => import('./pages/BestCoder'));
const Faq = lazy(() => import('./pages/Faq'));
const Community = lazy(() => import('./pages/Community'));
const QuizPlay = lazy(() => import('./pages/QuizPlay'));
const FeedbackPage = lazy(() => import('./pages/Feedback'));

function Protected({ children, admin }: { children: JSX.Element; admin?: boolean }) {
  const { user, loading, emailVerification } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/connexion" state={{ from: loc.pathname }} replace />;
  if (emailVerification && !user.emailVerified) return <Navigate to="/verifier-email" replace />;
  if (!user.onboardingDone && loc.pathname !== '/bienvenue') return <Navigate to="/bienvenue" replace />;
  if (admin && user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  const { locale, setLocale } = useI18n();
  useEffect(() => {
    if (user) applyTheme(user.theme);
  }, [user?.theme]); // eslint-disable-line react-hooks/exhaustive-deps
  // La langue choisie sur le compte suit l'utilisateur d'un appareil à l'autre.
  useEffect(() => {
    if (user?.locale && user.locale !== locale) setLocale(user.locale);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Loading text="Démarrage de Codemori…" />;
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/connexion" element={user ? <Navigate to="/" replace /> : <Login mode="login" />} />
        <Route path="/inscription" element={user ? <Navigate to="/" replace /> : <Login mode="register" />} />
        <Route path="/verifier-email" element={<VerifyEmail />} />
        <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />
        <Route path="/nouveau-mot-de-passe" element={<ResetPassword />} />
        <Route path="/bienvenue" element={<Protected><Onboarding /></Protected>} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route index element={<Home />} />
          <Route path="apprendre" element={<Learn />} />
          <Route path="parcours" element={<Path />} />
          <Route path="parcours/:lang" element={<Path />} />
          <Route path="chapitre/:slug" element={<Chapter />} />
          <Route path="chapitre/:slug/examen" element={<Exam />} />
          <Route path="exercices" element={<Exercises />} />
          <Route path="exercice/:id" element={<ExercisePage />} />
          <Route path="ide" element={<Ide />} />
          <Route path="projets" element={<Projects />} />
          <Route path="projets/:slug" element={<ProjectPage />} />
          <Route path="revisions" element={<Review />} />
          <Route path="succes" element={<Achievements />} />
          <Route path="statistiques" element={<Stats />} />
          <Route path="profil" element={<Profile />} />
          <Route path="premium" element={<Premium />} />
          <Route path="boutique" element={<Premium />} />
          <Route path="abonnement" element={<Premium />} />
          <Route path="amis" element={<Friends />} />
          <Route path="u/:tag" element={<UserProfile />} />
          <Route path="avatar" element={<AvatarEditor />} />
          <Route path="meilleur-codeur" element={<BestCoder />} />
          <Route path="faq" element={<Faq />} />
          <Route path="communaute" element={<Community />} />
          <Route path="blind-test/:id" element={<QuizPlay />} />
          <Route path="avis" element={<FeedbackPage />} />
          <Route path="admin/*" element={<Protected admin><Admin /></Protected>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
