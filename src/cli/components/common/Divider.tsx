import React from 'react';
import { Text } from 'ink';

export function Divider() {
  // Use full terminal width, minus 4 for the horizontal padding of the container
  const width = process.stdout.columns ? Math.max(0, process.stdout.columns - 4) : 56;
  return <Text dimColor>{'─'.repeat(width)}</Text>;
}
