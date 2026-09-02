import { useRef } from 'react';
import { generateSessionId, saveSession } from '../core/session.js';

type Message = any; // matches the Message type in App.tsx

interface UseSessionManagerReturn {
  sessionIdRef: React.MutableRefObject<string | null>;
  /** Call after every completed AI turn to auto-persist the conversation. */
  persistSession: (provider: string, model: string, latestHistory: Message[]) => void;
}

/**
 * Manages the stable session ID reference and the fire-and-forget session save.
 *
 * The session ID is allocated lazily on the first message so that sessions
 * with no messages don't create empty files.
 *
 * Errors are silently swallowed to never break the UI — saving is best-effort.
 */
export function useSessionManager(initialSessionId: string | null = null): UseSessionManagerReturn {
  const sessionIdRef = useRef<string | null>(initialSessionId);

  const persistSession = (provider: string, model: string, latestHistory: Message[]) => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = generateSessionId();
    }
    // Fire-and-forget — errors are silently swallowed to never break the UI
    saveSession(sessionIdRef.current, provider, model, latestHistory).catch(() => {});
  };

  return { sessionIdRef, persistSession };
}
