import * as fs from 'fs/promises';
import * as path from 'path';
import { getConfigDir } from './config.js';

// ── Session schema ─────────────────────────────────────────────────────────────

export interface SessionMessage {
  role: 'user' | 'assistant' | 'tool';
  name?: string;
  tool_call_id?: string;
  content: string | null;
  tool_calls?: any[];
  timestamp?: string;
  rejected?: boolean;
}

export interface SessionFile {
  id: string;
  title?: string;
  provider: string;
  model: string;
  createdAt: string;
  messages: SessionMessage[];
}

// ── File paths ─────────────────────────────────────────────────────────────────

function getHistoryDir(): string {
  return path.join(getConfigDir(), 'history');
}

function getSessionPath(id: string): string {
  return path.join(getHistoryDir(), `${id}.json`);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Generates a filesystem-safe session ID from the current timestamp.
 * Example: "2026-09-02T20-42-05"
 */
export function generateSessionId(): string {
  return new Date().toISOString().slice(0, 19).replace(/:/g, '-');
}

/**
 * Saves the current chat history to ~/.config/locus/history/<id>.json.
 * Creates the history directory if it doesn't exist.
 */
export async function saveSession(
  id: string,
  provider: string,
  model: string,
  messages: SessionMessage[]
): Promise<void> {
  const dir = getHistoryDir();
  await fs.mkdir(dir, { recursive: true });

  const session: SessionFile = {
    id,
    provider,
    model,
    createdAt: new Date().toISOString(),
    messages,
  };
  await fs.writeFile(getSessionPath(id), JSON.stringify(session, null, 2), 'utf-8');
}

/**
 * Loads a saved session by ID.
 * Returns null if the session file doesn't exist or is corrupt.
 */
export async function loadSession(id: string): Promise<SessionFile | null> {
  try {
    const raw = await fs.readFile(getSessionPath(id), 'utf-8');
    return JSON.parse(raw) as SessionFile;
  } catch {
    return null;
  }
}

/**
 * Permanently deletes a session file by ID.
 * Silently succeeds if the file doesn't exist.
 */
export async function deleteSession(id: string): Promise<void> {
  try {
    await fs.unlink(getSessionPath(id));
  } catch {
    // already gone — that's fine
  }
}

/**
 * Renames a session by ID.
 */
export async function renameSession(id: string, title: string): Promise<void> {
  const session = await loadSession(id);
  if (session) {
    session.title = title;
    await fs.writeFile(getSessionPath(id), JSON.stringify(session, null, 2), 'utf-8');
  }
}

/**
 * Returns all saved session IDs sorted by most recent first.
 */
export async function listSessions(): Promise<string[]> {
  try {
    const dir = getHistoryDir();
    const files = await fs.readdir(dir);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export interface SessionSummary {
  id: string;
  title?: string;
  provider: string;
  model: string;
  createdAt: string;
  turns: number; // number of user messages
}

/**
 * Returns rich metadata for all saved sessions (most recent first).
 * Does not load full message content, just enough for display.
 */
export async function listSessionsDetail(): Promise<SessionSummary[]> {
  const ids = await listSessions();
  const results = await Promise.allSettled(
    ids.map(async (id): Promise<SessionSummary> => {
      const raw = await fs.readFile(getSessionPath(id), 'utf-8');
      const session = JSON.parse(raw) as SessionFile;
      return {
        id,
        title: session.title,
        provider: session.provider,
        model: session.model,
        createdAt: session.createdAt,
        turns: session.messages.filter((m) => m.role === 'user').length,
      };
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<SessionSummary> => r.status === 'fulfilled')
    .map((r) => r.value);
}
