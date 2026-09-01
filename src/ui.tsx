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
  timestamp?: string; // HH:MM
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
      <Text bold color="white">local</Text>
      <Text bold color="cyan">ai</Text>
      <Text color="blackBright"> cli</Text>
    </Box>
  );
}

function Divider() {
  return <Text dimColor>{'─'.repeat(56)}</Text>;
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

function ToolEntry({ name, content }: { name?: string; content: string | null }) {
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

  return (
    <Box paddingLeft={4} marginBottom={0}>
      <Text color={success ? 'blackBright' : 'red'}>{icon} </Text>
      <Text color={success ? 'blackBright' : 'red'} bold>{label}</Text>
      {detail ? <Text dimColor>  {detail}</Text> : null}
    </Box>
  );
}

// ─── Message components ───────────────────────────────────────────────────────

function UserMessage({ content, timestamp }: { content: string; timestamp?: string }) {
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
}

function AgentMessage({
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
        <SyntaxHighlighter text={content} />
      </Box>
    </Box>
  );
}

// ─── Empty / Welcome state ────────────────────────────────────────────────────

function WelcomeHints({ model }: { model: string }) {
  const suggestions = [
    'Explain how async/await works in JavaScript',
    'Write a Python script that reads a CSV file',
    'Search my workspace for TypeScript files',
    'Run: ls -la and show me the output',
  ];
  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Box marginBottom={1}>
        <Text color="blackBright">Ready  ·  </Text>
        <Text color="cyan">{model}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Try asking:</Text>
      </Box>
      {suggestions.map((s, i) => (
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

      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Logo />
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

  // ── Hotkeys ───────────────────────────────────────────────────────────────
  useInput((input, key) => {
    if (key.ctrl && input === 'c') exit();
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

  // ── Agent loop ────────────────────────────────────────────────────────────
  const handleSubmitChat = async () => {
    if (!query.trim() || loading) return;

    const userInput = query;
    const ts = now();

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
                'You are a helpful local AI CLI assistant.\n\nRULES:\n1. NEVER call any tools unless the user explicitly asks to read/write/run something.\n2. For all conversation and questions, respond in plain text without using tools.',
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

        const response = await client.chat.completions.create(requestConfig);

        let incomingBuffer = '';
        let toolCalls: any[] = [];

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

        const finalContent = incomingBuffer || null;

        if (finalContent) {
          localHistory.push({ role: 'assistant', content: finalContent, timestamp: now() });
          setHistory([...localHistory]);
        }

        if (toolCalls.length > 0) {
          toolCalls = toolCalls.filter(Boolean);
          localHistory.push({ role: 'assistant', content: finalContent, tool_calls: toolCalls });

          for (const call of toolCalls) {
            let name = call.function.name;
            if (name.includes('search_workspace')) name = 'search_workspace';
            if (name.includes('write_file'))       name = 'write_file';
            if (name.includes('read_file'))        name = 'read_file';
            if (name.includes('run_command'))      name = 'run_command';

            const argsText = call.function.arguments || '{}';
            const args = JSON.parse(argsText);

            setAgentStatus(`${name.replace('_', ' ')}`);
            const result = await executeTool(name, args);

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
          <WelcomeHints model={selectedModel} />
        )}

        {history.map((msg, idx) => {
          if (msg.role === 'tool') {
            return <ToolEntry key={idx} name={msg.name} content={msg.content} />;
          }
          // Skip tool-call wrapper messages with no text
          if (msg.role === 'assistant' && !msg.content && msg.tool_calls?.length) return null;
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
          <ElapsedTimer running={loading} />
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
