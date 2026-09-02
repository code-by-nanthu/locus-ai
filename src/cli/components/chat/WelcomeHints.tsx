import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

interface WelcomeHintsProps {
  model: string;
  suggestions: string[];
  loading: boolean;
}

export function WelcomeHints({ model, suggestions, loading }: WelcomeHintsProps) {
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
      {!loading &&
        suggestions.map((s, i) => (
          <Box key={i} paddingLeft={2} marginBottom={0}>
            <Text dimColor>  {i + 1}.  </Text>
            <Text color="blackBright">{s}</Text>
          </Box>
        ))}
    </Box>
  );
}
