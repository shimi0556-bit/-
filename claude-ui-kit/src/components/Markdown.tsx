import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';

export interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps) {
  return (
    <div className="cui-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            const { className, children } = props;
            const inline = !className;
            const match = /language-(\w+)/.exec(className || '');
            const text = String(children).replace(/\n$/, '');
            if (inline) {
              return <code className="cui-inline-code">{children}</code>;
            }
            return <CodeBlock code={text} language={match?.[1]} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
