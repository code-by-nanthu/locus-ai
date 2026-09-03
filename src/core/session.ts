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
  schemaVersion?: number;
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

  const existing = await loadSession(id);
  const createdAt = existing?.createdAt || new Date().toISOString();
  const title = existing?.title;

  const session: SessionFile = {
    schemaVersion: 1,
    id,
    title,
    provider,
    model,
    createdAt,
    messages,
  };
  await fs.writeFile(getSessionPath(id), JSON.stringify(session, null, 2), 'utf-8');
  await updateSessionIndex({
    id,
    title,
    provider,
    model,
    createdAt,
    turns: messages.filter((m) => m.role === 'user').length,
  });
}

function getIndexPath(): string {
  return path.join(getHistoryDir(), 'sessions_index.json');
}

async function updateSessionIndex(summary: SessionSummary): Promise<void> {
  try {
    const indexPath = getIndexPath();
    let index: SessionSummary[] = [];
    try {
      index = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
    } catch {}
    const existingIdx = index.findIndex((item) => item.id === summary.id);
    if (existingIdx !== -1) {
      index[existingIdx] = { ...index[existingIdx], ...summary };
    } else {
      index.unshift(summary);
    }
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  } catch {}
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
    const indexPath = getIndexPath();
    try {
      let index: SessionSummary[] = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
      index = index.filter((item) => item.id !== id);
      await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
    } catch {}
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
    await updateSessionIndex({
      id,
      title,
      provider: session.provider,
      model: session.model,
      createdAt: session.createdAt,
      turns: session.messages.filter((m) => m.role === 'user').length,
    });
  }
}

/**
 * Truncates a session to remove the last turn(s) for retry/editing (API-6).
 */
export async function truncateSession(id: string, messageIndex?: number): Promise<SessionFile | null> {
  const session = await loadSession(id);
  if (!session) return null;

  const targetIndex = typeof messageIndex === 'number' ? messageIndex : Math.max(0, session.messages.length - 2);
  session.messages = session.messages.slice(0, targetIndex);
  await fs.writeFile(getSessionPath(id), JSON.stringify(session, null, 2), 'utf-8');
  await updateSessionIndex({
    id,
    provider: session.provider,
    model: session.model,
    createdAt: session.createdAt,
    turns: session.messages.filter((m) => m.role === 'user').length,
  });
  return session;
}

/**
 * Single-writer cross-process lock (P-6).
 * Uses .locus.lock with PID tracking to avoid concurrent write races.
 */
export async function withSessionLock<T>(fn: () => Promise<T>): Promise<T> {
  const lockFile = path.join(getConfigDir(), '.locus.lock');
  for (let i = 0; i < 10; i++) {
    try {
      await fs.writeFile(lockFile, String(process.pid), { flag: 'wx' });
      break;
    } catch {
      if (i === 9) {
        try { await fs.unlink(lockFile); } catch {}
      } else {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }
  try {
    return await fn();
  } finally {
    try { await fs.unlink(lockFile); } catch {}
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
      .filter(f => f.endsWith('.json') && f !== 'sessions_index.json')
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
  try {
    const indexPath = getIndexPath();
    const raw = await fs.readFile(indexPath, 'utf-8');
    return JSON.parse(raw) as SessionSummary[];
  } catch {}

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
  const list = results
    .filter((r): r is PromiseFulfilledResult<SessionSummary> => r.status === 'fulfilled')
    .map((r) => r.value);

  // Write cached index for next time (P-5)
  try {
    await fs.writeFile(getIndexPath(), JSON.stringify(list, null, 2), 'utf-8');
  } catch {}

  return list;
}
