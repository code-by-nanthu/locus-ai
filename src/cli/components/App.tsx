import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { getLocalClient, fetchLocalModels, Provider, DEFAULT_URLS } from '../../services/llm.js';
import { toolDefinitions, executeTool, normalizeToolName } from '../../services/tools.js';
import { fetchPromptSuggestions } from '../../services/agent.js';
import { saveConfig, LocusConfig } from '../../core/config.js';
import { listSessionsDetail, loadSession, deleteSession, SessionSummary } from '../../core/session.js';
import { GUARDED_TOOLS, FALLBACK_SUGGESTIONS } from '../../core/constants.js';
import { useApprovalGate } from '../hooks/useApprovalGate.js';
import { useSessionManager } from '../hooks/useSessionManager.js';
import { Logo } from './common/Logo.js';
import { Divider } from './common/Divider.js';
import { ElapsedTimer } from './common/ElapsedTimer.js';
import { ToolEntry } from './chat/ToolEntry.js';
import { UserMessage } from './chat/UserMessage.js';
import { AgentMessage } from './chat/AgentMessage.js';
import { WelcomeHints } from './chat/WelcomeHints.js';
import { SetupShell } from './setup/SetupShell.js';
import { ProviderItem } from './setup/ProviderItem.js';
import { ModelItem } from './setup/ModelItem.js';

export interface Message {
  role: 'user' | 'assistant' | 'tool';
  name?: string;
  tool_call_id?: string;
  content: string | null;
  tool_calls?: any[];
  timestamp?: string;
  rejected?: boolean; // true when a tool was denied by the user
}

export type Step = 'SELECT_PROVIDER' | 'SELECT_URL' | 'SELECT_MODEL' | 'SELECT_SESSION' | 'CHAT';

// ─── Available slash commands ────────────────────────────────────────────────────────────

export const SLASH_COMMANDS = [
  { cmd: '/provider', description: 'Switch the AI provider' },
  { cmd: '/model', description: 'Switch the active model' },
  { cmd: '/sessions', description: 'Browse and restore a previous chat session' },
  { cmd: '/whitelist', description: 'View or clear auto-approved tools' },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ─── Pseudo-tool-call detection ──────────────────────────────────────────────
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
        const matched = [...knownTools].find((t) => obj.name === t || obj.name.includes(t));
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
          const matched = [...knownTools].find((t) => obj.name === t || obj.name.includes(t));
          if (matched) results.push({ name: matched, args });
        }
      }
    } catch {}
  }

  return results;
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export interface AppProps {
  config: LocusConfig | null;
  initialHistory: Message[];
  initialProvider: Provider | null;
  initialModel: string | null;
  initialSessionId?: string | null;
}

