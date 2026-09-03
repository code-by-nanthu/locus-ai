import { Copy } from 'lucide-react';

export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="md-code-block my-3.5">
      <div className="flex items-center justify-between h-9 pl-3.5 pr-1.5 border-b border-white/10">
        <span className="font-mono text-[11px] text-white/45">{lang || 'code'}</span>
        <button
          onClick={() => navigator.clipboard?.writeText(code)}
          title="Copy code"
          aria-label="Copy code"
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-white/45 hover:text-white/85 hover:bg-white/10 transition-colors"
        >
          <Copy size={13} />
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}
