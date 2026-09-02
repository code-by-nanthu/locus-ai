import React from 'react';
import { Box, Text } from 'ink';

export function StepBar({ current, total }: { current: number; total: number }) {
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
