import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';
import { getLocalClient, fetchLocalModels, Provider } from './llm.js';
import { toolDefinitions, executeTool } from './tools.js';
import { SyntaxHighlighter } from './SyntaxHighlighter.js';

interface Message {
  role: 'user' | 'assistant' | 'tool';
  name?: string;
  tool_call_id?: string;
  content: string | null;
  tool_calls?: any[];
  timestamp?: string;
  rejected?: boolean; // true when a tool was denied by the user
}

type Step = 'SELECT_PROVIDER' | 'SELECT_MODEL' | 'CHAT';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ─── Reusable Components ──────────────────────────────────────────────────────

function Logo() {
  return (
    <Box>
      <Text bold color="cyan">◆ </Text>
      <Text bold color="white">Locus</Text>
    </Box>
  );
}

// ─── Big ASCII banner (shown on launch screen) ─────────────────────────────────

// Each letter is stored as 5 rows of exactly 7 characters.
// Rendered left-to-right with a cyan → blue → magenta gradient.
const ASCII_LETTERS: Record<string, string[]> = {
  L: [
    '█      ',
    '█      ',
    '█      ',
    '█      ',
    '███████',
  ],
  O: [
    ' █████ ',
    '█     █',
    '█     █',
    '█     █',
    ' █████ ',
  ],
  C: [
    ' █████ ',
    '█      ',
    '█      ',
    '█      ',
    ' █████ ',
  ],
  U: [
    '█     █',
    '█     █',
    '█     █',
    '█     █',
    ' █████ ',
  ],
  S: [
    ' █████ ',
    '█      ',
    ' █████ ',
    '      █',
    ' █████ ',
  ],
};

const WORD = ['L', 'O', 'C', 'U', 'S'];
const LETTER_COLORS = ['cyan', 'blue', 'blueBright', 'magenta', 'magentaBright'] as const;

function BigLogo() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {[0, 1, 2, 3, 4].map(row => (
        <Box key={row}>
          {WORD.map((letter, i) => (
            <React.Fragment key={i}>
              <Text bold color={LETTER_COLORS[i]}>
                {ASCII_LETTERS[letter][row]}
              </Text>
              {i < WORD.length - 1 && <Text> </Text>}
            </React.Fragment>
          ))}
        </Box>
      ))}
    </Box>
  );
}

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

export function App() {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>('SELECT_PROVIDER');
  const [provider, setProvider] = useState<Provider>('ollama');
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');

  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<Message[]>([]);
  const [currentStream, setCurrentStream] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

    // Input history navigation (only when active in chat)
    if (step === 'CHAT' && !loading && !pendingApproval) {
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
  function parsePseudoToolCall(text: string): { name: string; args: Record<string, any> } | null {
    const trimmed = text.trim();
    if (!trimmed.includes('{')) return null;
    try {
      // Robust extraction: isolate everything between the first and last brace
      const startIdx = trimmed.indexOf('{');
      const endIdx = trimmed.lastIndexOf('}');
      if (startIdx === -1 || endIdx === -1) return null;
      
      const jsonStr = trimmed.substring(startIdx, endIdx + 1);
      const obj = JSON.parse(jsonStr);
      
      if (!obj.name) return null;

      // Normalise the args key — models use 'parameters', 'arguments', 'input', or 'args'
      const raw = obj.parameters ?? obj.arguments ?? obj.input ?? obj.args ?? {};
      const args = typeof raw === 'string' ? JSON.parse(raw) : raw;

      const knownTools = new Set(['read_file', 'write_file', 'run_command', 'search_workspace']);
      // Accept exact name or a name that contains a known tool name
      const matched = [...knownTools].find(t => obj.name === t || obj.name.includes(t));
      if (!matched) return null;

      return { name: matched, args };
    } catch {
      return null;
    }
  }

  // ── Agent loop ────────────────────────────────────────────────────────────
  const handleSubmitChat = async () => {
    // CRITICAL: Must check loading state immediately on entry to short-circuit race conditions
    if (!query.trim() || loading) return;

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

    const client = getLocalClient(provider);
    let keepRunningLoop = true;

    try {
      while (keepRunningLoop) {
        setCurrentStream('');

        const hasToolsInHistory = localHistory.some(
          m => m.role === 'tool' || (m.tool_calls && m.tool_calls.length > 0)
        );
        const isFileCommand =
          /read|write|file|create|make|code|folder|directory|script|app|run|test|execute|command|install|npm|yarn|pnpm|search|find|workspace|scan/i.test(
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
                '1. ONLY use the explicitly provided tools: read_file, write_file, run_command, search_workspace. NEVER invent or hallucinate new tools.\n' +
                '2. If the user asks you to "write a function" or "write code", output the code directly in markdown format. DO NOT use tools for this.\n' +
                '3. ONLY use tools when interacting with the user\'s local filesystem or terminal.',
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

        if (isFileCommand) {
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
          const pseudo = parsePseudoToolCall(finalContent);
          if (pseudo) {
            isPseudo = true;
            // Don't add the raw JSON to history — treat it as a silent tool call
            setCurrentStream('');

            // Synthesise a fake tool_call object and run through the same path
            const fakeCall = {
              id: `pseudo-${Date.now()}`,
              function: { name: pseudo.name, arguments: JSON.stringify(pseudo.args) },
            };
            toolCalls = [fakeCall];
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

  // Count only user turns for display
  const turnCount = history.filter(m => m.role === 'user').length;

  // ── SCREEN: Chat ─────────────────────────────────────────────────────────
  return (
    <Box flexDirection="column" paddingX={2} paddingTop={1} paddingBottom={1}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Box justifyContent="space-between" marginBottom={0}>
        <Logo />
        <Box>
          <Text dimColor>{provider}  </Text>
          <Text color="cyan">{selectedModel}</Text>
        </Box>
      </Box>

      {/* ── Sub-header: hotkeys + session stats ────────────────────────── */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Box>
          <Text dimColor>Ctrl+P</Text>
          <Text color="blackBright"> provider  </Text>
          <Text dimColor>Ctrl+N</Text>
          <Text color="blackBright"> model  </Text>
          {loading && !pendingApproval && (
            <>
              <Text dimColor>Esc</Text>
              <Text color="blackBright"> stop  </Text>
            </>
          )}
          <Text dimColor>Ctrl+C</Text>
          <Text color="blackBright"> quit</Text>
        </Box>
        {turnCount > 0 && (
          <Text dimColor>{turnCount} turn{turnCount !== 1 ? 's' : ''}</Text>
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

      {/* ── Input ──────────────────────────────────────────────────────── */}
      <Box marginTop={1}>
        <Text color={loading ? 'blackBright' : 'cyan'} bold>
          {loading ? '… ' : '▶ '}
        </Text>
        <TextInput
          value={query}
          onChange={val => { setErrorMsg(null); setQuery(val); }}
          onSubmit={handleSubmitChat}
          placeholder={loading ? 'waiting for response…' : 'Ask anything or give a task…'}
        />
      </Box>

    </Box>
  );
}
