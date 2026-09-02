import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';
import { getLocalClient, fetchLocalModels, Provider } from '../services/llm.js';
import { toolDefinitions, executeTool } from '../services/tools.js';
import { SyntaxHighlighter } from './SyntaxHighlighter.js';
import { loadConfig, saveConfig, LocusConfig } from '../core/config.js';
import { generateSessionId, saveSession, listSessionsDetail, loadSession, deleteSession, SessionSummary } from '../core/session.js';
import { Logo, BigLogo } from './Logo.js';

interface Message {
  role: 'user' | 'assistant' | 'tool';
  name?: string;
  tool_call_id?: string;
  content: string | null;
  tool_calls?: any[];
  timestamp?: string;
  rejected?: boolean; // true when a tool was denied by the user
}

type Step = 'SELECT_PROVIDER' | 'SELECT_MODEL' | 'SELECT_SESSION' | 'CHAT';

// ─── Available slash commands ────────────────────────────────────────────────────────────

const SLASH_COMMANDS = [
  { cmd: '/provider',  description: 'Switch the AI provider (Ollama / LM Studio)' },
  { cmd: '/model',     description: 'Switch the active model' },
  { cmd: '/sessions',  description: 'Browse and restore a previous chat session' },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ─── Reusable Components ──────────────────────────────────────────────────────

function Divider() {
  // Use full terminal width, minus 4 for the horizontal padding of the container
  const width = process.stdout.columns ? Math.max(0, process.stdout.columns - 4) : 56;
  return <Text dimColor>{'─'.repeat(width)}</Text>;
}

/** Unicode block-style progress bar for the setup wizard */
function StepBar({ current, total }: { current: number; total: number }) {
  const filled = '█'.repeat(current);
  const empty = '░'.repeat(total - current);
  return (
    <Box>
      <Text color="cyan">{filled}</Text>
      <Text dimColor>{empty}</Text>
      <Text color="blackBright">  {current}/{total}</Text>
    </Box>
  );
}

// ─── Elapsed Timer ────────────────────────────────────────────────────────────

function ElapsedTimer({ running }: { running: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      setElapsed(0);
      intervalRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  if (!running) return null;

  const s = elapsed % 60;
  const m = Math.floor(elapsed / 60);
  const label = m > 0 ? `${m}m ${s}s` : `${s}s`;
  return <Text dimColor> {label}</Text>;
}

// ─── Tool Entry ───────────────────────────────────────────────────────────────

const ToolEntry = React.memo(function ToolEntry({ name, content, rejected }: { name?: string; content: string | null; rejected?: boolean }) {
  let success = true;
  let detail = '';

  try {
    const parsed = JSON.parse(content || '{}');
    if (parsed.success === false || parsed.error) {
      success = false;
      detail = parsed.error ?? 'unknown error';
    } else if (parsed.message) {
      detail = parsed.message;
    } else if (parsed.stdout) {
      // Show up to 2 lines of stdout
      const lines = parsed.stdout.trim().split('\n').slice(0, 2);
      detail = lines.join(' ↵ ');
    } else if (parsed.workspaceFiles) {
      detail = `${parsed.workspaceFiles.length} files found`;
    } else if (parsed.content) {
      const chars = parsed.content.length;
      const lines = parsed.content.split('\n').length;
      detail = `${lines} lines, ${chars} chars`;
    }
  } catch {
    detail = 'completed';
  }

  const meta: Record<string, { icon: string; label: string }> = {
    read_file:        { icon: '↗', label: 'read' },
    write_file:       { icon: '↙', label: 'write' },
    run_command:      { icon: '⚡', label: 'exec' },
    search_workspace: { icon: '⊙', label: 'scan' },
  };
  const { icon, label } = meta[name || ''] ?? { icon: '◦', label: name ?? 'tool' };

  if (rejected) {
    return (
      <Box paddingLeft={4} marginBottom={0}>
        <Text color="red">× </Text>
        <Text color="red" bold>{label}</Text>
        <Text dimColor>  denied by user</Text>
      </Box>
    );
  }

  return (
    <Box paddingLeft={4} marginBottom={0}>
      <Text color={success ? 'blackBright' : 'red'}>{icon} </Text>
      <Text color={success ? 'blackBright' : 'red'} bold>{label}</Text>
      {detail ? <Text dimColor>  {detail}</Text> : null}
    </Box>
  );
});

// ─── Message components ───────────────────────────────────────────────────────

const UserMessage = React.memo(function UserMessage({ content, timestamp }: { content: string; timestamp?: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="blue" bold>you</Text>
        {timestamp && <Text dimColor>  {timestamp}</Text>}
      </Box>
      <Box paddingLeft={2} marginTop={0}>
        <Text color="white" wrap="wrap">{content}</Text>
      </Box>
    </Box>
  );
});

const AgentMessage = React.memo(function AgentMessage({
  content,
  timestamp,
  streaming,
}: {
  content: string;
  timestamp?: string;
  streaming?: boolean;
}) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="cyan" bold>◆ assistant</Text>
        {timestamp && !streaming && <Text dimColor>  {timestamp}</Text>}
        {streaming && <Text color="cyan" dimColor>  writing…</Text>}
      </Box>
      <Box paddingLeft={2} marginTop={0} flexDirection="column">
        {/* Use plain Text during streaming to avoid OOM from re-running the
            regex tokenizer on every incoming chunk. Highlight only after done. */}
        {streaming
          ? <Text wrap="wrap" color="white">{content}</Text>
          : <SyntaxHighlighter text={content} />}
      </Box>
    </Box>
  );
});

