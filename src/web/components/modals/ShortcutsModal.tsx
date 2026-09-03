import { Keyboard } from 'lucide-react';

export function ShortcutsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 dark:bg-black/65 backdrop-blur-[3px]">
      <div
        role="dialog"
        aria-modal="true"
        className="pop w-full max-w-sm bg-raised border border-line rounded-2xl shadow-panel overflow-hidden p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <span className="h-9 w-9 shrink-0 rounded-lg bg-accent-soft border border-accent-line flex items-center justify-center">
            <Keyboard size={18} className="text-accent" />
          </span>
          <div>
            <h2 className="text-[16px] font-semibold tracking-tight">Keyboard Shortcuts</h2>
            <p className="text-[12px] text-ink-subtle">Quick keys to navigate Locus</p>
          </div>
        </div>

        <div className="space-y-2.5 text-[13px]">
          <div className="flex items-center justify-between py-1 border-b border-line">
            <span className="text-ink-muted">Focus composer</span>
            <kbd className="px-2 py-0.5 rounded bg-surface border border-line font-mono text-[11px] text-ink">⌘ K</kbd>
          </div>
          <div className="flex items-center justify-between py-1 border-b border-line">
            <span className="text-ink-muted">New chat</span>
            <kbd className="px-2 py-0.5 rounded bg-surface border border-line font-mono text-[11px] text-ink">⌘ N</kbd>
          </div>
          <div className="flex items-center justify-between py-1 border-b border-line">
            <span className="text-ink-muted">Cancel generation</span>
            <kbd className="px-2 py-0.5 rounded bg-surface border border-line font-mono text-[11px] text-ink">Esc</kbd>
          </div>
          <div className="flex items-center justify-between py-1 border-b border-line">
            <span className="text-ink-muted">Toggle shortcuts</span>
            <kbd className="px-2 py-0.5 rounded bg-surface border border-line font-mono text-[11px] text-ink">?</kbd>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="h-8 px-3 rounded-lg text-xs font-medium bg-surface border border-line hover:border-ink-subtle transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
