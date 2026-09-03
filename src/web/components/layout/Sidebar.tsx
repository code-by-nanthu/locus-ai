import { useState } from 'react';
import { Plus, Search, MessageSquare, Pencil, Trash2, Sun, Moon } from 'lucide-react';
import type { Session } from '../../types.js';
import { cn, formatTime, formatSessionTitle, groupSessions } from '../../lib/utils.js';

export function Sidebar({
  sidebarOpen,
  setSidebarOpen,
  sessions,
  currentSessionId,
  startNewSession,
  loadSession,
  renameSession,
  deleteSessionItem,
  isDark,
  setIsDark,
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (val: boolean) => void;
  sessions: Session[];
  currentSessionId: string | null;
  startNewSession: () => void;
  loadSession: (id: string) => void;
  renameSession: (id: string, newTitle: string) => void;
  deleteSessionItem: (e: React.MouseEvent, id: string) => void;
  isDark: boolean;
  setIsDark: (val: boolean) => void;
}) {
  const [sessionSearch, setSessionSearch] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionTitle, setEditSessionTitle] = useState('');

  const filteredSessions = sessionSearch.trim()
    ? sessions.filter(
        (s) =>
          (s.title || '').toLowerCase().includes(sessionSearch.toLowerCase()) ||
          s.id.toLowerCase().includes(sessionSearch.toLowerCase())
      )
    : sessions;

  return (
    <>
      <aside
        className={cn(
          "z-40 shrink-0 overflow-hidden bg-surface border-r border-line",
          "fixed inset-y-0 left-0 w-[17.5rem] transition-transform duration-300 ease-[cubic-bezier(0.22,0.72,0.28,1)]",
          sidebarOpen ? "translate-x-0 shadow-panel" : "-translate-x-full",
          "lg:static lg:translate-x-0 lg:shadow-none lg:transition-[width] lg:duration-300",
          sidebarOpen ? "lg:w-[17.5rem]" : "lg:w-0 lg:border-r-0"
        )}
      >
        <div className="w-[17.5rem] h-full flex flex-col">
          <div className="h-14 shrink-0 px-3 flex items-center gap-2">
            <span className="h-7 w-7 rounded-md bg-ink text-canvas font-mono text-[12px] leading-none flex items-center justify-center">
              &gt;_
            </span>
            <span className="font-semibold tracking-tight">Locus</span>
          </div>

          <div className="px-3 pb-3 flex flex-col gap-2">
            <button
              onClick={startNewSession}
              className="w-full h-9 px-3 inline-flex items-center gap-2 rounded-lg bg-raised border border-line text-sm font-medium hover:border-line-strong transition-colors"
            >
              <Plus size={15} strokeWidth={2.25} />
              New chat
            </button>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-ink-subtle" />
              <input
                type="text"
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                placeholder="Search chats..."
                className="w-full h-8 pl-8 pr-2.5 rounded-md bg-surface text-[12px] text-ink placeholder:text-ink-subtle border border-line focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
            {sessions.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <MessageSquare size={18} className="mx-auto text-ink-subtle" />
                <p className="mt-2.5 text-[13px] leading-relaxed text-ink-subtle">
                  Your chats appear here once you send a message.
                </p>
              </div>
            ) : (
              groupSessions(filteredSessions).map((group) => (
                <div key={group.label} className="mb-3">
                  <div className="px-3 pb-1 pt-2 text-[11px] font-medium text-ink-subtle">
                    {group.label}
                  </div>
                  {group.items.map((s) => (
                    <div
                      key={s.id}
                      className={cn(
                        "group relative w-full h-11 pl-3 pr-1.5 rounded-lg flex items-center justify-between gap-1 transition-colors",
                        s.id === currentSessionId ? "bg-accent-soft" : "hover:bg-raised"
                      )}
                    >
                      {editingSessionId === s.id ? (
                        <div className="flex-1 min-w-0 h-full flex items-center">
                          <input
                            autoFocus
                            type="text"
                            value={editSessionTitle}
                            onChange={(e) => setEditSessionTitle(e.target.value)}
                            onBlur={() => {
                              renameSession(s.id, editSessionTitle);
                              setEditingSessionId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                renameSession(s.id, editSessionTitle);
                                setEditingSessionId(null);
                              }
                              if (e.key === 'Escape') setEditingSessionId(null);
                            }}
                            className="w-full h-7 px-2 text-[13px] font-medium bg-surface border border-accent rounded-md outline-none focus:ring-2 focus:ring-accent/20"
                            placeholder="Chat name"
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => loadSession(s.id)}
                          className="flex-1 min-w-0 text-left flex items-center justify-between gap-3 h-full"
                        >
                          {s.id === currentSessionId && (
                            <span className="absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-r bg-accent" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block text-[13px] font-medium truncate",
                                s.id === currentSessionId
                                  ? "text-ink"
                                  : "text-ink-muted group-hover:text-ink"
                              )}
                            >
                              {formatSessionTitle(s.id, s.title)}
                            </span>
                            <span className="block text-[11px] text-ink-subtle truncate">
                              {formatTime(s.createdAt)}
                            </span>
                          </span>
                          <span className="shrink-0 text-[11px] font-mono tabular-nums text-ink-subtle mr-1">
                            {s.turns}
                          </span>
                        </button>
                      )}

                      {editingSessionId !== s.id && (
                        <div
                          className={cn(
                            "shrink-0 flex items-center transition-opacity",
                            s.id === currentSessionId
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100"
                          )}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditSessionTitle(formatSessionTitle(s.id, s.title));
                              setEditingSessionId(s.id);
                            }}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-ink-subtle hover:text-ink hover:bg-surface transition-colors"
                            title="Rename chat"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={(e) => deleteSessionItem(e, s.id)}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-ink-subtle hover:text-danger hover:bg-danger-soft transition-colors"
                            title="Delete chat"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="shrink-0 border-t border-line p-2">
            <button
              onClick={() => setIsDark(!isDark)}
              className="w-full h-9 px-3 inline-flex items-center gap-2.5 rounded-lg text-[13px] font-medium text-ink-muted hover:text-ink hover:bg-raised transition-colors"
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
              {isDark ? 'Light appearance' : 'Dark appearance'}
            </button>
            <div className="px-3 pt-1 pb-1.5 flex items-center gap-2 text-[11px] text-ink-subtle">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" />
              Running on this machine
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile scrim */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden bg-black/35 dark:bg-black/60 backdrop-blur-[2px]"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </>
  );
}
