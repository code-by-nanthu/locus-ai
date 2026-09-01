import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';
import { getLocalClient, fetchLocalModels, Provider } from './llm.js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type Step = 'SELECT_PROVIDER' | 'SELECT_MODEL' | 'CHAT';

export function App() {
  const { exit } = useApp();
  
  // Workflow States
  const [step, setStep] = useState<Step>('SELECT_PROVIDER');
  const [provider, setProvider] = useState<Provider>('ollama');
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  
  // Chat States
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<Message[]>([]);
  const [currentStream, setCurrentStream] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Global exit listener
  useInput((input, key) => {
    if (key.ctrl && input === 'c') exit();
  });

  // Step 1 Handler: Provider Selection
  const handleSelectProvider = async (item: { value: Provider }) => {
    setProvider(item.value);
    setLoading(true);
    setErrorMsg(null);
    
    try {
      const activeModels = await fetchLocalModels(item.value);
      if (activeModels.length === 0) {
        throw new Error("No downloaded models found on this provider platform.");
      }
      setModels(activeModels);
      setStep('SELECT_MODEL');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2 Handler: Model Selection
  const handleSelectModel = (item: { value: string }) => {
    setSelectedModel(item.value);
    setStep('CHAT');
  };

  // Step 3 Handler: Chat submission loop
  const handleSubmitChat = async () => {
    if (!query.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: query };
    const updatedHistory = [...history, userMessage];

    setHistory(updatedHistory);
    setQuery('');
    setLoading(true);
    setCurrentStream('');

    try {
      const client = getLocalClient(provider);
      const stream = await client.chat.completions.create({
        model: selectedModel,
        messages: updatedHistory,
        stream: true,
      });

      setLoading(false);
      let incomingBuffer = '';

      for await (const chunk of stream) {
        // Fixed typo in syntax from user code chunk.choices?.?.[0]
        const delta = chunk.choices?.[0]?.delta?.content || '';
        incomingBuffer += delta;
        setCurrentStream((prev) => prev + delta);
      }

      setHistory((prev) => [...prev, { role: 'assistant', content: incomingBuffer }]);
      setCurrentStream('');
    } catch (error: any) {
      setLoading(false);
      setCurrentStream(`\n⚠️ Run Error: Host execution dropping. ${error.message}`);
    }
  };

  // ----------------------------------------------------
  // Screen 1: Select Provider
  // ----------------------------------------------------
  if (step === 'SELECT_PROVIDER') {
    const providerOptions = [
      { label: '🦙 Ollama (Port 11434)', value: 'ollama' as Provider },
      { label: '🔬 LM Studio (Port 1234)', value: 'lmstudio' as Provider },
    ];

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="magenta">⚙️ Select Local Backend Provider:</Text>
        <Box marginTop={1} marginBottom={1}>
          <SelectInput items={providerOptions} onSelect={handleSelectProvider} />
        </Box>
        {loading && (
          <Text color="yellow"><Spinner type="dots" /> Pinging provider metadata endpoints...</Text>
        )}
        {errorMsg && (
          <Text color="red">⚠️ {errorMsg}</Text>
        )}
      </Box>
    );
  }

  // ----------------------------------------------------
  // Screen 2: Select Model
  // ----------------------------------------------------
  if (step === 'SELECT_MODEL') {
    const modelOptions = models.map((m) => ({ label: `📦 ${m}`, value: m }));

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="magenta">🧠 Select Active Local Model Weight ({provider.toUpperCase()}):</Text>
        <Box marginTop={1}>
          <SelectInput items={modelOptions} onSelect={handleSelectModel} />
        </Box>
      </Box>
    );
  }

  // ----------------------------------------------------
  // Screen 3: Active Agent Engine Chat Workspace
  // ----------------------------------------------------
  return (
    <Box flexDirection="column" padding={1}>
      {/* Session Title Header anchor configuration */}
      <Box borderStyle="single" borderColor="dim" paddingX={1} marginBottom={1}>
        <Text dimColor>Active Session: </Text>
        <Text color="yellow" bold>{provider.toUpperCase()}</Text>
        <Text dimColor> ── Model: </Text>
        <Text color="cyan" bold>{selectedModel}</Text>
      </Box>

      {/* Message Feed logs */}
      {history.map((msg, idx) => (
        <Box key={idx} flexDirection="column" marginBottom={1}>
          <Text bold color={msg.role === 'user' ? 'cyan' : 'green'}>
            {msg.role === 'user' ? '👤 You' : '🤖 AI'}
          </Text>
          <Text>{msg.content}</Text>
        </Box>
      ))}

      {/* Streaming Response Target Box */}
      {currentStream.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="green">🤖 AI</Text>
          <Text>{currentStream}</Text>
        </Box>
      )}

      {/* Process Wait Spinners */}
      {loading && !currentStream && (
        <Box marginBottom={1}>
          <Text color="yellow">
            <Spinner type="dots" /> Computing response context lines...
          </Text>
        </Box>
      )}

      {/* Interactive Entry Input Box Frame */}
      <Box borderStyle="round" borderColor="cyan" paddingLeft={1}>
        <Text color="magenta">❯ </Text>
        <TextInput 
          value={query} 
          onChange={setQuery} 
          onSubmit={handleSubmitChat}
          placeholder={`Message ${selectedModel}...`}
        />
      </Box>
    </Box>
  );
}
