import { Link } from 'react-router-dom';
import { Empty } from '../components/ui';
import { t } from '../lib/i18n';

export default function NotFound() {
  return (
    <Empty title={t("Page introuvable")} text="Cette page n’existe pas (ou plus). Kiri te propose de retourner à l’accueil.">
      <Link to="/" className="btn-primary">
        {t("Retour à l’accueil")}
      </Link>
    </Empty>
  );
}
