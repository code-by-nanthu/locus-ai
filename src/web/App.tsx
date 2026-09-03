import { useState, useEffect, useRef } from 'react';
import type { Session, Message, ApprovalRequest, StreamingToolState } from './types.js';
import { estimateTokens, unwrapToolJson } from './lib/utils.js';
import { useTheme } from './hooks/useTheme.js';
import { useShortcuts } from './hooks/useShortcuts.js';
import { useScrollAnchor } from './hooks/useScrollAnchor.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { Header } from './components/layout/Header.js';
import { MessageList } from './components/chat/MessageList.js';
import { ChatInput } from './components/chat/ChatInput.js';
import { ErrorBanner } from './components/modals/ErrorBanner.js';
import { ApprovalModal } from './components/modals/ApprovalModal.js';
import { ShortcutsModal } from './components/modals/ShortcutsModal.js';
import { SettingsModal } from './components/modals/SettingsModal.js';

const PROVIDERS: Record<string, { label: string; defaultUrl: string }> = {
  ollama: { label: 'Ollama', defaultUrl: 'http://localhost:11434/v1' },
  lmstudio: { label: 'LM Studio', defaultUrl: 'http://localhost:1234/v1' },
  vllm: { label: 'vLLM', defaultUrl: 'http://localhost:8000/v1' },
  llamacpp: { label: 'llama.cpp', defaultUrl: 'http://localhost:8080/v1' },
  localai: { label: 'LocalAI', defaultUrl: 'http://localhost:8080/v1' },
  jan: { label: 'Jan', defaultUrl: 'http://localhost:1337/v1' },
  oobabooga: { label: 'TextGen WebUI', defaultUrl: 'http://localhost:5000/v1' },
  custom: { label: 'Custom (OpenAI-compatible)', defaultUrl: 'http://localhost:8000/v1' }
};

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [history, setHistory] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // SSE Streaming State
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingTool, setStreamingTool] = useState<StreamingToolState | null>(null);

  // System & Context Info
  const [cwd, setCwd] = useState('');
  const [config, setConfig] = useState<{ defaultProvider?: string; defaultModel?: string; baseURLs?: Record<string, string> } | null>(null);
  const [transportError, setTransportError] = useState<string | null>(null);

  // Modals
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [approvalReq, setApprovalReq] = useState<ApprovalRequest | null>(null);

  // Settings State
  const [modalProvider, setModalProvider] = useState('ollama');
  const [modalModel, setModalModel] = useState('');
  const [modalBaseUrl, setModalBaseUrl] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Starters
  const [starters, setStarters] = useState<string[]>([
    'Summarise the structure of this project',
    'Find every TODO under src/ and group them by file',
    'Run the test suite and explain any failures',
    'What changed in the last commit?'
  ]);
  const [startersLoading, setStartersLoading] = useState(false);
  const fetchedStartersRef = useRef(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Custom Hooks
  const { isDark, setIsDark } = useTheme();
  const { mainScrollRef, chatEndRef, handleScroll } = useScrollAnchor([history, streamingContent, streamingTool]);

  useShortcuts({
    inputRef,
    onNewChat: () => startNewSession(),
    onAbort: () => {
      if (currentSessionId) {
        fetch(`/api/chat/${currentSessionId}/abort`, { method: 'POST' }).catch(() => {});
        setIsGenerating(false);
      }
    },
    isGenerating,
    shortcutsOpen,
    setShortcutsOpen,
    onCloseModals: () => {
      setSettingsOpen(false);
      setSidebarOpen(false);
    },
  });

  // Derived State
  const nonSystemHistory = history.filter(m => m.role !== ('system' as any));
  const isFreshChat = !currentSessionId && nonSystemHistory.length === 0;
  const visibleHistory = isFreshChat ? [] : nonSystemHistory;
  const estimatedTokens = estimateTokens(history);

  // Data Loaders
  const loadConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setConfig(data);
    } catch (e) {
      console.error(e);
    }
  };

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
    loadConfig();
    fetch('/api/context')
      .then((r) => r.json())
      .then((d) => setCwd(d.cwd || ''))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isFreshChat && !fetchedStartersRef.current) {
      fetchedStartersRef.current = true;
      setStartersLoading(true);
      fetch('/api/starters')
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d.starters) && d.starters.length > 0) {
            setStarters(d.starters);
          }
        })
        .catch(() => {})
        .finally(() => setStartersLoading(false));
    }
  }, [isFreshChat]);

  // Session Handlers
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
    setHistory([]);
    setSidebarOpen(false);
  };

  const renameSession = async (id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: trimmed } : s))
    );
    try {
      await fetch(`/api/session/${id}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      await loadSessions();
    } catch (e) {
      console.error(e);
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
      console.error(e);
    }
  };

  // Settings Handlers
  const fetchModels = async (provider: string, baseUrl?: string) => {
    try {
      const urlParam = baseUrl ? `&baseUrl=${encodeURIComponent(baseUrl)}` : '';
      const res = await fetch(`/api/models?provider=${provider}${urlParam}`);
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
    const prov = config?.defaultProvider || 'ollama';
    setModalProvider(prov);
    setModalModel(config?.defaultModel || '');
    setModalBaseUrl(config?.baseURLs?.[prov] || PROVIDERS[prov]?.defaultUrl || '');
    setSettingsOpen(true);
    fetchModels(prov, config?.baseURLs?.[prov]);
  };

  const saveSettings = async () => {
    setIsSavingConfig(true);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultProvider: modalProvider,
          defaultModel: modalModel,
          baseURLs: { [modalProvider]: modalBaseUrl },
        }),
      });
      await loadConfig();
      setSettingsOpen(false);
    } catch (e) {
      console.error(e);
    }
    setIsSavingConfig(false);
  };

  // Tool Approval Handler
  const handleApproval = async (allow: boolean, always: boolean) => {
    if (!approvalReq) return;
    try {
      await fetch(`/api/auth/${approvalReq.authId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allow, always }),
      });
      setApprovalReq(null);
    } catch (e) {
      console.error('Failed to submit approval', e);
    }
  };

  // Chat Execution Handlers
  const handleRetry = async () => {
    if (isGenerating || !currentSessionId || history.length < 2) return;
    try {
      const lastUserMsg = [...history].reverse().find((m) => m.role === 'user');
      const userText = lastUserMsg?.content || '';
      const res = await fetch(`/api/session/${currentSessionId}/truncate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIndex: Math.max(0, history.length - 2) }),
      });
      if (res.ok) {
        const updated = await res.json();
        setHistory(updated.messages);
        setInput(userText);
      }
    } catch (err: any) {
      setTransportError('Failed to truncate session: ' + err.message);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return;

    setTransportError(null);
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
        body: JSON.stringify({ history: newHistory, sessionId: currentSessionId }),
      });

      if (!response.ok) {
        let errorMsg = `Server error (${response.status})`;
        try {
          const errData = await response.json();
          errorMsg = errData.error || errData.message || errorMsg;
        } catch {}
        setTransportError(errorMsg);
        setIsGenerating(false);
        return;
      }

      // Handle Slash Commands
      const ctype = response.headers.get('content-type');
      if (ctype?.includes('application/json')) {
        const data = await response.json();
        if (data.systemMessage) {
          setHistory((prev) => [...prev, { role: 'assistant', content: data.systemMessage }]);
        }
        setIsGenerating(false);
        return;
      }

      // SSE Stream Reader
      if (!response.body) throw new Error('No body in response');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      let tempContent = '';
      let tempTool: typeof streamingTool = null;
      let isDone = false;

      while (!isDone) {
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
              setHistory((prev) => [...prev, { role: 'assistant', content: unwrapToolJson(tempContent) }]);
            }
            isDone = true;
            break;
          }

          try {
            const data = JSON.parse(dataStr);
            if (data.type === 'session' && data.sessionId) {
              setCurrentSessionId(data.sessionId);
            } else if (data.type === 'error') {
              setTransportError(data.error || 'Execution error');
              isDone = true;
              break;
            } else if (data.type === 'content') {
              tempContent += data.content;
              setStreamingContent(tempContent);
            } else if (data.type === 'tool_start') {
              tempTool = { id: data.id, name: data.name, args: data.args };
              setStreamingTool(tempTool);
            } else if (data.type === 'tool_auth_required') {
              setApprovalReq({
                authId: data.authId,
                toolName: data.toolName,
                args: data.args,
                pattern: data.pattern,
              });
            } else if (data.type === 'tool_result') {
              const resultStr = typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2);
              const isError = data.ok === false || resultStr.includes('"denied": true') || resultStr.includes('"error":');

              if (tempTool) {
                const finalTool = { ...tempTool, result: resultStr, error: isError };
                const callId = data.id || finalTool.id || `call_${Date.now()}`;
                setHistory((prev) => [
                  ...prev,
                  {
                    role: 'assistant',
                    content: '',
                    tool_calls: [
                      {
                        id: callId,
                        function: { name: finalTool.name, arguments: JSON.stringify(finalTool.args) },
                      },
                    ],
                  },
                  {
                    role: 'tool',
                    name: finalTool.name,
                    tool_call_id: callId,
                    content: finalTool.result,
                    error: isError,
                  },
                ]);
              }
              setStreamingTool(null);
            }
          } catch {
            // Ignore parse errors on partial frames
          }
        }
      }
    } catch (e: any) {
      console.error(e);
      setTransportError(e.message || 'Failed to communicate with local server');
    } finally {
      setIsGenerating(false);
      setStreamingContent('');
      setStreamingTool(null);
      loadSessions();
    }
  };

  return (
    <div className="flex h-screen bg-canvas text-ink overflow-hidden font-sans">
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        sessions={sessions}
        currentSessionId={currentSessionId}
        startNewSession={startNewSession}
        loadSession={loadSession}
        renameSession={renameSession}
        deleteSessionItem={deleteSessionItem}
        isDark={isDark}
        setIsDark={setIsDark}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        <Header
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          loadSessions={loadSessions}
          currentSessionId={currentSessionId}
          currentSessionTitle={sessions.find((s) => s.id === currentSessionId)?.title}
          isGenerating={isGenerating}
          historyLength={history.length}
          estimatedTokens={estimatedTokens}
          cwd={cwd}
          defaultModel={config?.defaultModel}
          openSettings={openSettings}
          setShortcutsOpen={setShortcutsOpen}
          startNewSession={startNewSession}
          isDark={isDark}
          setIsDark={setIsDark}
        />

        {transportError && (
          <ErrorBanner error={transportError} onDismiss={() => setTransportError(null)} />
        )}

        <MessageList
          mainScrollRef={mainScrollRef}
          chatEndRef={chatEndRef}
          onScroll={handleScroll}
          isFreshChat={isFreshChat}
          visibleHistory={visibleHistory}
          streamingContent={streamingContent}
          streamingTool={streamingTool}
          isGenerating={isGenerating}
          currentSessionId={currentSessionId}
          starters={starters}
          startersLoading={startersLoading}
          onPickStarter={(text) => {
            setInput(text);
            inputRef.current?.focus();
          }}
          onRetry={handleRetry}
        />

        <ChatInput
          inputRef={inputRef}
          input={input}
          setInput={setInput}
          isGenerating={isGenerating}
          onSend={handleSend}
        />
      </div>

      {approvalReq && (
        <ApprovalModal request={approvalReq} onApprove={handleApproval} />
      )}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        providers={PROVIDERS}
        modalProvider={modalProvider}
        setModalProvider={setModalProvider}
        modalBaseUrl={modalBaseUrl}
        setModalBaseUrl={setModalBaseUrl}
        modalModel={modalModel}
        setModalModel={setModalModel}
        availableModels={availableModels}
        isSavingConfig={isSavingConfig}
        onFetchModels={fetchModels}
        onSave={saveSettings}
      />

      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}
