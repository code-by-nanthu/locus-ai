import { useState } from 'react';
import { Terminal, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils.js';

export function ToolTurn({
  name,
  content,
  isError,
  isTemp,
}: {
  name: string;
  content?: string;
  isError: boolean;
  isTemp?: boolean;
}) {
  const [open, setOpen] = useState(() => Boolean(isTemp || isError));
  const expanded = open || Boolean(isTemp);

  const body = content || '';
  const truncated = body.length > 1500;
  const preview = body.split('\n').find((l) => l.trim().length > 0)?.trim() ?? '';

  return (
    <div className="rise flex gap-3 sm:gap-3.5">
      <span
        className={cn(
          "h-7 w-7 shrink-0 rounded-lg border flex items-center justify-center",
          isTemp
            ? "bg-accent-soft border-accent-line"
            : isError
              ? "bg-danger-soft border-danger-line"
              : "bg-surface border-line"
        )}
      >
        <Terminal size={14} className={isTemp ? "text-accent" : isError ? "text-danger" : "text-ink-muted"} />
      </span>

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "rounded-xl border overflow-hidden",
            isTemp
              ? "border-accent-line bg-raised"
              : isError
                ? "border-danger-line bg-raised"
                : "border-line bg-raised"
          )}
        >
          <button
            onClick={() => setOpen((v) => !v)}
            disabled={isTemp}
            className="w-full h-10 pl-3 pr-2.5 flex items-center gap-2 text-left disabled:cursor-default"
          >
            {isTemp ? (
              <span className="spinner h-3.5 w-3.5 shrink-0" />
            ) : isError ? (
              <XCircle size={14} className="shrink-0 text-danger" />
            ) : (
              <CheckCircle2 size={14} className="shrink-0 text-ok" />
            )}

            <span className="font-mono text-[13px] shrink-0">{name}</span>

            <span className="text-xs text-ink-subtle truncate flex-1 min-w-0">
              {isTemp ? 'running' : expanded ? '' : preview}
            </span>

            {!isTemp && (
              <ChevronRight
                size={14}
                className={cn(
                  "shrink-0 text-ink-subtle transition-transform duration-200",
                  expanded && "rotate-90"
                )}
              />
            )}
          </button>

          {expanded && (
            <div
              className={cn(
                "border-t",
                isError ? "border-danger-line" : isTemp ? "border-accent-line" : "border-line"
              )}
            >
              <pre
                className={cn(
                  "m-0 px-3.5 py-3 max-h-72 overflow-auto font-mono text-xs leading-relaxed whitespace-pre-wrap break-words",
                  isError ? "bg-danger-soft text-danger" : "bg-surface/60 text-ink-muted"
                )}
              >
                {body.slice(0, 1500)}
                {truncated && '\n\n… output truncated'}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
