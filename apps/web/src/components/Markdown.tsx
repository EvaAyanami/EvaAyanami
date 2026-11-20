import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import clsx from 'clsx';

export default function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={clsx('prose-cm', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { ignoreMissing: true, aliases: { cpp: ['c++'] } }]]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
