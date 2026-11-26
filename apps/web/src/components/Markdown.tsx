import { isValidElement, lazy, Suspense, type ReactElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import clsx from 'clsx';

const Anim = lazy(() => import('./Anim'));

/** Plugin remark : ```anim nom``` → le nom (écrit après « anim ») devient le contenu du bloc. */
function remarkAnim() {
  return (tree: unknown) => {
    const walk = (n: { type?: string; lang?: string; meta?: string | null; value?: string; children?: unknown[] }) => {
      if (n.type === 'code' && n.lang === 'anim' && n.meta && !n.value?.trim()) n.value = n.meta;
      (n.children as (typeof n)[] | undefined)?.forEach(walk);
    };
    walk(tree as never);
  };
}

/** Bloc ```anim nom``` → animation pédagogique ; les autres blocs restent du code. */
function Pre({ children, ...rest }: { children?: ReactNode }) {
  const child = (Array.isArray(children) ? children[0] : children) as ReactElement<{ className?: string; children?: ReactNode }> | undefined;
  if (isValidElement(child) && /\blanguage-anim\b/.test(child.props.className ?? '')) {
    const text = (n: ReactNode): string => (typeof n === 'string' ? n : Array.isArray(n) ? n.map(text).join('') : isValidElement(n) ? text((n.props as { children?: ReactNode }).children) : '');
    const meta = (child.props as { node?: { data?: { meta?: string } } }).node?.data?.meta;
    const name = (meta || text(child.props.children)).trim();
    return (
      <Suspense fallback={<div className="my-4 h-40 animate-pulse rounded-3xl bg-ink-100 dark:bg-ink-800" />}>
        <Anim name={name} />
      </Suspense>
    );
  }
  return <pre {...rest}>{children}</pre>;
}

export default function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={clsx('prose-cm', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkAnim]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true, aliases: { cpp: ['c++', 'glsl'] }, plainText: ['anim'] }]]}
        components={{ pre: Pre as never }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
