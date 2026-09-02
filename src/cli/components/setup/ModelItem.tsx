import React from 'react';
import { Box, Text } from 'ink';

export function ModelItem({ label, isSelected }: { label: string; isSelected?: boolean }) {
  return (
    <Box>
      <Text color={isSelected ? 'cyan' : 'blackBright'}>{isSelected ? '▶ ' : '  '}</Text>
      <Text color={isSelected ? 'white' : 'blackBright'} bold={isSelected}>{label}</Text>
    </Box>
  );
}
