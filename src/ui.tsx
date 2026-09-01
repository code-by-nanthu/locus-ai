import React, { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';
import { getLocalClient, fetchLocalModels, Provider } from './llm.js';
import { toolDefinitions, executeTool } from './tools.js';

interface Message {
  role: 'user' | 'assistant' | 'tool';
  name?: string;
  tool_call_id?: string;
  content: string | null;
  tool_calls?: any[];
}

type Step = 'SELECT_PROVIDER' | 'SELECT_MODEL' | 'CHAT';

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

  useInput((input, key) => {
    if (key.ctrl && input === 'c') exit();
  });

  const handleSelectProvider = async (item: { value: Provider }) => {
    setProvider(item.value);
    setLoading(true);
    setErrorMsg(null);
    try {
      const activeModels = await fetchLocalModels(item.value);
      if (activeModels.length === 0) throw new Error("No active local models found.");
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

  // The Agent loop handles standard generation or intercepts system file tool runs
  const handleSubmitChat = async () => {
    if (!query.trim() || loading) return;

    let localHistory: Message[] = [...history, { role: 'user', content: query }];
    setHistory(localHistory);
    setQuery('');
    setLoading(true);
    setAgentStatus("Thinking...");

    const client = getLocalClient(provider);
    let keepRunningLoop = true;

    try {
      while (keepRunningLoop) {
        setCurrentStream('');
        
        const hasToolsInHistory = localHistory.some(m => m.role === 'tool' || (m.tool_calls && m.tool_calls.length > 0));
        const isFileCommand = /read|write|file|create|make|code|folder|directory|script|app/i.test(query) || hasToolsInHistory;

        const requestConfig: any = {
          model: selectedModel,
          messages: [
            {
              role: 'system',
              content: 'You are a local AI CLI assistant. Your primary function is conversational.\n\nCRITICAL RULES:\n1. NEVER call `read_file` or `write_file` unless the user explicitly requests you to read, write, or create a file.\n2. If the user just says "hi", "hello", or asks a general question, you MUST NOT use any tools. Just reply directly with a conversational message.'
            },
            ...localHistory.map(m => ({
              role: m.role,
              content: m.content,
              name: m.name,
              tool_call_id: m.tool_call_id,
              tool_calls: m.tool_calls
            }))
          ],
          stream: true,
        };

        if (isFileCommand) {
          requestConfig.tools = toolDefinitions;
          requestConfig.tool_choice = 'auto';
        }

        // Request completion with streaming enabled
        const response = await client.chat.completions.create(requestConfig);

        let incomingBuffer = '';
        let toolCalls: any[] = [];

        for await (const chunk of response as any) {
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            incomingBuffer += delta.content;
            setCurrentStream((prev) => prev + delta.content);
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index;
              if (!toolCalls[index]) {
                toolCalls[index] = {
                  id: tc.id || '',
                  type: 'function',
                  function: { name: tc.function?.name || '', arguments: '' }
                };
              }
              if (tc.function?.name) toolCalls[index].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[index].function.arguments += tc.function.arguments;
            }
          }
        }

        const finalContent = incomingBuffer || null;

        if (finalContent) {
          localHistory.push({
            role: 'assistant',
            content: finalContent
          });
          setHistory([...localHistory]);
        }

        if (toolCalls.length > 0) {
          // Filter out nulls if array was sparse
          toolCalls = toolCalls.filter(Boolean);

          // Push the tool call request itself to history to satisfy LLM context trees
          localHistory.push({
            role: 'assistant',
            content: finalContent,
            tool_calls: toolCalls
          });

          for (const call of toolCalls) {
            const name = call.function.name;
            const argsText = call.function.arguments || '{}';
            const args = JSON.parse(argsText);

            setAgentStatus(`💻 System Action Executing: ${name}(${argsText})`);
            
            // Run the actual file edit or look up locally
            const result = await executeTool(name, args);

            // Feed the results back directly into our context window history track
            localHistory.push({
              role: 'tool',
              name: name,
              tool_call_id: call.id,
              content: result
            });
          }

          setHistory([...localHistory]);
          setAgentStatus("Reviewing action results...");
          // Continue loop: Send the tool execution result back to the model
          continue; 
        }

        // Loop finishes when the model decides to stop calling tools and just replies with content
        keepRunningLoop = false;
      }
    } catch (error: any) {
      setErrorMsg(`Agent Thread Execution Dropped: ${error.message}`);
    } finally {
      setLoading(false);
      setAgentStatus(null);
      setCurrentStream('');
    }
  };

  if (step === 'SELECT_PROVIDER') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="magenta">⚙️ Select Local Backend Provider:</Text>
        <Box marginTop={1} marginBottom={1}>
          <SelectInput items={[{ label: '🦙 Ollama', value: 'ollama' as Provider }, { label: '🔬 LM Studio', value: 'lmstudio' as Provider }]} onSelect={handleSelectProvider} />
        </Box>
        {loading && <Text color="yellow"><Spinner type="dots" /> Pinging endpoints...</Text>}
        {errorMsg && <Text color="red">⚠️ {errorMsg}</Text>}
      </Box>
    );
  }

  if (step === 'SELECT_MODEL') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="magenta">🧠 Select Agent Brain Weight Model:</Text>
        <Box marginTop={1}>
          <SelectInput items={models.map((m) => ({ label: `📦 ${m}`, value: m }))} onSelect={handleSelectModel} />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="single" borderColor="dim" paddingX={1} marginBottom={1}>
        <Text color="yellow" bold>{provider.toUpperCase()}</Text>
        <Text dimColor> ── Agent Engine active with tool options: </Text>
        <Text color="cyan" bold>{selectedModel}</Text>
      </Box>

      {/* Render Conversation Feed */}
      {history.map((msg, idx) => {
        if (msg.role === 'tool') {
          return (
            <Box key={idx} paddingLeft={2} marginBottom={1}>
              <Text color="gray" italic>⚙️ Tool output [{msg.name}]: {msg.content?.substring(0, 100)}...</Text>
            </Box>
          );
        }
        if (!msg.content && (!msg.tool_calls || msg.tool_calls.length === 0)) return null;
        
        return (
          <Box key={idx} flexDirection="column" marginBottom={1}>
            <Text bold color={msg.role === 'user' ? 'cyan' : 'green'}>
              {msg.role === 'user' ? '👤 You:' : '🤖 Agent:'}
            </Text>
            {msg.content && <Text>{msg.content}</Text>}
            {msg.tool_calls && msg.tool_calls.length > 0 && (
              <Box flexDirection="column" paddingLeft={2}>
                 {msg.tool_calls.map((call, cidx) => (
                    <Text key={cidx} color="magenta" italic>
                      ⚡ Calling tool {call.function.name}({call.function.arguments})
                    </Text>
                 ))}
              </Box>
            )}
          </Box>
        );
      })}

      {currentStream.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="green">🤖 Agent:</Text>
          <Text>{currentStream}</Text>
        </Box>
      )}

      {/* Real-time status tracker box showing tool workflows */}
      {loading && (
        <Box marginBottom={1}>
          <Text color="yellow">
            <Spinner type="dots" /> {agentStatus || "Processing logic frames..."}
          </Text>
        </Box>
      )}

      {errorMsg && (
        <Box marginBottom={1}>
          <Text color="red">⚠️ {errorMsg}</Text>
        </Box>
      )}

      <Box borderStyle="round" borderColor="cyan" paddingLeft={1}>
        <Text color="magenta">❯ </Text>
        <TextInput value={query} onChange={setQuery} onSubmit={handleSubmitChat} placeholder="Ask agent to write/read code or analyze files..." />
      </Box>
    </Box>
  );
}
