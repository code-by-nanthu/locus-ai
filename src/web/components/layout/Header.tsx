import { FolderGit2, Server, Keyboard, Plus, Sun, Moon, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { IconButton } from '../ui/IconButton.js';
import { cn, formatSessionTitle } from '../../lib/utils.js';

export function Header({
  sidebarOpen,
  setSidebarOpen,
  loadSessions,
  currentSessionId,
  isGenerating,
  historyLength,
  estimatedTokens,
  cwd,
  defaultModel,
  openSettings,
  setShortcutsOpen,
  startNewSession,
  isDark,
  setIsDark,
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (val: boolean) => void;
  loadSessions: () => void;
  currentSessionId: string | null;
  isGenerating: boolean;
  historyLength: number;
  estimatedTokens: number;
  cwd: string;
  defaultModel?: string;
  openSettings: () => void;
  setShortcutsOpen: (val: boolean) => void;
  startNewSession: () => void;
  isDark: boolean;
  setIsDark: (val: boolean) => void;
}) {
  return (
    <header className="h-14 shrink-0 z-20 flex items-center justify-between gap-2 px-2 sm:px-3 border-b border-line bg-canvas/80 backdrop-blur-xl">
      <div className="flex items-center gap-1 min-w-0">
        <IconButton
          label={sidebarOpen ? 'Hide chats' : 'Show chats'}
          onClick={() => {
            setSidebarOpen(!sidebarOpen);
            loadSessions();
          }}
        >
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </IconButton>

        <div className="flex items-center gap-2 min-w-0 pl-1">
          <span
            className={cn(
              "h-7 w-7 rounded-md bg-ink text-canvas font-mono text-[12px] leading-none flex items-center justify-center transition-opacity lg:duration-300",
              sidebarOpen ? "lg:opacity-0 lg:hidden" : "opacity-100"
            )}
          >
            &gt;_
          </span>
          <h1 className="text-[15px] font-semibold tracking-tight truncate">
            {formatSessionTitle(currentSessionId || undefined)}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {isGenerating && (
          <span className="mr-1 hidden sm:inline-flex items-center gap-2 h-7 pl-2.5 pr-3 rounded-full bg-accent-soft text-accent text-xs font-medium">
            <span className="breathe inline-flex gap-[3px]">
              <i className="h-1 w-1 rounded-full bg-accent not-italic" />
              <i className="h-1 w-1 rounded-full bg-accent not-italic" />
              <i className="h-1 w-1 rounded-full bg-accent not-italic" />
            </span>
            Working
          </span>
        )}
        {historyLength > 0 && (
          <span className="hidden md:inline-flex items-center h-7 px-2.5 rounded-md text-[11px] font-mono text-ink-subtle bg-surface-2 border border-line">
            ~{estimatedTokens.toLocaleString()} tokens
          </span>
        )}
        {cwd && (
          <span
            className="hidden lg:inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-mono text-ink-subtle bg-surface-2 border border-line max-w-[220px] truncate"
            title={cwd}
          >
            <FolderGit2 size={12} className="shrink-0" />
            <span className="truncate">{cwd.split('/').pop() || cwd}</span>
          </span>
        )}
        <button
          onClick={openSettings}
          className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 mr-1 rounded-lg text-[13px] font-medium bg-surface-2 hover:bg-surface border border-line hover:border-line-strong transition-colors text-ink-muted hover:text-ink"
          title="Settings"
        >
          <Server size={14} className="text-accent" />
          <span className="max-w-[100px] truncate">{defaultModel || 'Settings'}</span>
        </button>
        <IconButton label="Keyboard shortcuts (?)" onClick={() => setShortcutsOpen(true)}>
          <Keyboard size={18} />
        </IconButton>
        <IconButton label="New chat" onClick={startNewSession}>
          <Plus size={18} />
        </IconButton>
        <IconButton
          label={isDark ? 'Light appearance' : 'Dark appearance'}
          onClick={() => setIsDark(!isDark)}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </IconButton>
      </div>
    </header>
  );
}
