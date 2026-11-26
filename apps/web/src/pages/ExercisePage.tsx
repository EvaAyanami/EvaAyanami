import { Link, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { Loading, ErrorBox } from '../components/ui';
import Exercise, { type PublicExercise } from '../components/Exercise';
import { t } from '../lib/i18n';

export default function ExercisePage() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi<PublicExercise & { chapter: { slug: string; title: string } | null }>(`/exercises/${id}`, [id]);
  useEffect(() => {
    if (data) document.title = `${data.title || 'Exercice'} · Codemori`;
  }, [data]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Erreur'} onRetry={reload} />;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Link to="/exercices" className="btn-ghost btn-sm"><ChevronLeft size={16} /> {t("Exercices")}</Link>
        {data.chapter && <Link to={`/chapitre/${data.chapter.slug}`} className="text-sm font-bold text-brand-500 hover:underline">Chapitre : {data.chapter.title}</Link>}
      </div>
      <Exercise exercise={data} language={data.language ?? 'rust'} />
    </div>
  );
}
