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
        
        // Request completion with tools enabled
        const response = await client.chat.completions.create({
          model: selectedModel,
          messages: localHistory.map(m => ({
            role: m.role,
            content: m.content,
            name: m.name,
            tool_call_id: m.tool_call_id,
            tool_calls: m.tool_calls
          })) as any,
          tools: toolDefinitions,
          tool_choice: 'auto',
        });

        const choice = response.choices[0];
        const assistantMessage = choice?.message;

        if (!assistantMessage) {
          throw new Error("No message choice from the LLM provider.");
        }

        // If the model generates a normal text response
        if (assistantMessage.content) {
          setCurrentStream(assistantMessage.content);
          localHistory.push({
            role: 'assistant',
            content: assistantMessage.content
          });
          setHistory([...localHistory]);
        }

        // Check if the local model decided to execute a system command tool
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          // Push the tool call request itself to history to satisfy LLM context trees
          localHistory.push({
            role: 'assistant',
            content: assistantMessage.content || null,
            tool_calls: assistantMessage.tool_calls
          });

          for (const call of assistantMessage.tool_calls as any[]) {
            const name = call.function.name;
            const args = JSON.parse(call.function.arguments);

            setAgentStatus(`💻 System Action Executing: ${name}(${call.function.arguments})`);
            
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
