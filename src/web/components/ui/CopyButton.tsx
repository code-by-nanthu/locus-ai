import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '../../lib/utils.js';

export function CopyButton({ text, className }: { text?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable (non-https origin) */
    }
  };

  return (
    <button
      onClick={copy}
      title={copied ? 'Copied' : 'Copy'}
      aria-label={copied ? 'Copied' : 'Copy'}
      className={cn(
        "h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors",
        "text-ink-subtle hover:text-ink hover:bg-surface",
        className
      )}
    >
      {copied ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
    </button>
  );
}
