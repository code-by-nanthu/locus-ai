import React, { useState } from 'react';
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
    // Graceful Exit
    if (key.ctrl && input === 'c') exit();

    // Hotkey: Switch Provider (Ctrl+P)
    if (key.ctrl && input === 'p') {
      setErrorMsg(null);
      setStep('SELECT_PROVIDER');
    }

    // Hotkey: Switch Model (Ctrl+N)
    if (key.ctrl && input === 'n') {
      if (models.length > 0) {
        setErrorMsg(null);
        setStep('SELECT_MODEL');
      } else {
        setErrorMsg("Cannot toggle models yet. Please fetch a provider stack profile first.");
      }
    }
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
        const isFileCommand = /read|write|file|create|make|code|folder|directory|script|app|run|test|execute|command|install|npm|yarn|pnpm|search|find|workspace|scan/i.test(query) || hasToolsInHistory;

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
            let name = call.function.name;
            if (name.includes('search_workspace')) name = 'search_workspace';
            if (name.includes('write_file')) name = 'write_file';
            if (name.includes('read_file')) name = 'read_file';
            if (name.includes('run_command')) name = 'run_command';

            const argsText = call.function.arguments || '{}';
            const args = JSON.parse(argsText);

            setAgentStatus(`Executing system pipeline: ${name}...`);
            
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
          setAgentStatus("Synthesizing system results...");
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

  // ----------------------------------------------------
  // STEP 1: SELECT PROVIDER
  // ----------------------------------------------------
  if (step === 'SELECT_PROVIDER') {
    return (
      <Box flexDirection="column" paddingY={1} paddingX={2}>
        <Box borderStyle="round" borderColor="blue" paddingX={1} marginBottom={1}>
          <Text bold color="blue"> ✦ GEMINI CLI </Text>
        </Box>
        <Text color="gray">Select local system runtime engine provider:</Text>
        <Box marginTop={1} marginBottom={1}>
          <SelectInput 
            items={[
              { label: '  🦙 Ollama Runtime Server', value: 'ollama' as Provider }, 
              { label: '  🔬 LM Studio Engine Sandbox', value: 'lmstudio' as Provider }
            ]} 
            onSelect={handleSelectProvider} 
          />
        </Box>
        {loading && <Text color="blue"><Spinner type="dots" /> Querying local configurations...</Text>}
        {errorMsg && <Text color="red">⚠️ {errorMsg}</Text>}
      </Box>
    );
  }

  // ----------------------------------------------------
  // STEP 2: SELECT MODEL
  // ----------------------------------------------------
  if (step === 'SELECT_MODEL') {
    return (
      <Box flexDirection="column" paddingY={1} paddingX={2}>
        <Box borderStyle="round" borderColor="blue" paddingX={1} marginBottom={1}>
          <Text bold color="blue"> ✦ GEMINI CLI </Text>
        </Box>
        <Text color="gray">Select the local neural model weight for execution:</Text>
        <Box marginTop={1}>
          <SelectInput items={models.map((m) => ({ label: `  📦 ${m}`, value: m }))} onSelect={handleSelectModel} />
        </Box>
      </Box>
    );
  }

  // ----------------------------------------------------
  // STEP 3: MODERN RE-DESIGNED CHAT AGENT WORKSPACE
  // ----------------------------------------------------
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* PROFESSIONAL DYNAMIC STEERING HEADER HEADER */}
      <Box borderStyle="round" borderColor="blue" justifyContent="space-between" paddingX={1} marginBottom={1}>
        <Box>
          <Text bold color="blue">✦ GEMINI CLI </Text>
          <Text color="gray">v1.1.0</Text>
        </Box>
        <Box>
          <Text color="gray">Engine: </Text>
          <Text color="cyan" bold>{provider.toUpperCase()}</Text>
          <Text color="gray"> ┃ Model: </Text>
          <Text color="magenta" bold>{selectedModel}</Text>
        </Box>
      </Box>

      {/* FOOTER HELPER SHORTCUT BAR */}
      <Box borderStyle="classic" borderColor="dim" paddingX={1} marginBottom={1}>
        <Text dimColor>Hotkeys: </Text>
        <Text color="yellow" bold>Ctrl+P</Text>
        <Text dimColor> Change Backend Provider ┃ </Text>
        <Text color="yellow" bold>Ctrl+N</Text>
        <Text dimColor> Switch Target Model</Text>
      </Box>

      {/* CONVERSATION AREA */}
      <Box flexDirection="column" marginBottom={1}>
        {history.map((msg, idx) => {
          if (msg.role === 'tool') {
            return (
              <Box key={idx} paddingLeft={2} marginY={1}>
                <Text color="blue">├─ </Text>
                <Text color="gray" italic>Workspace pipeline tool update [{msg.name}] complete.</Text>
              </Box>
            );
          }
          if (!msg.content) return null;
          
          const isUser = msg.role === 'user';
          return (
            <Box key={idx} flexDirection="column" marginY={1}>
              <Box marginBottom={0}>
                <Text bold color={isUser ? 'blue' : 'green'}>
                  {isUser ? '👤 You' : '✦ Gemini Agent'}
                </Text>
              </Box>
              <Box paddingLeft={2}>
                <SyntaxHighlighter text={msg.content} />
              </Box>
            </Box>
          );
        })}

        {/* STREAMING CHUNK LAYER */}
        {currentStream.length > 0 && (
          <Box flexDirection="column" marginY={1}>
            <Box>
              <Text bold color="green">✦ Gemini Agent</Text>
            </Box>
            <Box paddingLeft={2}>
              <SyntaxHighlighter text={currentStream} />
            </Box>
          </Box>
        )}
      </Box>

      {/* SYSTEM PIPELINE LOADING MESSAGES */}
      {loading && (
        <Box marginBottom={1} paddingLeft={2}>
          <Text color="cyan">
            <Spinner type="dots" /> {agentStatus || "Processing matrix arrays..."}
          </Text>
        </Box>
      )}

      {errorMsg && (
        <Box borderStyle="single" borderColor="red" paddingX={1} marginBottom={1}>
          <Text color="red">⚠️ {errorMsg}</Text>
        </Box>
      )}

      {/* MODERN CHAT INPUT COMPONENT */}
      <Box borderStyle="round" borderColor="gray" paddingLeft={1} marginTop={1}>
        <Text color="blue">✦ </Text>
        <TextInput 
          value={query} 
          onChange={setQuery} 
          onSubmit={handleSubmitChat} 
          placeholder="Ask Gemini to scan workspace files or hot-swap settings dynamically..." 
        />
      </Box>
    </Box>
  );
}
