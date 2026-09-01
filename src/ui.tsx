import React, { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { getLocalClient } from './llm.js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function App() {
  const { exit } = useApp();
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<Message[]>([]);
  const [currentStream, setCurrentStream] = useState('');
  const [loading, setLoading] = useState(false);

  // Safely hook intercept for graceful shutdown loops (Ctrl + C)
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  const handleSubmit = async () => {
    if (!query.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: query };
    const updatedHistory = [...history, userMessage];

    setHistory(updatedHistory);
    setQuery('');
    setLoading(true);
    setCurrentStream('');

    try {
      // Toggle to 'lmstudio' if you run LM Studio locally instead of Ollama
      const client = getLocalClient('ollama');
      
      // Update this string tag to match an active local model weight pulled on your engine
      const targetModel = 'qwen2.5-coder'; 

      const stream = await client.chat.completions.create({
        model: targetModel,
        messages: updatedHistory,
        stream: true,
      });

      setLoading(false);
      let incomingBuffer = '';

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        incomingBuffer += delta;
        setCurrentStream((prev) => prev + delta);
      }

      setHistory((prev) => [...prev, { role: 'assistant', content: incomingBuffer }]);
      setCurrentStream('');
    } catch (error: any) {
      setLoading(false);
      setCurrentStream(`\n⚠️ Connection Error: Is your local model engine online? Details: ${error.message}`);
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Session History Container */}
      {history.map((msg, idx) => (
        <Box key={idx} flexDirection="column" marginBottom={1}>
          <Text bold color={msg.role === 'user' ? 'cyan' : 'green'}>
            {msg.role === 'user' ? '👤 You' : '🤖 AI'}
          </Text>
          <Text>{msg.content}</Text>
        </Box>
      ))}

      {/* Live Stream View Box */}
      {currentStream.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="green">🤖 AI</Text>
          <Text>{currentStream}</Text>
        </Box>
      )}

      {/* Fluid State Response Waiting Indicator */}
      {loading && !currentStream && (
        <Box marginBottom={1}>
          <Text color="yellow">
            <Spinner type="dots" /> Querying local neural weights...
          </Text>
        </Box>
      )}

      {/* Fixed Sticky Text Interactive User Frame */}
      <Box borderStyle="round" borderColor="cyan" paddingLeft={1}>
        <Text color="magenta">❯ </Text>
        <TextInput 
          value={query} 
          onChange={setQuery} 
          onSubmit={handleSubmit}
          placeholder="Type your message..."
        />
      </Box>
    </Box>
  );
}
