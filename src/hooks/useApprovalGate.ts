import { useState, useRef } from 'react';

export interface PendingApproval {
  toolName: string;
  /** Human-readable summary of what will happen (e.g. "$ npm install") */
  preview: string;
  /** Pattern key used for whitelist matching (e.g. "run_command:npm") */
  pattern: string;
}

interface ApprovalResult {
  approved: boolean;
  always: boolean;
}

interface UseApprovalGateReturn {
  pendingApproval: PendingApproval | null;
  requestApproval: (toolName: string, args: any, pattern: string) => Promise<ApprovalResult>;
  resolveApproval: (result: ApprovalResult) => void;
}

/**
 * Manages the tool-approval gate for the CLI agent loop.
 *
 * Usage:
 *   const { pendingApproval, requestApproval, resolveApproval } = useApprovalGate();
 *
 * - Call `requestApproval(name, args, pattern)` in the agent loop; it returns a
 *   Promise that resolves only when the user presses Y/N/A.
 * - Call `resolveApproval(result)` from the keyboard-input handler to unblock it.
 * - Render the approval UI when `pendingApproval` is non-null.
 */
export function useApprovalGate(): UseApprovalGateReturn {
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const resolveRef = useRef<((result: ApprovalResult) => void) | null>(null);

  const requestApproval = (toolName: string, args: any, pattern: string): Promise<ApprovalResult> => {
    const preview = toolName === 'run_command' ? `$ ${args.command}` : args.filePath;
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setPendingApproval({ toolName, preview, pattern });
    });
  };

  const resolveApproval = (result: ApprovalResult) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setPendingApproval(null);
    resolve?.(result);
  };

  return { pendingApproval, requestApproval, resolveApproval };
}
