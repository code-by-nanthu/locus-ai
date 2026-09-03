import ReactMarkdown from 'react-markdown';
import type { Message } from '../../types.js';
import { cn, unwrapToolJson } from '../../lib/utils.js';
import { CodeBlock } from './CodeBlock.js';
import { ToolTurn } from './ToolTurn.js';
import { AssistantAvatar } from './ThinkingRow.js';
import { CopyButton } from '../ui/CopyButton.js';

const mdComponents: any = {
  // `pre` is unwrapped; CodeBlock supplies its own container.
  pre: ({ children }: any) => <>{children}</>,
  code: ({ className, children, ...rest }: any) => {
    const raw = Array.isArray(children) ? children.join('') : String(children ?? '');
    const lang = /language-([\w-]+)/.exec(className || '')?.[1];
    const isBlock = Boolean(lang) || raw.includes('\n');

    if (!isBlock) {
      return <code className="md-code-inline" {...rest}>{children}</code>;
    }
    return <CodeBlock code={raw.replace(/\n$/, '')} lang={lang} />;
  }
};

export function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === ('system' as any)) return null;

  if (msg.role === 'tool') {
    let isErr = Boolean(msg.error);
    if (!isErr && typeof msg.content === 'string') {
      try {
        const parsed = JSON.parse(msg.content);
        isErr = parsed.ok === false || parsed.success === false || Boolean(parsed.error) || Boolean(parsed.denied);
      } catch {
        isErr = msg.content.includes('"denied": true') || msg.content.includes('"error":');
      }
    }
    return <ToolTurn name={msg.name || 'tool'} content={msg.content} isError={isErr} isTemp={msg.isTemp} />;
  }

  if (msg.role === 'user') {
    return (
      <div className="rise flex justify-end">
        <div className="group max-w-[85%] flex flex-col items-end gap-1">
          <div className="rounded-2xl rounded-br-md bg-surface border border-line px-4 py-2.5">
            <div className="md">
              <ReactMarkdown components={mdComponents}>{msg.content || ''}</ReactMarkdown>
            </div>
          </div>
          <CopyButton text={msg.content} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />
        </div>
      </div>
    );
  }

  const cleanContent = unwrapToolJson(msg.content || '');
  if (!cleanContent.trim()) return null;

  return (
    <div className="rise group flex gap-3 sm:gap-3.5">
      <AssistantAvatar />
      <div className="min-w-0 flex-1">
        <div className={cn("md", msg.isTemp && "caret")}>
          <ReactMarkdown components={mdComponents}>{cleanContent}</ReactMarkdown>
        </div>
        {!msg.isTemp && (
          <div className="mt-1.5 -ml-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <CopyButton text={msg.content} />
          </div>
        )}
      </div>
    </div>
  );
}
