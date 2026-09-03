import { clsx, type ClassValue } from 'clsx';
import type { Session, Message } from '../types.js';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function formatSessionTitle(id?: string, title?: string): string {
  if (title && title.trim()) return title.trim();
  if (!id) return 'New chat';
  const parts = id.split('T');
  if (parts.length === 2) {
    const time = parts[1].split('.')[0].replace(/-/g, ':');
    return `Chat ${time}`;
  }
  return `Chat ${id.slice(-6)}`;
}

export function groupSessions(sessions: Session[]) {
  const groups: { label: string; items: Session[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] }
  ];

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOf7Days = startOfToday - 86400000 * 7;

  for (const s of sessions) {
    const t = new Date(s.createdAt).getTime();
    if (t >= startOfToday) {
      groups[0].items.push(s);
    } else if (t >= startOfYesterday) {
      groups[1].items.push(s);
    } else if (t >= startOf7Days) {
      groups[2].items.push(s);
    } else {
      groups[3].items.push(s);
    }
  }

  return groups.filter(g => g.items.length > 0);
}

export function unwrapToolJson(raw: string): string {
  try {
    let trimmed = raw.trim();
    if (trimmed.startsWith('```')) {
      trimmed = trimmed.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '').trim();
    }
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const obj = JSON.parse(trimmed);
      if (obj.name && (obj.parameters || obj.arguments || obj.code || obj.text)) {
        const p = obj.parameters || obj.arguments || obj;
        const c = p.code || p.text || p.content || p.story || p.output || p.message;
        if (typeof c === 'string') {
          const logs = [...c.matchAll(/console\.log\((['"`])([\s\S]*?)\1\);?/g)];
          if (logs.length > 0) {
            return logs
              .map((m) => m[2].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\n/g, ' '))
              .join('\n\n');
          }
          return c;
        }
        // If it's a pure tool invocation without user prose, return empty string so it doesn't pollute the UI
        return '';
      }
    }
  } catch {}
  return raw;
}

export function estimateTokens(history: Message[]): number {
  return Math.round(
    history.reduce((sum, m) => sum + (m.content?.length || 0), 0) / 4
  );
}