export function App({
  config: initialConfig,
  initialHistory = [],
  initialProvider = null,
  initialModel = null,
  initialSessionId = null,
}: AppProps) {
  const { exit } = useApp();
  const [config, setConfig] = useState<LocusConfig | null>(initialConfig);

  // If config has defaults, skip the setup wizard entirely
  const hasDefaults = !!(initialProvider && initialModel);
  const [step, setStep] = useState<Step>(hasDefaults ? 'CHAT' : 'SELECT_PROVIDER');
  const [provider, setProvider] = useState<Provider>(initialProvider ?? 'ollama');
  const [draftUrl, setDraftUrl] = useState<string>('');
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(initialModel ?? '');

  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<Message[]>(initialHistory);
  const [streamingContent, setStreamingContent] = useState('');
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

  const abortControllerRef = useRef<AbortController | null>(null);

  // Shell-like input history
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draftQuery, setDraftQuery] = useState('');

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const { sessionIdRef, persistSession } = useSessionManager(initialSessionId);
  const { pendingApproval, requestApproval, resolveApproval } = useApprovalGate();

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
        const suggestions = await fetchPromptSuggestions(
          client,
          selectedModel,
          suggestionController.signal
        );
        if (!cancelled) setWelcomeSuggestions(suggestions);
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

    // Go back on setup screens
    if (key.escape && !loading) {
      switch (step) {
        case 'SELECT_URL':
        case 'SELECT_MODEL':
          setErrorMsg(null);
          setStep('SELECT_PROVIDER');
          return;
        case 'SELECT_PROVIDER':
          if (hasDefaults) {
            setErrorMsg(null);
            setStep('CHAT');
          }
          return;
      }
    }

    // ── Session picker keyboard controls ──────────────────────────────────
    if (step === 'SELECT_SESSION' && !loading) {
      const total = sessionList.length + 1; // +1 for "new session" row

      if (key.escape) {
        if (confirmDelete) {
          setConfirmDelete(false);
          return;
        }
        setSessionPickerIndex(0);
        setStep('CHAT');
        return;
      }
      if (key.upArrow) {
        setConfirmDelete(false);
        setSessionPickerIndex((i) => (i <= 0 ? total - 1 : i - 1));
        return;
      }
      if (key.downArrow) {
        setConfirmDelete(false);
        setSessionPickerIndex((i) => (i >= total - 1 ? 0 : i + 1));
        return;
      }
      if (key.return) {
        const allItems = [...sessionList.map((s) => ({ id: s.id })), { id: '__new__' }];
        const focusedId = allItems[sessionPickerIndex]?.id ?? '__new__';
        if (confirmDelete) {
          // Second Enter also confirms delete
          (async () => {
            if (focusedId !== '__new__') {
              await deleteSession(focusedId);
              const updated = await listSessionsDetail();
              setSessionList(updated);
              setSessionPickerIndex((i) => Math.min(i, Math.max(0, updated.length - 1)));
              setConfirmDelete(false);
            }
          })();
          return;
        }
        // Load and restore the selected session
        (async () => {
          if (focusedId === '__new__') {
            setHistory([]);
            sessionIdRef.current = null;
            setSessionPickerIndex(0);
            setStep('CHAT');
            return;
          }
          setLoading(true);
          try {
            const session = await loadSession(focusedId);
            if (session) {
              setHistory(session.messages as Message[]);
              sessionIdRef.current = focusedId;
            }
          } catch {
            setErrorMsg('Failed to load session.');
          } finally {
            setLoading(false);
            setSessionPickerIndex(0);
            setConfirmDelete(false);
            setStep('CHAT');
          }
        })();
        return;
      }
      // D key — delete with confirmation
      if (input.toLowerCase() === 'd') {
        const allItems = [...sessionList.map((s) => ({ id: s.id })), { id: '__new__' }];
        const focusedId = allItems[sessionPickerIndex]?.id;
        if (!focusedId || focusedId === '__new__') return;
        if (confirmDelete) {
          (async () => {
            await deleteSession(focusedId);
            const updated = await listSessionsDetail();
            setSessionList(updated);
            setSessionPickerIndex((i) => Math.min(i, Math.max(0, updated.length - 1)));
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
        ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(query.trim().toLowerCase()))
        : [];

      if (paletteMatches.length > 0) {
        if (key.upArrow) {
          setCmdPickerIndex((i) => (i <= 0 ? paletteMatches.length - 1 : i - 1));
          return;
        }
        if (key.downArrow) {
          setCmdPickerIndex((i) => (i >= paletteMatches.length - 1 ? 0 : i + 1));
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

    // When an approval gate is active, Y/N/A are captured exclusively
    if (pendingApproval) {
      const ch = input.toLowerCase();
      if (ch === 'y' || ch === 'n' || ch === 'a') {
        resolveApproval({ approved: ch !== 'n', always: ch === 'a' });
      }
      return; // swallow all other keys during approval
    }

    if (key.ctrl && input === 'p') {
      setErrorMsg(null);
      setStep('SELECT_PROVIDER');
    }
    if (key.ctrl && input === 'n') {
      if (models.length > 0) {
        setErrorMsg(null);
        setStep('SELECT_MODEL');
      } else setErrorMsg('No provider connected. Use Ctrl+P first.');
    }

    // Ctrl+S — save current provider + model as default
    if (key.ctrl && input === 's' && step === 'CHAT' && selectedModel) {
      const newConfig: any = {
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
  const handleSelectProvider = (item: { value: Provider }) => {
    setProvider(item.value);
    setDraftUrl(config?.baseURLs?.[item.value] || DEFAULT_URLS[item.value] || '');
    setErrorMsg(null);
    setStep('SELECT_URL');
  };

  const handleSelectUrlSubmit = async (url: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      setConfig((prev) => ({
        ...(prev || { defaultProvider: 'ollama', defaultModel: '', autoApprove: [] }),
        baseURLs: { ...(prev?.baseURLs || {}), [provider]: url },
      }));

      const activeModels = await fetchLocalModels(provider, url);
      if (activeModels.length === 0) throw new Error('No running models found at this URL.');
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

  // ── Agent loop ────────────────────────────────────────────────────────────
  const handleSubmitChat = async () => {
    if (!query.trim() || loading) return;

    // ── Slash commands ────────────────────────────────────────────────────
    const paletteMatches = query.startsWith('/')
      ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(query.trim().toLowerCase()))
      : [];
    if (paletteMatches.length > 0 && cmdPickerIndex >= 0) {
      setQuery(paletteMatches[cmdPickerIndex].cmd);
      setCmdPickerIndex(-1);
      return;
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
        setLoading(true);
        try {
          const activeModels = await fetchLocalModels(provider, config?.baseURLs?.[provider as any]);
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

    if (cmd === '/whitelist') {
      setQuery('');
      setHistoryIndex(-1);
      setDraftQuery('');
      const list = config?.autoApprove || [];
      const content =
        list.length === 0
          ? 'Your auto-approve whitelist is currently empty.'
          : `**Auto-approved patterns:**\n${list.map((l) => `- ${l}`).join('\n')}\n\nType \`/whitelist clear\` to reset it.`;
      setHistory((prev) => [...prev, { role: 'assistant', content, timestamp: now() }]);
      return;
    }

    if (cmd === '/whitelist clear') {
      setQuery('');
      setHistoryIndex(-1);
      setDraftQuery('');
      const newConfig: LocusConfig = {
        defaultProvider: 'ollama',
        defaultModel: '',
        ...config,
        autoApprove: [],
      };
      setConfig(newConfig);
      saveConfig(newConfig).catch(() => {});
      setHistory((prev) => [
        ...prev,
        { role: 'assistant', content: 'Whitelist cleared successfully.', timestamp: now() },
      ]);
      return;
    }

    const userInput = query;
    const ts = now();

    setInputHistory((prev) => [...prev, userInput]);
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

    try {
      while (true) {
        setStreamingContent('');

        const hasToolsInHistory = localHistory.some(
          (m) => m.role === 'tool' || (m.tool_calls && m.tool_calls.length > 0)
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
            ...localHistory.map((m) => ({
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

        let accumulatedContent = '';
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
              accumulatedContent += delta.content;
              setStreamingContent((prev) => prev + delta.content);
            }
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index = tc.index;
                if (!toolCalls[index]) {
                  toolCalls[index] = {
                    id: tc.id || '',
                    type: 'function',
                    function: { name: tc.function?.name || '', arguments: '' },
                  };
                }
                if (tc.function?.name) toolCalls[index].function.name += tc.function.name;
                if (tc.function?.arguments) toolCalls[index].function.arguments += tc.function.arguments;
              }
            }
          }
        } catch (err: any) {
          if (err.name === 'AbortError') {
            break;
          }
          throw err;
        } finally {
          abortControllerRef.current = null;
        }

        const finalContent = accumulatedContent || null;

        // ── Pseudo-tool-call intercept ──────────────────────────────────────
        let isPseudoToolCall = false;
        if (finalContent && toolCalls.length === 0) {
          const pseudoCalls = parsePseudoToolCalls(finalContent);
          if (pseudoCalls.length > 0) {
            isPseudoToolCall = true;
            setStreamingContent('');
            toolCalls = pseudoCalls.map((pseudo, idx) => ({
              id: `pseudo-${Date.now()}-${idx}`,
              function: { name: pseudo.name, arguments: JSON.stringify(pseudo.args) },
            }));
          }
        }

        if (finalContent && toolCalls.length === 0) {
          localHistory.push({ role: 'assistant', content: finalContent, timestamp: now() });
          setHistory([...localHistory]);
          break; // text-only response — we're done
        }

        if (toolCalls.length > 0) {
          toolCalls = toolCalls.filter(Boolean);
          localHistory.push({
            role: 'assistant',
            content: isPseudoToolCall ? null : finalContent,
            tool_calls: toolCalls,
          });

          for (const call of toolCalls) {
            const name = normalizeToolName(call.function.name);

            let args: Record<string, any>;
            try {
              args = JSON.parse(call.function.arguments || '{}');
            } catch {
              args = {};
            }

            setAgentStatus(name.replace('_', ' '));

            // ── Security gate for destructive tools ──────────────────────
            let result: string;
            if (GUARDED_TOOLS.has(name)) {
              const execName =
                name === 'run_command' ? (args.command ?? '').trim().split(/\s+/)[0] : '';
              const pattern = name === 'run_command' ? `run_command:${execName}` : name;

              if (!config?.autoApprove?.includes(pattern)) {
                const approvalResult = await requestApproval(name, args, pattern);
                if (!approvalResult.approved) {
                  localHistory.push({
                    role: 'tool',
                    name,
                    tool_call_id: call.id,
                    content: JSON.stringify({ denied: true }),
                    rejected: true,
                  });
                  continue;
                }
                if (approvalResult.always) {
                  const newConfig: LocusConfig = {
                    defaultProvider: 'ollama',
                    defaultModel: '',
                    ...config,
                    autoApprove: [...(config?.autoApprove ?? []), pattern],
                  };
                  setConfig(newConfig);
                  await saveConfig(newConfig);
                }
              }
            }
            result = await executeTool(name, args);

            localHistory.push({ role: 'tool', name, tool_call_id: call.id, content: result });
          }

          setHistory([...localHistory]);
          setAgentStatus('Synthesizing');
          continue;
        }

        break;
      }
    } catch (error: any) {
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
      setAgentStatus(null);
      setStreamingContent('');
      persistSession(provider, selectedModel, localHistory);
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
            { label: 'LocalAI', value: 'localai' as Provider },
            { label: 'vLLM', value: 'vllm' as Provider },
            { label: 'Jan', value: 'jan' as Provider },
            { label: 'GPT4All', value: 'gpt4all' as Provider },
            { label: 'Llama.cpp', value: 'llamacpp' as Provider },
            { label: 'Oobabooga', value: 'oobabooga' as Provider },
          ]}
          onSelect={handleSelectProvider}
          itemComponent={ProviderItem}
        />
      </SetupShell>
    );
  }

  // ── SCREEN: URL ──────────────────────────────────────────────────────────
  if (step === 'SELECT_URL') {
    return (
      <SetupShell
        stepNum={1}
        label="Confirm Base URL"
        description="Press Enter to accept or type a custom port/URL"
        error={errorMsg}
        loading={loading}
      >
        <Box paddingLeft={2} borderStyle="round" borderColor={errorMsg ? 'red' : 'cyan'}>
          <TextInput value={draftUrl} onChange={setDraftUrl} onSubmit={handleSelectUrlSubmit} />
        </Box>
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
          items={models.map((m) => ({ label: m, value: m }))}
          onSelect={handleSelectModel}
          itemComponent={ModelItem}
        />
      </SetupShell>
    );
  }

  // ── SCREEN: Session Picker ────────────────────────────────────────────────
  if (step === 'SELECT_SESSION') {
    const allItems = [
      ...sessionList.map((s) => {
        const date = new Date(s.createdAt).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
        return {
          label: `${date}  ${s.model}  (${s.turns} turn${s.turns !== 1 ? 's' : ''})`,
          id: s.id,
        };
      }),
      { label: '+ Start new session', id: '__new__' },
    ];

    const focusedId = allItems[sessionPickerIndex]?.id ?? '__new__';
    const isNewRow = focusedId === '__new__';

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
                {focused &&
                  !isNewRow &&
                  (confirmDelete ? (
                    <Text color="red" bold>  delete? [D] confirm   [Esc] cancel</Text>
                  ) : (
                    <Text dimColor>  [D] delete</Text>
                  ))}
              </Box>
            );
          })}
        </Box>
      </SetupShell>
    );
  }

  // Count only user turns for display
  const turnCount = history.filter((m) => m.role === 'user').length;

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
        {saveConfirmation ? (
          <Text color="green">✓ Saved as default</Text>
        ) : (
          turnCount > 0 && <Text dimColor>{turnCount} turn{turnCount !== 1 ? 's' : ''}</Text>
        )}
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
          switch (msg.role) {
            case 'tool':
              return (
                <ToolEntry
                  key={idx}
                  name={msg.name}
                  content={msg.content}
                  rejected={msg.rejected}
                />
              );
            case 'user':
              return msg.content ? (
                <UserMessage key={idx} content={msg.content} timestamp={msg.timestamp} />
              ) : null;
            case 'assistant':
              return msg.content?.trim() ? (
                <AgentMessage key={idx} content={msg.content} timestamp={msg.timestamp} />
              ) : null;
            default:
              return null;
          }
        })}

        {/* Live stream */}
        {streamingContent.length > 0 && <AgentMessage content={streamingContent} streaming />}
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
            <Text color="blackBright"> deny   </Text>
            <Text color="green" bold>[A]</Text>
            <Text color="blackBright">
              {' '}
              always allow{' '}
              {pendingApproval.pattern.startsWith('run_command:')
                ? `'${pendingApproval.pattern.split(':')[1]}' commands`
                : pendingApproval.pattern}
            </Text>
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
        const matches = SLASH_COMMANDS.filter((c) =>
          c.cmd.startsWith(query.trim().toLowerCase())
        );
        if (matches.length === 0) return null;
        return (
          <Box flexDirection="column" marginTop={1} paddingLeft={2}>
            {matches.map((c, i) => (
              <Box key={c.cmd}>
                <Text
                  color={i === cmdPickerIndex ? 'cyan' : 'blackBright'}
                  bold={i === cmdPickerIndex}
                >
                  {i === cmdPickerIndex ? '▶ ' : '  '}
                </Text>
                <Text
                  color={i === cmdPickerIndex ? 'white' : 'blackBright'}
                  bold={i === cmdPickerIndex}
                >
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
          onChange={(val) => {
            setErrorMsg(null);
            setCmdPickerIndex(-1);
            setQuery(val);
          }}
          onSubmit={handleSubmitChat}
          placeholder={loading ? 'waiting for response…' : 'Ask anything, give a task, or type / for commands…'}
        />
      </Box>
    </Box>
  );
}
