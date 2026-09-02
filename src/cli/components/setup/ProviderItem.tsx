import React from 'react';
import { Box, Text } from 'ink';

export function ProviderItem({ label, isSelected }: { label: string; isSelected?: boolean }) {
  const descriptions: Record<string, string> = {
    Ollama: 'Local models via ollama.ai',
    'LM Studio': 'Local models via lmstudio.ai',
    LocalAI: 'Drop-in OpenAI replacement',
    vLLM: 'High-throughput serving engine',
    Jan: 'Offline AI desktop application',
    GPT4All: 'CPU-optimized local ecosystem',
    'Llama.cpp': 'Standalone C++ inference engine',
    Oobabooga: 'Gradio web UI for LLMs',
  };
  return (
    <Box>
      <Text color={isSelected ? 'cyan' : 'blackBright'}>{isSelected ? '▶ ' : '  '}</Text>
      <Text color={isSelected ? 'white' : 'blackBright'} bold={isSelected}>{label}</Text>
      <Text dimColor>   {descriptions[label] ?? ''}</Text>
    </Box>
  );
}
