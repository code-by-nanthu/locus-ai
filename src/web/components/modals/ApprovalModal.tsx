import { AlertTriangle } from 'lucide-react';
import type { ApprovalRequest } from '../../types.js';

export function ApprovalModal({
  request,
  onApprove,
}: {
  request: ApprovalRequest;
  onApprove: (allow: boolean, always: boolean) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/45 dark:bg-black/65 backdrop-blur-[3px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-title"
        className="pop w-full sm:max-w-xl bg-raised border border-line rounded-t-2xl sm:rounded-2xl shadow-panel overflow-hidden"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 h-9 w-9 shrink-0 rounded-lg bg-warn-soft border border-warn-line flex items-center justify-center">
              <AlertTriangle size={17} className="text-warn" />
            </span>
            <div className="min-w-0">
              <h2 id="approval-title" className="text-[17px] font-semibold tracking-tight">
                Approve this action?
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                Locus wants to use a tool that reaches your local system.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-line overflow-hidden">
            <div className="flex items-baseline gap-4 px-3.5 py-2.5 bg-surface">
              <span className="w-[4.5rem] shrink-0 text-xs font-medium text-ink-muted">Tool</span>
              <span className="font-mono text-[13px] truncate">{request.toolName}</span>
            </div>
            <div className="border-t border-line">
              <div className="px-3.5 pt-2.5 text-xs font-medium text-ink-muted">
                {request.toolName === 'run_command' ? 'Command to run' : 'Target'}
              </div>
              <div className="md-code-block mx-3.5 mt-2 mb-3.5">
                <pre className="whitespace-pre-wrap break-all">
                  {request.toolName === 'run_command'
                    ? `$ ${request.args?.command}`
                    : request.toolName === 'browser_action'
                      ? `${(request.args?.action || 'ACTION').toUpperCase()}: ${request.args?.url || request.args?.selector || request.pattern}`
                      : request.args?.filePath || request.pattern}
                </pre>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-line bg-surface/60 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            onClick={() => onApprove(false, false)}
            className="h-9 px-3.5 rounded-lg text-sm font-medium text-ink-muted hover:text-ink hover:bg-raised transition-colors"
          >
            Deny
          </button>
          <button
            onClick={() => onApprove(true, false)}
            className="h-9 px-3.5 rounded-lg text-sm font-medium bg-raised border border-line-strong hover:border-ink-subtle transition-colors"
          >
            Allow once
          </button>
          <button
            onClick={() => onApprove(true, true)}
            className="h-9 px-3.5 rounded-lg text-sm font-medium bg-accent text-accent-ink hover:bg-accent-hover transition-colors"
          >
            Always allow
          </button>
        </div>
      </div>
    </div>
  );
}
