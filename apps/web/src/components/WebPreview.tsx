import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';

/**
 * Aperçu en direct d'un document HTML/CSS. L'iframe est isolée (sandbox sans
 * scripts) : le code de l'apprenant ne peut rien exécuter.
 */
export default function WebPreview({ html, className, title = 'Aperçu' }: { html: string; className?: string; title?: string }) {
  const [doc, setDoc] = useState(html);
  useEffect(() => {
    const t = setTimeout(() => setDoc(html), 250);
    return () => clearTimeout(t);
  }, [html]);
  return (
    <div className={`flex h-full min-h-[180px] flex-col bg-white ${className ?? ''}`}>
      <div className="flex items-center gap-2 border-b border-ink-200 bg-ink-50 px-3 py-1.5 text-xs font-bold text-ink-500">
        <Eye size={14} /> {title}
        <span className="ml-2 flex gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </span>
      </div>
      <iframe title={title} sandbox="" srcDoc={doc} className="w-full flex-1 bg-white" />
    </div>
  );
}

/** Remplit les trous {{?}} d'un modèle (exercices « compléter » HTML/CSS). */
export function fillTemplate(template: string, blanks: string[]) {
  let i = 0;
  return template.replace(/\{\{\?\}\}/g, () => blanks[i++] ?? '');
}