// ─── Empty / Welcome state ────────────────────────────────────────────────────

const FALLBACK_SUGGESTIONS = [
  'Explain how async/await works in JavaScript',
  'Write a Python script that reads a CSV file',
  'Search my workspace for TypeScript files',
  'Run: ls -la and show me the output',
];

function WelcomeHints({
  model,
  suggestions,
  loading,
}: {
  model: string;
  suggestions: string[];
  loading: boolean;
}) {
  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Box marginBottom={1}>
        <Text color="blackBright">Ready  ·  </Text>
        <Text color="cyan">{model}</Text>
      </Box>
      <Box marginBottom={1}>
        {loading ? (
          <Box>
            <Text color="cyan"><Spinner type="dots" /></Text>
            <Text dimColor> Generating suggestions…</Text>
          </Box>
        ) : (
          <Text dimColor>Try asking:</Text>
        )}
      </Box>
      {!loading && suggestions.map((s, i) => (
        <Box key={i} paddingLeft={2} marginBottom={0}>
          <Text dimColor>  {i + 1}.  </Text>
          <Text color="blackBright">{s}</Text>
        </Box>
      ))}
    </Box>
  );
}

// ─── Setup screen wrapper ─────────────────────────────────────────────────────

function SetupShell({
  stepNum,
  label,
  description,
  children,
  loading,
  error,
}: {
  stepNum: number;
  label: string;
  description: string;
  children: React.ReactNode;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <Box flexDirection="column" paddingX={3} paddingTop={1} paddingBottom={1}>

      {/* Big ASCII banner */}
      <BigLogo />

      {/* Subtitle + version */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text dimColor>Local AI agent</Text>
        <Text dimColor>v1.1.0</Text>
      </Box>

      <Divider />

      {/* Step progress */}
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <StepBar current={stepNum} total={2} />
        <Box marginTop={0}>
          <Text color="white" bold>{label}</Text>
        </Box>
        <Text dimColor>{description}</Text>
      </Box>

      {/* Content */}
      <Box marginTop={1} marginBottom={1}>
        {children}
      </Box>

      {/* Loading */}
      {loading && (
        <Box marginBottom={1}>
          <Text color="cyan"><Spinner type="dots" /></Text>
          <Text color="blackBright"> Connecting…</Text>
        </Box>
      )}

      {/* Error */}
      {error && (
        <Box marginBottom={1}>
          <Text color="red">✖  </Text>
          <Text color="red">{error}</Text>
        </Box>
      )}

      <Divider />
      {/* Key hints */}
      <Box marginTop={1}>
        <Text dimColor>↑↓</Text>
        <Text color="blackBright"> navigate   </Text>
        <Text dimColor>Enter</Text>
        <Text color="blackBright"> select   </Text>
        <Text dimColor>Ctrl+C</Text>
        <Text color="blackBright"> quit</Text>
      </Box>
    </Box>
  );
}

// ─── Item renderer for SelectInput ───────────────────────────────────────────

function ProviderItem({ label, isSelected }: { label: string; isSelected?: boolean }) {
  const descriptions: Record<string, string> = {
    Ollama: 'Local models via ollama.ai',
    'LM Studio': 'Local models via lmstudio.ai',
  };
  return (
    <Box>
      <Text color={isSelected ? 'cyan' : 'blackBright'}>{isSelected ? '▶ ' : '  '}</Text>
      <Text color={isSelected ? 'white' : 'blackBright'} bold={isSelected}>{label}</Text>
      <Text dimColor>   {descriptions[label] ?? ''}</Text>
    </Box>
  );
}

function ModelItem({ label, isSelected }: { label: string; isSelected?: boolean }) {
  return (
    <Box>
      <Text color={isSelected ? 'cyan' : 'blackBright'}>{isSelected ? '▶ ' : '  '}</Text>
      <Text color={isSelected ? 'white' : 'blackBright'} bold={isSelected}>{label}</Text>
    </Box>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

interface AppProps {
  config: LocusConfig | null;
  initialHistory: Message[];
  initialProvider: Provider | null;
  initialModel: string | null;
  initialSessionId?: string | null;
}

export function App({
  config,
  initialHistory = [],
  initialProvider = null,
  initialModel = null,
  initialSessionId = null,
}: AppProps) {
  const { exit } = useApp();

  // If config has defaults, skip the setup wizard entirely
  const hasDefaults = !!(initialProvider && initialModel);
  const [step, setStep] = useState<Step>(hasDefaults ? 'CHAT' : 'SELECT_PROVIDER');
  const [provider, setProvider] = useState<Provider>(initialProvider ?? 'ollama');
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(initialModel ?? '');

  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<Message[]>(initialHistory);
  const [currentStream, setCurrentStream] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Brief header confirmation after Ctrl+S save
  const [saveConfirmation, setSaveConfirmation] = useState(false);

  // Command palette: which item is highlighted (-1 = none)
  const [cmdPickerIndex, setCmdPickerIndex] = useState(-1);

  // Session picker focused index and delete confirmation
  const [sessionPickerIndex, setSessionPickerIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Session picker list (populated when user types /sessions)
  const [sessionList, setSessionList] = useState<SessionSummary[]>([]);

  // Stable session ID for this run — seeded from prop if restoring, else generated on first message
  const sessionIdRef = useRef<string | null>(initialSessionId ?? null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Shell-like input history
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draftQuery, setDraftQuery] = useState('');

  // ── Security approval gateway ────────────────────────────────────────────
  // Tools that require explicit user approval before running
  const GUARDED_TOOLS = new Set(['write_file', 'run_command']);

  interface PendingApproval {
    toolName: string;
    preview: string; // human-readable summary of what will happen
    resolve: (approved: boolean) => void;
  }
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const approvalResolveRef = useRef<((v: boolean) => void) | null>(null);

  // Promise that pauses the agent loop until the user presses Y or N
  const requestApproval = (toolName: string, args: any): Promise<boolean> => {
    const preview = toolName === 'run_command'
      ? `$ ${args.command}`
      : `${args.filePath}`;
    return new Promise(resolve => {
      approvalResolveRef.current = resolve;
      setPendingApproval({ toolName, preview, resolve });
    });
  };

  // Welcome hints — generated by the model on first load
  const [welcomeSuggestions, setWelcomeSuggestions] = useState<string[]>([]);
  const [welcomeLoading, setWelcomeLoading] = useState(false);

  // Generate contextual suggestions once when the chat screen opens
  useEffect(() => {
    if (step !== 'CHAT' || welcomeSuggestions.length > 0 || history.length > 0) return;

    const suggestionController = new AbortController();
    let cancelled = false;
    setWelcomeLoading(true);

    (async () => {
      try {
        const client = getLocalClient(provider);
        const response = await client.chat.completions.create({
          model: selectedModel,
          messages: [
            {
              role: 'user',
              content:
                'Generate exactly 4 short, diverse example prompts that a developer might ask a local AI CLI assistant. ' +
                'Cover different areas: coding help, file operations, shell commands, and a conceptual question. ' +
                'Reply ONLY with a valid JSON array of 4 strings, no explanation, no markdown. Example format: ["prompt1","prompt2","prompt3","prompt4"]',
            },
          ],
          stream: false,
        } as any, { signal: suggestionController.signal });

        if (cancelled) return;

        const raw: string = (response as any).choices?.[0]?.message?.content?.trim() ?? '';
        // Extract JSON array from the response (handle models that wrap in backticks)
        const jsonMatch = raw.match(/\[.*\]/s);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          
          if (Array.isArray(parsed) && parsed.length > 0) {
            setWelcomeSuggestions(parsed.slice(0, 4).map(String));
            return;
          }
        }
        // Fallback if parsing fails
        setWelcomeSuggestions(FALLBACK_SUGGESTIONS);
      } catch {
        if (!cancelled) setWelcomeSuggestions(FALLBACK_SUGGESTIONS);
      } finally {
        if (!cancelled) setWelcomeLoading(false);
      }
    })();

    return () => { 
      cancelled = true; 
      suggestionController.abort();
    };
  }, [step]);

  // ── Hotkeys ───────────────────────────────────────────────────────────────
  useInput((input, key) => {
    // Always allow quit
    if (key.ctrl && input === 'c') exit();

    // Abort stream generation
    if (key.escape && loading && !pendingApproval) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      return;
    }

    // ── Session picker keyboard controls ──────────────────────────────────
    if (step === 'SELECT_SESSION' && !loading) {
      const total = sessionList.length + 1; // +1 for "new session" row

      if (key.escape) {
        if (confirmDelete) { setConfirmDelete(false); return; }
        setSessionPickerIndex(0);
        setStep('CHAT');
        return;
      }
      if (key.upArrow) {
        setConfirmDelete(false);
        setSessionPickerIndex(i => (i <= 0 ? total - 1 : i - 1));
        return;
      }
      if (key.downArrow) {
        setConfirmDelete(false);
        setSessionPickerIndex(i => (i >= total - 1 ? 0 : i + 1));
        return;
      }
      if (key.return) {
        // Handled async in the screen block via doSelectSession — trigger via a temp state flag
        // Instead, we read focusedId from allItems inline here
        const allItems = [
          ...sessionList.map(s => ({ id: s.id })),
          { id: '__new__' },
        ];
        const focusedId = allItems[sessionPickerIndex]?.id ?? '__new__';
        if (confirmDelete) {
          // Second Enter also confirms delete
          (async () => {
            if (focusedId !== '__new__') {
              await deleteSession(focusedId);
              const updated = await listSessionsDetail();
              setSessionList(updated);
              setSessionPickerIndex(i => Math.min(i, Math.max(0, updated.length - 1)));
              setConfirmDelete(false);
            }
          })();
          return;
        }
        // Load and restore the selected session
        (async () => {
          if (focusedId === '__new__') {
            setHistory([]); sessionIdRef.current = null;
            setSessionPickerIndex(0); setStep('CHAT');
            return;
          }
          setLoading(true);
          try {
            const session = await loadSession(focusedId);
            if (session) { setHistory(session.messages as Message[]); sessionIdRef.current = focusedId; }
          } catch { setErrorMsg('Failed to load session.'); }
          finally { setLoading(false); setSessionPickerIndex(0); setConfirmDelete(false); setStep('CHAT'); }
        })();
        return;
      }
      // D key — delete with confirmation
      if (input.toLowerCase() === 'd') {
        const allItems = [...sessionList.map(s => ({ id: s.id })), { id: '__new__' }];
        const focusedId = allItems[sessionPickerIndex]?.id;
        if (!focusedId || focusedId === '__new__') return;
        if (confirmDelete) {
          // Second D confirms
          (async () => {
            await deleteSession(focusedId);
            const updated = await listSessionsDetail();
            setSessionList(updated);
            setSessionPickerIndex(i => Math.min(i, Math.max(0, updated.length - 1)));
            setConfirmDelete(false);
          })();
        } else {
          setConfirmDelete(true);
        }
        return;
      }
      return; // swallow all other keys on this screen
    }

    // Input history navigation (only when active in chat)
    if (step === 'CHAT' && !loading && !pendingApproval) {
      // Command palette navigation when query starts with '/'
      const paletteMatches = query.startsWith('/')
        ? SLASH_COMMANDS.filter(c => c.cmd.startsWith(query.trim().toLowerCase()))
        : [];

      if (paletteMatches.length > 0) {
        if (key.upArrow) {
          setCmdPickerIndex(i => (i <= 0 ? paletteMatches.length - 1 : i - 1));
          return;
        }
        if (key.downArrow) {
          setCmdPickerIndex(i => (i >= paletteMatches.length - 1 ? 0 : i + 1));
          return;
        }
        // Tab auto-completes the highlighted (or first) item
        if (key.tab) {
          const picked = paletteMatches[cmdPickerIndex >= 0 ? cmdPickerIndex : 0];
          setQuery(picked.cmd);
          setCmdPickerIndex(-1);
          return;
        }
      }

      if (key.upArrow) {
        if (inputHistory.length === 0) return;
        let newIndex = historyIndex;
        if (historyIndex === -1) {
          setDraftQuery(query);
          newIndex = inputHistory.length - 1;
        } else if (historyIndex > 0) {
          newIndex = historyIndex - 1;
        }
        setHistoryIndex(newIndex);
        setQuery(inputHistory[newIndex]);
        return;
      }
      if (key.downArrow) {
        if (historyIndex === -1) return;
        let newIndex = historyIndex + 1;
        if (newIndex >= inputHistory.length) {
          setHistoryIndex(-1);
          setQuery(draftQuery);
        } else {
          setHistoryIndex(newIndex);
          setQuery(inputHistory[newIndex]);
        }
        return;
      }
    } else if (loading || pendingApproval) {
      // Explicitly swallow conversational keyboard input when the runner is processing
      if (!pendingApproval && !key.ctrl && input !== 'c') return;
    }

    // When an approval gate is active, Y/N are captured exclusively
    if (pendingApproval) {
      const ch = input.toLowerCase();
      if (ch === 'y' || ch === 'n') {
        const approved = ch === 'y';
        const resolve = approvalResolveRef.current;
        approvalResolveRef.current = null;
        setPendingApproval(null);
        resolve?.(approved);
      }
      return; // swallow all other keys during approval
    }

    if (key.ctrl && input === 'p') { setErrorMsg(null); setStep('SELECT_PROVIDER'); }
    if (key.ctrl && input === 'n') {
      if (models.length > 0) { setErrorMsg(null); setStep('SELECT_MODEL'); }
      else setErrorMsg('No provider connected. Use Ctrl+P first.');
    }

    // Ctrl+S — save current provider + model as default
    if (key.ctrl && input === 's' && step === 'CHAT' && selectedModel) {
      const newConfig: LocusConfig = {
        ...(config ?? { autoApprove: [] }),
        defaultProvider: provider,
        defaultModel: selectedModel,
      };
      saveConfig(newConfig).then(() => {
        setSaveConfirmation(true);
        setTimeout(() => setSaveConfirmation(false), 2000);
      });
    }
  });

  // ── Provider selection ────────────────────────────────────────────────────
  const handleSelectProvider = async (item: { value: Provider }) => {
    setProvider(item.value);
    setLoading(true);
    setErrorMsg(null);
    try {
      const activeModels = await fetchLocalModels(item.value);
      if (activeModels.length === 0) throw new Error('No running models found. Start your provider first.');
      setModels(activeModels);
      setStep('SELECT_MODEL');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectModel = (item: { value: string }) => {
    setSelectedModel(item.value);
    setStep('CHAT');
  };

  // ── Pseudo-tool-call detection ──────────────────────────────────────────────
  // Some local models (e.g. smaller Ollama weights) don't understand OpenAI's
  // native function-calling protocol. Instead of emitting a tool_calls delta,
  // they output raw JSON text like:
  //   {"name": "read_file", "parameters": {"filePath": "..."} }
  // This helper detects that pattern and normalises it into a real tool call.
  function parsePseudoToolCalls(text: string): Array<{ name: string; args: Record<string, any> }> {
    const results: Array<{ name: string; args: Record<string, any> }> = [];
    const knownTools = new Set(['read_file', 'write_file', 'run_command', 'search_workspace', 'browser_action']);

    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (obj.name) {
          const raw = obj.parameters ?? obj.arguments ?? obj.input ?? obj.args ?? {};
          const args = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const matched = [...knownTools].find(t => obj.name === t || obj.name.includes(t));
          if (matched) results.push({ name: matched, args });
        }
      } catch {}
    }

    if (results.length === 0) {
      try {
        const startIdx = text.indexOf('{');
        const endIdx = text.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1) {
          const jsonStr = text.substring(startIdx, endIdx + 1);
          const obj = JSON.parse(jsonStr);
          if (obj.name) {
            const raw = obj.parameters ?? obj.arguments ?? obj.input ?? obj.args ?? {};
            const args = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const matched = [...knownTools].find(t => obj.name === t || obj.name.includes(t));
            if (matched) results.push({ name: matched, args });
          }
        }
      } catch {}
    }
    
    return results;
  }

  // ── Agent loop ────────────────────────────────────────────────────────────
  const handleSubmitChat = async () => {
    // CRITICAL: Must check loading state immediately on entry to short-circuit race conditions
    if (!query.trim() || loading) return;

    // ── Slash commands ────────────────────────────────────────────────────
    // If palette is open and an item is highlighted, Enter picks it
    const paletteMatches = query.startsWith('/')
      ? SLASH_COMMANDS.filter(c => c.cmd.startsWith(query.trim().toLowerCase()))
      : [];
    if (paletteMatches.length > 0 && cmdPickerIndex >= 0) {
      setQuery(paletteMatches[cmdPickerIndex].cmd);
      setCmdPickerIndex(-1);
      return; // let the user confirm with a second Enter
    }

    const cmd = query.trim().toLowerCase();

    if (cmd === '/provider') {
      setQuery('');
      setErrorMsg(null);
      setStep('SELECT_PROVIDER');
      return;
    }

    if (cmd === '/model') {
      setQuery('');
      setErrorMsg(null);
      if (models.length > 0) {
        setStep('SELECT_MODEL');
      } else {
        // Need to fetch models first if provider hasn't been connected yet
        setLoading(true);
        try {
          const activeModels = await fetchLocalModels(provider, config?.baseURLs?.[provider]);
          setModels(activeModels);
          setStep('SELECT_MODEL');
        } catch (err: any) {
          setErrorMsg(err.message);
        } finally {
          setLoading(false);
        }
      }
      return;
    }

    if (cmd === '/sessions') {
      setQuery('');
      setLoading(true);
      try {
        const sessions = await listSessionsDetail();
        setSessionList(sessions);
        setStep('SELECT_SESSION');
      } catch {
        setErrorMsg('Could not load sessions.');
      } finally {
        setLoading(false);
      }
      return;
    }
    // ─────────────────────────────────────────────────────────────────────

    const userInput = query;
    const ts = now();

    // Save input history for up/down arrow navigation
    setInputHistory(prev => [...prev, userInput]);
    setHistoryIndex(-1);
    setDraftQuery('');

    let localHistory: Message[] = [
      ...history,
      { role: 'user', content: userInput, timestamp: ts },
    ];
    setHistory(localHistory);
    setQuery('');
    setLoading(true);
    setAgentStatus('Thinking');

    const client = getLocalClient(provider, config?.baseURLs?.[provider]);
    let keepRunningLoop = true;

    try {
      while (keepRunningLoop) {
        setCurrentStream('');

        const hasToolsInHistory = localHistory.some(
          m => m.role === 'tool' || (m.tool_calls && m.tool_calls.length > 0)
        );
        const isToolCommand =
          /read|write|file|create|make|code|folder|directory|script|app|run|test|execute|command|install|npm|yarn|pnpm|search|find|workspace|scan|browse|navigate|click|screenshot|browser|web|url|internet/i.test(
            userInput
          ) || hasToolsInHistory;

        const requestConfig: any = {
          model: selectedModel,
          messages: [
            {
              role: 'system',
              content:
                'You are a helpful local AI CLI assistant.\n\n' +
                'RULES:\n' +
                '1. ONLY use the explicitly provided tools: read_file, write_file, run_command, search_workspace, browser_action. NEVER invent or hallucinate new tools.\n' +
                '2. If the user asks you to "write a function" or "write code", output the code directly in markdown format. DO NOT use tools for this.\n' +
                '3. ONLY use tools when interacting with the user\'s local filesystem, terminal, or browsing the web.',
            },
            ...localHistory.map(m => ({
              role: m.role,
              content: m.content,
              name: m.name,
              tool_call_id: m.tool_call_id,
              tool_calls: m.tool_calls,
            })),
          ],
          stream: true,
        };

        if (isToolCommand) {
          requestConfig.tools = toolDefinitions;
          requestConfig.tool_choice = 'auto';
        }

        let incomingBuffer = '';
        let toolCalls: any[] = [];

        abortControllerRef.current = new AbortController();

        try {
          const response = await client.chat.completions.create(requestConfig, {
            signal: abortControllerRef.current.signal,
          });

          for await (const chunk of response as any) {
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;
            if (delta.content) {
              incomingBuffer += delta.content;
              setCurrentStream(prev => prev + delta.content);
            }
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index = tc.index;
                if (!toolCalls[index]) {
                  toolCalls[index] = { id: tc.id || '', type: 'function', function: { name: tc.function?.name || '', arguments: '' } };
                }
                if (tc.function?.name) toolCalls[index].function.name += tc.function.name;
                if (tc.function?.arguments) toolCalls[index].function.arguments += tc.function.arguments;
              }
            }
          }
        } catch (err: any) {
          if (err.name === 'AbortError') {
            // User aborted the stream — keep whatever was buffered and stop the loop
            keepRunningLoop = false;
          } else {
            throw err;
          }
        } finally {
          abortControllerRef.current = null;
        }

        const finalContent = incomingBuffer || null;

        // ── Pseudo-tool-call intercept ──────────────────────────────────────
        // If the model printed JSON instead of using proper tool_calls, handle it.
        let isPseudo = false;
        if (finalContent && toolCalls.length === 0) {
          const pseudoCalls = parsePseudoToolCalls(finalContent);
          if (pseudoCalls.length > 0) {
            isPseudo = true;
            // Don't add the raw JSON to history — treat it as a silent tool call
            setCurrentStream('');

            // Synthesise fake tool_call objects
            toolCalls = pseudoCalls.map((pseudo, idx) => ({
              id: `pseudo-${Date.now()}-${idx}`,
              function: { name: pseudo.name, arguments: JSON.stringify(pseudo.args) },
            }));
          }
        }
        // ───────────────────────────────────────────────────────────────────

        if (finalContent && toolCalls.length === 0) {
          localHistory.push({ role: 'assistant', content: finalContent, timestamp: now() });
          setHistory([...localHistory]);
        }

        if (toolCalls.length > 0) {
          toolCalls = toolCalls.filter(Boolean);
          localHistory.push({ 
            role: 'assistant', 
            content: isPseudo ? null : finalContent, 
            tool_calls: toolCalls 
          });

          for (const call of toolCalls) {
            let name = call.function.name;
            // Fallback string matching guards
            if (name.includes('search_workspace')) name = 'search_workspace';
            else if (name.includes('write_file'))  name = 'write_file';
            else if (name.includes('read_file'))   name = 'read_file';
            else if (name.includes('run_command')) name = 'run_command';
            
            // Safe argument parsing fallback
            let args;
            try {
              args = JSON.parse(call.function.arguments || '{}');
            } catch {
              args = {}; // Stop JSON syntax errors from crashing the agent loop mid-run
            }

            setAgentStatus(`${name.replace('_', ' ')}`);

            // ── Security gate for destructive tools ──────────────────────
            let result: string;
            if (GUARDED_TOOLS.has(name)) {
              const approved = await requestApproval(name, args);
              if (!approved) {
                result = JSON.stringify({ denied: true });
                localHistory.push({
                  role: 'tool', name, tool_call_id: call.id,
                  content: result, rejected: true
                });
                continue;
              }
            }
            result = await executeTool(name, args);
            // ─────────────────────────────────────────────────────────────

            localHistory.push({ role: 'tool', name, tool_call_id: call.id, content: result });
          }

          setHistory([...localHistory]);
          setAgentStatus('Synthesizing');
          continue;
        }

        keepRunningLoop = false;
      }
    } catch (error: any) {
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
      setAgentStatus(null);
      setCurrentStream('');

      // ── Auto-save session after every completed AI turn ───────────────
      setHistory(latestHistory => {
        const id = sessionIdRef.current ?? (() => {
          const newId = generateSessionId();
          sessionIdRef.current = newId;
          return newId;
        })();
        sessionIdRef.current = id;
        // Fire-and-forget — errors are silently swallowed to never break the UI
        saveSession(id, provider, selectedModel, latestHistory as any).catch(() => {});
        return latestHistory;
      });
    }
  };

  // ── SCREEN: Provider ─────────────────────────────────────────────────────
  if (step === 'SELECT_PROVIDER') {
    return (
      <SetupShell
        stepNum={1}
        label="Select a provider"
        description="Which local LLM runtime are you using?"
        loading={loading}
        error={errorMsg}
      >
        <SelectInput
          items={[
            { label: 'Ollama', value: 'ollama' as Provider },
            { label: 'LM Studio', value: 'lmstudio' as Provider },
          ]}
          onSelect={handleSelectProvider}
          itemComponent={ProviderItem}
        />
      </SetupShell>
    );
  }

  // ── SCREEN: Model ────────────────────────────────────────────────────────
  if (step === 'SELECT_MODEL') {
    return (
      <SetupShell
        stepNum={2}
        label="Select a model"
        description={`Detected ${models.length} model${models.length !== 1 ? 's' : ''} on ${provider}`}
        error={errorMsg}
      >
        <SelectInput
          items={models.map(m => ({ label: m, value: m }))}
          onSelect={handleSelectModel}
          itemComponent={ModelItem}
        />
      </SetupShell>
    );
  }

  // ── SCREEN: Session Picker ────────────────────────────────────────────────
  if (step === 'SELECT_SESSION') {
    // All items including the fixed "+ New session" row at the bottom
    const allItems = [
      ...sessionList.map(s => {
        const date = new Date(s.createdAt).toLocaleString('en-GB', {
          day: '2-digit', month: 'short',
          hour: '2-digit', minute: '2-digit',
        });
        return { label: `${date}  ${s.model}  (${s.turns} turn${s.turns !== 1 ? 's' : ''})`, id: s.id };
      }),
      { label: '+ Start new session', id: '__new__' },
    ];

    const focusedId = allItems[sessionPickerIndex]?.id ?? '__new__';
    const isNewRow = focusedId === '__new__';

    const doSelectSession = async (id: string) => {
      if (id === '__new__') {
        setHistory([]);
        sessionIdRef.current = null;
        setSessionPickerIndex(0);
        setConfirmDelete(false);
        setStep('CHAT');
        return;
      }
      setLoading(true);
      try {
        const session = await loadSession(id);
        if (session) {
          setHistory(session.messages as Message[]);
          sessionIdRef.current = id;
        }
      } catch {
        setErrorMsg('Failed to load session.');
      } finally {
        setLoading(false);
        setSessionPickerIndex(0);
        setConfirmDelete(false);
        setStep('CHAT');
      }
    };

    const doDeleteFocused = async () => {
      if (isNewRow) return;
      await deleteSession(focusedId);
      // Refresh the list and keep index in bounds
      const updated = await listSessionsDetail();
      setSessionList(updated);
      setSessionPickerIndex(i => Math.min(i, Math.max(0, updated.length - 1)));
      setConfirmDelete(false);
    };

    return (
      <SetupShell
        stepNum={0}
        label="Switch session"
        description={
          sessionList.length === 0
            ? 'No sessions saved yet. — Enter start   Esc back'
            : `${sessionList.length} session${sessionList.length !== 1 ? 's' : ''} — ↑↓ navigate   Enter restore   D delete   Esc back`
        }
        loading={loading}
        error={errorMsg}
      >
        <Box flexDirection="column">
          {sessionList.length === 0 && (
            <Box marginBottom={1}>
              <Text dimColor>Start chatting to create your first session.</Text>
            </Box>
          )}
          {allItems.map((item, i) => {
            const focused = i === sessionPickerIndex;
            return (
              <Box key={item.id}>
                <Text color={focused ? 'cyan' : 'blackBright'} bold={focused}>
                  {focused ? '▶ ' : '  '}
                </Text>
                <Text color={focused ? 'white' : 'blackBright'} bold={focused}>
                  {item.label}
                </Text>
                {focused && !isNewRow && (
                  confirmDelete
                    ? <Text color="red" bold>  delete? [D] confirm   [Esc] cancel</Text>
                    : <Text dimColor>  [D] delete</Text>
                )}
              </Box>
            );
          })}
        </Box>
      </SetupShell>
    );
  }

  // Count only user turns for display
  const turnCount = history.filter(m => m.role === 'user').length;

  // ── SCREEN: Chat ─────────────────────────────────────────────────────────
  return (
    <Box flexDirection="column" paddingX={2} paddingTop={1} paddingBottom={1}>

      {/* ── Header ───────────────────────────────────────────── */}
      <Box justifyContent="space-between" marginBottom={0}>
        <Logo />
        <Box flexDirection="column" alignItems="flex-end">
          <Box>
            <Text dimColor>{provider}  </Text>
            <Text color="cyan">{selectedModel}</Text>
          </Box>
          {sessionIdRef.current && (
            <Text dimColor>session {sessionIdRef.current.slice(-14)}</Text>
          )}
        </Box>
      </Box>

      {/* ── Sub-header: commands ─────────────────────────────────────────── */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Box>
          <Text dimColor>/provider</Text>
          <Text color="blackBright">  </Text>
          <Text dimColor>/model</Text>
          <Text color="blackBright">  </Text>
          <Text dimColor>/sessions</Text>
          <Text color="blackBright">  </Text>
          <Text dimColor>Ctrl+S</Text>
          <Text color="blackBright"> save  </Text>
          {loading && !pendingApproval && (
            <>
              <Text dimColor>Esc</Text>
              <Text color="blackBright"> stop  </Text>
            </>
          )}
          <Text dimColor>Ctrl+C</Text>
          <Text color="blackBright"> quit</Text>
        </Box>
        {saveConfirmation
          ? <Text color="green">✓ Saved as default</Text>
          : turnCount > 0 && (
              <Text dimColor>{turnCount} turn{turnCount !== 1 ? 's' : ''}</Text>
            )
        }
      </Box>


      <Divider />

      {/* ── Conversation ───────────────────────────────────────────────── */}
      <Box flexDirection="column" marginTop={1}>

        {/* Empty / welcome state */}
        {history.length === 0 && !loading && (
          <WelcomeHints
            model={selectedModel}
            suggestions={welcomeSuggestions.length > 0 ? welcomeSuggestions : FALLBACK_SUGGESTIONS}
            loading={welcomeLoading}
          />
        )}

        {history.map((msg, idx) => {
          if (msg.role === 'tool') {
            return <ToolEntry key={idx} name={msg.name} content={msg.content} rejected={msg.rejected} />;
          }
          // Skip tool-call wrapper messages with no text
          if (msg.role === 'assistant' && (!msg.content || msg.content.trim() === '') && msg.tool_calls) {
            return null;
          }
          if (!msg.content) return null;

          if (msg.role === 'user') {
            return <UserMessage key={idx} content={msg.content} timestamp={msg.timestamp} />;
          }
          return <AgentMessage key={idx} content={msg.content} timestamp={msg.timestamp} />;
        })}

        {/* Live stream */}
        {currentStream.length > 0 && (
          <AgentMessage content={currentStream} streaming />
        )}
      </Box>

      {/* ── Loading / status ────────────────────────────────────────────── */}
      {loading && (
        <Box marginTop={1} marginBottom={1}>
          <Text color="cyan"><Spinner type="dots" /></Text>
          <Text color="blackBright"> {agentStatus ?? 'Thinking'}</Text>
          <ElapsedTimer running={loading && !pendingApproval} />
        </Box>
      )}

      {/* ── Security Approval Gate ─────────────────────────────────────── */}
      {pendingApproval && (
        <Box flexDirection="column" marginTop={1} marginBottom={1}>
          <Box>
            <Text color="yellow" bold>⚠ </Text>
            <Text color="yellow" bold>Permission required</Text>
          </Box>
          <Box paddingLeft={2} marginTop={0} flexDirection="column">
            <Box>
              <Text dimColor>tool    </Text>
              <Text color="white" bold>{pendingApproval.toolName.replace('_', ' ')}</Text>
            </Box>
            <Box>
              <Text dimColor>target  </Text>
              <Text color="cyan">{pendingApproval.preview}</Text>
            </Box>
          </Box>
          <Box marginTop={1} paddingLeft={2}>
            <Text color="yellow" bold>[Y]</Text>
            <Text color="blackBright"> approve   </Text>
            <Text color="red" bold>[N]</Text>
            <Text color="blackBright"> deny</Text>
          </Box>
        </Box>
      )}

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {errorMsg && (
        <Box marginTop={1} marginBottom={1}>
          <Text color="red">✖  </Text>
          <Text color="red">{errorMsg}</Text>
        </Box>
      )}

      <Divider />

      {/* ── Command palette (shown when query starts with /) ─────────────── */}
      {(() => {
        if (!query.startsWith('/') || loading) return null;
        const matches = SLASH_COMMANDS.filter(c =>
          c.cmd.startsWith(query.trim().toLowerCase())
        );
        if (matches.length === 0) return null;
        return (
          <Box flexDirection="column" marginTop={1} paddingLeft={2}>
            {matches.map((c, i) => (
              <Box key={c.cmd}>
                <Text color={i === cmdPickerIndex ? 'cyan' : 'blackBright'} bold={i === cmdPickerIndex}>
                  {i === cmdPickerIndex ? '▶ ' : '  '}
                </Text>
                <Text color={i === cmdPickerIndex ? 'white' : 'blackBright'} bold={i === cmdPickerIndex}>
                  {c.cmd}
                </Text>
                <Text dimColor>  {c.description}</Text>
              </Box>
            ))}
            <Text dimColor>  ↑↓ navigate   Tab/Enter pick</Text>
          </Box>
        );
      })()}

      <Divider />

      {/* ── Input ──────────────────────────────────────────────────────── */}
      <Box marginTop={1}>
        <Text color={loading ? 'blackBright' : 'cyan'} bold>
          {loading ? '… ' : '▶ '}
        </Text>
        <TextInput
          value={query}
          onChange={val => { setErrorMsg(null); setCmdPickerIndex(-1); setQuery(val); }}
          onSubmit={handleSubmitChat}
          placeholder={loading ? 'waiting for response…' : 'Ask anything, give a task, or type / for commands…'}
        />
      </Box>

    </Box>
  );
}
