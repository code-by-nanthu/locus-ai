import { useState, useEffect, useRef, type ReactNode } from 'react';
import {
  Menu, Plus, ArrowUp, Terminal, AlertTriangle, Sun, Moon, Bot,
  Copy, Check, ChevronRight, ChevronDown, XCircle, CheckCircle2, MessageSquare, Trash2, Settings, Server, Pencil
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
type Session = {
  id: string;
  title?: string;
  createdAt: string;
  turns: number;
};

type Message = {
  role: 'user' | 'assistant' | 'tool';
  content?: string;
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
  isTemp?: boolean;
};

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Theme state
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDark(true);
    }
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const [history, setHistory] = useState<Message[]>([
    { role: 'assistant', content: 'Welcome to Locus. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // SSE Streaming state
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingTool, setStreamingTool] = useState<{ name: string, args: string, error?: boolean, result?: string } | null>(null);

  // Approval state

  // Config / Models state
  const [config, setConfig] = useState<{ defaultProvider: string; defaultModel: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modalProvider, setModalProvider] = useState<'ollama' | 'lmstudio'>('ollama');
  const [modalModel, setModalModel] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setConfig(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const fetchModels = async (provider: string) => {
    try {
      const res = await fetch(`/api/models?provider=${provider}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAvailableModels(data || []);
      if (data && data.length > 0 && !data.includes(modalModel)) {
        setModalModel(data[0]);
      }
    } catch (e) {
      console.error('Failed to fetch models', e);
      setAvailableModels([]);
    }
  };

  const openSettings = () => {
    setModalProvider(config?.defaultProvider as any || 'ollama');
    setModalModel(config?.defaultModel || '');
    setSettingsOpen(true);
    fetchModels(config?.defaultProvider || 'ollama');
  };

  const saveSettings = async () => {
    setIsSavingConfig(true);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultProvider: modalProvider, defaultModel: modalModel })
      });
      await loadConfig();
      setSettingsOpen(false);
    } catch (e) {
      console.error(e);
    }
    setIsSavingConfig(false);
  };


  // Session Renaming state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionTitle, setEditSessionTitle] = useState('');

  const renameSession = async (id: string, title: string) => {
    try {
      await fetch(`/api/session/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() })
      });
      loadSessions();
      setEditingSessionId(null);
    } catch (e) {
      console.error('Failed to rename session', e);
    }
  };

  const deleteSessionItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`/api/session/${id}`, { method: 'DELETE' });
      if (currentSessionId === id) {
        startNewSession();
      }
      loadSessions();
    } catch (e) {
      console.error('Failed to delete session', e);
    }
  };

  const [approvalReq, setApprovalReq] = useState<{
    authId: string;
    toolName: string;
    args: any;
    pattern: string;
  } | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, streamingContent, streamingTool]);

  const loadSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      setSessions(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSession = async (id: string) => {
    try {
      const res = await fetch(`/api/session/${id}`);
      const data = await res.json();
      setCurrentSessionId(data.id);
      setHistory(data.messages);
      setSidebarOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const startNewSession = () => {
    setCurrentSessionId(null);
    setHistory([
      { role: 'assistant', content: 'Started a new session.' }
    ]);
    setSidebarOpen(false);
  };

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return;

    const newHistory = [...history, { role: 'user' as const, content: input.trim() }];
    setHistory(newHistory);
    setInput('');
    setIsGenerating(true);
    setStreamingContent('');
    setStreamingTool(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: newHistory, sessionId: currentSessionId })
      });

      // Handle Slash Commands
      const ctype = response.headers.get('content-type');
      if (ctype?.includes('application/json')) {
        const data = await response.json();
        if (data.systemMessage) {
          setHistory(prev => [...prev, { role: 'assistant', content: data.systemMessage }]);
        }
        setIsGenerating(false);
        return;
      }

      // SSE
      if (!response.body) throw new Error('No body in response');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      let tempContent = '';
      let tempTool: typeof streamingTool = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6);

          if (dataStr === '[DONE]') {
            if (tempContent) {
              setHistory(prev => [...prev, { role: 'assistant', content: tempContent }]);
            }
            break;
          }

          try {
            const data = JSON.parse(dataStr);
            if (data.type === 'content') {
              tempContent += data.content;
              setStreamingContent(tempContent);
            } else if (data.type === 'tool_start') {
              tempTool = { name: data.name, args: data.args };
              setStreamingTool(tempTool);
            } else if (data.type === 'tool_auth_required') {
              setApprovalReq({
                authId: data.authId,
                toolName: data.toolName,
                args: data.args,
                pattern: data.pattern
              });
            } else if (data.type === 'tool_result') {
              const resultStr = typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2);
              const isError = resultStr.includes('"denied": true') || resultStr.includes('"error":');

              if (tempTool) {
                const finalTool = { ...tempTool, result: resultStr, error: isError };
                setHistory(prev => [
                  ...prev,
                  {
                    role: 'assistant',
                    tool_calls: [{ id: 'call_' + Date.now(), type: 'function', function: { name: finalTool.name, arguments: finalTool.args } }]
                  },
                  { role: 'tool', name: finalTool.name, content: finalTool.result }
                ]);
              }
              tempContent = '';
              tempTool = null;
              setStreamingContent('');
              setStreamingTool(null);
            } else if (data.type === 'error') {
              setHistory(prev => [...prev, { role: 'assistant', content: `**Error:** ${data.error}` }]);
            }
          } catch (e) {
            console.error("Parse error", e);
          }
        }
      }
    } catch (e: any) {
      setHistory(prev => [...prev, { role: 'assistant', content: `**Connection Error:** ${e.message}` }]);
    } finally {
      setIsGenerating(false);
      setStreamingContent('');
      setStreamingTool(null);
      loadSessions();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleApproval = async (approved: boolean, always: boolean) => {
    if (!approvalReq) return;

    await fetch('/api/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authId: approvalReq.authId, approved, always })
    });

    setApprovalReq(null);
  };

  // ── derived view state (no side effects) ─────────────────────────────────
  const isFreshChat = !currentSessionId && history.length <= 1;
  const visibleHistory = isFreshChat ? [] : history;

  const fillPrompt = (text: string) => {
    setInput(text);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    });
  };

  return (
    <div className="flex h-screen bg-canvas text-ink overflow-hidden font-sans">

      {/* ───────────────────────── Sidebar ───────────────────────── */}
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

          <div className="px-3 pb-3">
            <button
              onClick={startNewSession}
              className="w-full h-9 px-3 inline-flex items-center gap-2 rounded-lg bg-raised border border-line text-sm font-medium hover:border-line-strong transition-colors"
            >
              <Plus size={15} strokeWidth={2.25} />
              New chat
            </button>
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
              groupSessions(sessions).map(group => (
                <div key={group.label} className="mb-3">
                  <div className="px-3 pb-1 pt-2 text-[11px] font-medium text-ink-subtle">
                    {group.label}
                  </div>
                  {group.items.map(s => (
                    <div
                      key={s.id}
                      className={cn(
                        "group relative w-full h-11 pl-3 pr-1.5 rounded-lg flex items-center justify-between gap-1 transition-colors",
                        s.id === currentSessionId
                          ? "bg-accent-soft"
                          : "hover:bg-raised"
                      )}
                    >
                      {editingSessionId === s.id ? (
                        <div className="flex-1 min-w-0 h-full flex items-center">
                          <input
                            autoFocus
                            type="text"
                            value={editSessionTitle}
                            onChange={(e) => setEditSessionTitle(e.target.value)}
                            onBlur={() => renameSession(s.id, editSessionTitle)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') renameSession(s.id, editSessionTitle);
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
                            <span className={cn(
                              "block text-[13px] font-medium truncate",
                              s.id === currentSessionId ? "text-ink" : "text-ink-muted group-hover:text-ink"
                            )}>
                              {s.title || `Chat ${s.id.slice(-6)}`}
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
                        <div className={cn(
                          "shrink-0 flex items-center transition-opacity",
                          s.id === currentSessionId ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        )}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditSessionTitle(s.title || `Chat ${s.id.slice(-6)}`);
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

      {/* ───────────────────────── Conversation ───────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        <header className="h-14 shrink-0 z-20 flex items-center justify-between gap-2 px-2 sm:px-3 border-b border-line bg-canvas/80 backdrop-blur-xl">
          <div className="flex items-center gap-1 min-w-0">
            <IconButton
              label={sidebarOpen ? 'Hide chats' : 'Show chats'}
              onClick={() => { setSidebarOpen(!sidebarOpen); loadSessions(); }}
            >
              <Menu size={18} />
            </IconButton>

            <div className="flex items-center gap-2 min-w-0 pl-1">
              <span className={cn(
                "h-7 w-7 rounded-md bg-ink text-canvas font-mono text-[12px] leading-none flex items-center justify-center transition-opacity lg:duration-300",
                sidebarOpen ? "lg:opacity-0 lg:hidden" : "opacity-100"
              )}>
                &gt;_
              </span>
              <h1 className="text-[15px] font-semibold tracking-tight truncate">
                {currentSessionId ? `Chat ${currentSessionId.slice(-6)}` : 'New chat'}
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
            <button
              onClick={openSettings}
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 mr-1 rounded-lg text-[13px] font-medium bg-surface-2 hover:bg-surface border border-line hover:border-line-strong transition-colors text-ink-muted hover:text-ink"
              title="Settings"
            >
              <Server size={14} className="text-accent" />
              <span className="max-w-[100px] truncate">{config?.defaultModel || 'Settings'}</span>
            </button>
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

        <main className="flex-1 overflow-y-auto overscroll-contain">
          {isFreshChat ? (
            <Welcome onPick={fillPrompt} />
          ) : (
            <div className="mx-auto w-full max-w-[46rem] px-4 sm:px-6 py-7 pb-44 flex flex-col gap-6">
              {visibleHistory.map((msg, i) => (
                <MessageBubble key={i} msg={msg} />
              ))}

              {/* Active Streaming Content */}
              {streamingContent && (
                <MessageBubble msg={{ role: 'assistant', content: streamingContent, isTemp: true }} />
              )}

              {/* Active Streaming Tool */}
              {streamingTool && (
                <MessageBubble msg={{ role: 'tool', name: streamingTool.name, content: streamingTool.args, isTemp: true }} />
              )}

              {isGenerating && !streamingContent && !streamingTool && <ThinkingRow />}

              <div ref={chatEndRef} />
            </div>
          )}
        </main>

        {/* ───────────────────────── Composer ───────────────────────── */}
        <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
          <div className="h-10 bg-gradient-to-t from-canvas to-transparent" />
          <div className="bg-canvas px-4 sm:px-6 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto w-full max-w-[46rem] pointer-events-auto">
              <div className={cn(
                "relative rounded-[1.375rem] bg-raised border shadow-lift transition-[border-color,box-shadow] duration-150",
                isGenerating
                  ? "border-line"
                  : "border-line-strong focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/12"
              )}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask anything, or describe a task to run"
                  disabled={isGenerating}
                  rows={1}
                  className="block w-full max-h-[200px] min-h-[52px] resize-none bg-transparent rounded-[1.375rem] py-[15px] pl-4 pr-14 text-[15px] leading-6 outline-none placeholder:text-ink-subtle disabled:opacity-50"
                  style={{ height: '52px' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isGenerating}
                  aria-label="Send message"
                  className={cn(
                    "absolute right-2 bottom-2 h-9 w-9 inline-flex items-center justify-center rounded-full transition-all",
                    "bg-accent text-accent-ink hover:bg-accent-hover active:scale-95",
                    "disabled:bg-surface disabled:text-ink-subtle disabled:active:scale-100"
                  )}
                >
                  {isGenerating
                    ? <span className="spinner h-4 w-4" />
                    : <ArrowUp size={17} strokeWidth={2.5} />}
                </button>
              </div>

              <div className="mt-2 flex items-center justify-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-ink-subtle">
                <span className="inline-flex items-center gap-1.5">
                  <span className="kbd">Enter</span> to send
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="kbd">Shift</span><span className="kbd">Enter</span> for a new line
                </span>
                <span className="hidden sm:inline">Commands need your approval before they run</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ───────────────────────── Permission dialog ───────────────────────── */}
      {approvalReq && (
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
                  <span className="font-mono text-[13px] truncate">{approvalReq.toolName}</span>
                </div>
                <div className="border-t border-line">
                  <div className="px-3.5 pt-2.5 text-xs font-medium text-ink-muted">
                    {approvalReq.toolName === 'run_command' ? 'Command to run' : 'Target'}
                  </div>
                  <div className="md-code-block mx-3.5 mt-2 mb-3.5">
                    <pre className="whitespace-pre-wrap break-all">
                      {approvalReq.toolName === 'run_command'
                        ? `$ ${approvalReq.args?.command}`
                        : approvalReq.args?.filePath || approvalReq.pattern}
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 sm:px-6 py-4 border-t border-line bg-surface/60 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                onClick={() => handleApproval(false, false)}
                className="h-9 px-3.5 rounded-lg text-sm font-medium text-ink-muted hover:text-ink hover:bg-raised transition-colors"
              >
                Deny
              </button>
              <button
                onClick={() => handleApproval(true, false)}
                className="h-9 px-3.5 rounded-lg text-sm font-medium bg-raised border border-line-strong hover:border-ink-subtle transition-colors"
              >
                Allow once
              </button>
              <button
                onClick={() => handleApproval(true, true)}
                className="h-9 px-3.5 rounded-lg text-sm font-medium bg-accent text-accent-ink hover:bg-accent-hover transition-colors"
              >
                Always allow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────── Settings dialog ───────────────────────── */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/45 dark:bg-black/65 backdrop-blur-[3px]">
          <div
            role="dialog"
            aria-modal="true"
            className="pop w-full sm:max-w-md bg-raised border border-line rounded-t-2xl sm:rounded-2xl shadow-panel overflow-hidden"
          >
            <div className="p-5 sm:p-6 pb-4">
              <div className="flex items-center gap-3 mb-5">
                <span className="h-9 w-9 shrink-0 rounded-lg bg-accent-soft border border-accent-line flex items-center justify-center">
                  <Settings size={17} className="text-accent" />
                </span>
                <h2 className="text-[17px] font-semibold tracking-tight">
                  Model Settings
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-ink mb-1.5">Provider</label>
                <div className="relative">
                  <select 
                    value={modalProvider}
                    onChange={(e) => {
                      setModalProvider(e.target.value as any);
                      fetchModels(e.target.value);
                    }}
                    className="w-full h-10 pl-3 pr-9 rounded-xl bg-surface border border-line focus:border-accent focus:ring-4 focus:ring-accent/15 outline-none text-[14px] text-ink appearance-none cursor-pointer"
                  >
                    <option value="ollama">Ollama</option>
                    <option value="lmstudio">LM Studio</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none" />
                </div>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-ink mb-1.5">Model</label>
                <div className="relative">
                  <select
                    value={modalModel}
                    onChange={(e) => setModalModel(e.target.value)}
                    className="w-full h-10 pl-3 pr-9 rounded-xl bg-surface border border-line focus:border-accent focus:ring-4 focus:ring-accent/15 outline-none text-[14px] text-ink disabled:opacity-50 appearance-none cursor-pointer"
                    disabled={availableModels.length === 0}
                  >
                    {availableModels.length === 0 && (
                      <option value="">No models found...</option>
                    )}
                    {availableModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none" />
                </div>
                  {availableModels.length === 0 && (
                    <p className="mt-2 text-xs text-warn flex items-center gap-1.5">
                      <AlertTriangle size={12} />
                      Make sure {modalProvider === 'ollama' ? 'Ollama' : 'LM Studio'} is running locally.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="px-5 sm:px-6 py-4 border-t border-line bg-surface/60 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                onClick={() => setSettingsOpen(false)}
                className="h-9 px-4 rounded-lg text-sm font-medium text-ink-muted hover:text-ink hover:bg-raised transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveSettings}
                disabled={isSavingConfig || !modalModel}
                className="h-9 px-4 rounded-lg text-sm font-medium bg-accent text-accent-ink hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSavingConfig && <span className="ring-spin h-3.5 w-3.5 border-accent-ink border-t-transparent" />}
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

/* ===========================================================================
   Presentational pieces
   ======================================================================== */

function IconButton({ label, onClick, children }: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface transition-colors"
    >
      {children}
    </button>
  );
}

const STARTERS = [
  'Summarise the structure of this project',
  'Find every TODO under src/ and group them by file',
  'Run the test suite and explain any failures',
  'What changed in the last commit?'
];

function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="min-h-full flex items-center justify-center px-5 pb-44 pt-10">
      <div className="w-full max-w-[36rem] text-center rise">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-canvas font-mono text-base">
          &gt;_
        </span>
        <h2 className="mt-5 text-[26px] sm:text-[30px] font-semibold tracking-[-0.02em] leading-tight">
          What are we working on?
        </h2>
        <p className="mt-2.5 text-[15px] leading-relaxed text-ink-muted">
          Locus reads your files and runs commands on this machine. You approve
          anything that touches the system.
        </p>

        <div className="mt-7 grid gap-2 sm:grid-cols-2 text-left">
          {STARTERS.map(s => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="group h-full px-3.5 py-3 rounded-xl bg-raised border border-line hover:border-line-strong transition-colors flex items-start justify-between gap-3"
            >
              <span className="text-[13px] leading-snug text-ink-muted group-hover:text-ink transition-colors">
                {s}
              </span>
              <ChevronRight size={14} className="mt-0.5 shrink-0 text-ink-subtle" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ThinkingRow() {
  return (
    <div className="rise flex items-center gap-3">
      <AssistantAvatar />
      <span className="breathe inline-flex gap-1 pt-0.5">
        <i className="h-1.5 w-1.5 rounded-full bg-ink-subtle not-italic" />
        <i className="h-1.5 w-1.5 rounded-full bg-ink-subtle not-italic" />
        <i className="h-1.5 w-1.5 rounded-full bg-ink-subtle not-italic" />
      </span>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <span className="h-7 w-7 shrink-0 rounded-lg bg-accent-soft border border-accent-line flex items-center justify-center">
      <Bot size={15} className="text-accent" />
    </span>
  );
}

function CopyButton({ text, className }: { text?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable (non-https origin) */
    }
  };

  return (
    <button
      onClick={copy}
      title={copied ? 'Copied' : 'Copy'}
      aria-label={copied ? 'Copied' : 'Copy'}
      className={cn(
        "h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors",
        "text-ink-subtle hover:text-ink hover:bg-surface",
        className
      )}
    >
      {copied ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
    </button>
  );
}

/* ── Markdown renderers ─────────────────────────────────────────────────── */

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="md-code-block my-3.5">
      <div className="flex items-center justify-between h-9 pl-3.5 pr-1.5 border-b border-white/10">
        <span className="font-mono text-[11px] text-white/45">{lang || 'code'}</span>
        <button
          onClick={() => navigator.clipboard?.writeText(code)}
          title="Copy code"
          aria-label="Copy code"
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-white/45 hover:text-white/85 hover:bg-white/10 transition-colors"
        >
          <Copy size={13} />
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

const mdComponents: any = {
  // `pre` is unwrapped; CodeBlock supplies its own container.
  pre: ({ children }: any) => <>{children}</>,
  code: ({ className, children, ...rest }: any) => {
    const raw = Array.isArray(children) ? children.join('') : String(children ?? '');
    const lang = /language-([\w-]+)/.exec(className || '')?.[1];
    const isBlock = Boolean(lang) || raw.includes('\n');

    if (!isBlock) {
      return <code className="md-code-inline" {...rest}>{children}</code>;
    }
    return <CodeBlock code={raw.replace(/\n$/, '')} lang={lang} />;
  }
};

/* ── Turns ──────────────────────────────────────────────────────────────── */

export function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === 'tool' || msg.tool_calls) {
    const name = msg.name || msg.tool_calls?.[0]?.function?.name;
    const content = msg.content || msg.tool_calls?.[0]?.function?.arguments;
    if (!name) return null;

    const isError = typeof content === 'string' && (content.includes('"denied": true') || content.includes('"error":'));
    return <ToolTurn name={name} content={content} isError={isError} isTemp={msg.isTemp} />;
  }

  if (msg.role === 'user') {
    return (
      <div className="rise flex justify-end">
        <div className="group max-w-[85%] flex flex-col items-end gap-1">
          <div className="rounded-2xl rounded-br-md bg-surface border border-line px-4 py-2.5">
            <div className="md">
              <ReactMarkdown components={mdComponents}>{msg.content || ''}</ReactMarkdown>
            </div>
          </div>
          <CopyButton text={msg.content} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="rise group flex gap-3 sm:gap-3.5">
      <AssistantAvatar />
      <div className="min-w-0 flex-1">
        <div className={cn("md", msg.isTemp && "caret")}>
          <ReactMarkdown components={mdComponents}>{msg.content || ''}</ReactMarkdown>
        </div>
        {!msg.isTemp && (
          <div className="mt-1.5 -ml-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <CopyButton text={msg.content} />
          </div>
        )}
      </div>
    </div>
  );
}

function ToolTurn({ name, content, isError, isTemp }: {
  name: string;
  content?: string;
  isError: boolean;
  isTemp?: boolean;
}) {
  const [open, setOpen] = useState(() => Boolean(isTemp || isError));
  const expanded = open || Boolean(isTemp);

  const body = content || '';
  const truncated = body.length > 1500;
  const preview = body.split('\n').find(l => l.trim().length > 0)?.trim() ?? '';

  return (
    <div className="rise flex gap-3 sm:gap-3.5">
      <span className={cn(
        "h-7 w-7 shrink-0 rounded-lg border flex items-center justify-center",
        isTemp ? "bg-accent-soft border-accent-line"
          : isError ? "bg-danger-soft border-danger-line"
            : "bg-surface border-line"
      )}>
        <Terminal size={14} className={isTemp ? "text-accent" : isError ? "text-danger" : "text-ink-muted"} />
      </span>

      <div className="min-w-0 flex-1">
        <div className={cn(
          "rounded-xl border overflow-hidden",
          isTemp ? "border-accent-line bg-raised"
            : isError ? "border-danger-line bg-raised"
              : "border-line bg-raised"
        )}>
          <button
            onClick={() => setOpen(v => !v)}
            disabled={isTemp}
            className="w-full h-10 pl-3 pr-2.5 flex items-center gap-2 text-left disabled:cursor-default"
          >
            {isTemp
              ? <span className="spinner h-3.5 w-3.5 shrink-0" />
              : isError
                ? <XCircle size={14} className="shrink-0 text-danger" />
                : <CheckCircle2 size={14} className="shrink-0 text-ok" />}

            <span className="font-mono text-[13px] shrink-0">{name}</span>

            <span className="text-xs text-ink-subtle truncate flex-1 min-w-0">
              {isTemp ? 'running' : expanded ? '' : preview}
            </span>

            {!isTemp && (
              <ChevronRight
                size={14}
                className={cn(
                  "shrink-0 text-ink-subtle transition-transform duration-200",
                  expanded && "rotate-90"
                )}
              />
            )}
          </button>

          {expanded && (
            <div className={cn(
              "border-t",
              isError ? "border-danger-line" : isTemp ? "border-accent-line" : "border-line"
            )}>
              <pre className={cn(
                "m-0 px-3.5 py-3 max-h-72 overflow-auto font-mono text-xs leading-relaxed whitespace-pre-wrap break-words",
                isError ? "bg-danger-soft text-danger" : "bg-surface/60 text-ink-muted"
              )}>
                {body.slice(0, 1500)}{truncated && '\n\n… output truncated'}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── helpers ────────────────────────────────────────────────────────────── */

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function groupSessions(sessions: Session[]) {
  const buckets: { label: string; items: Session[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] }
  ];

  const now = Date.now();
  const day = 86_400_000;

  for (const s of sessions) {
    const t = new Date(s.createdAt).getTime();
    const age = Number.isNaN(t) ? Infinity : now - t;
    const isToday = !Number.isNaN(t) && new Date(t).toDateString() === new Date(now).toDateString();

    if (isToday) buckets[0].items.push(s);
    else if (age < 7 * day) buckets[1].items.push(s);
    else buckets[2].items.push(s);
  }

  return buckets.filter(b => b.items.length > 0);
}
