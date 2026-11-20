import { Link } from 'react-router-dom';
import { Empty } from '../components/ui';

export default function NotFound() {
  return (
    <Empty title="Page introuvable" text="Cette page n’existe pas (ou plus). Kiri te propose de retourner à l’accueil.">
      <Link to="/" className="btn-primary">
        Retour à l’accueil
      </Link>
    </Empty>
  );
}
