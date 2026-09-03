import { Bot } from 'lucide-react';

export function AssistantAvatar() {
  return (
    <span className="h-7 w-7 shrink-0 rounded-lg bg-accent-soft border border-accent-line flex items-center justify-center">
      <Bot size={15} className="text-accent" />
    </span>
  );
}

export function ThinkingRow() {
  return (
    <div className="rise flex items-center gap-3">
      <AssistantAvatar />
      <span className="breathe inline-flex gap-1 pt-0.5">
        <i className="h-1.5 w-1.5 rounded-full bg-ink-subtle not-italic" />
        <i className="h-1.5 w-1.5 rounded-full bg-ink-subtle not-italic" />
        <i className="h-1.5 w-1.5 rounded-full bg-ink-subtle not-italic" />
      </span>
    </div>
  );
}
