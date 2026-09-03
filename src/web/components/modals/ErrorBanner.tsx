import { AlertTriangle } from 'lucide-react';

export function ErrorBanner({
  error,
  onDismiss,
}: {
  error: string;
  onDismiss: () => void;
}) {
  return (
    <div className="mx-4 sm:mx-6 mt-3 p-3 bg-danger-soft border border-danger/30 rounded-lg flex items-center justify-between text-xs text-danger shrink-0">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="shrink-0" />
        <span>{error}</span>
      </div>
      <button onClick={onDismiss} className="underline font-medium hover:opacity-80">
        Dismiss
      </button>
    </div>
  );
}
