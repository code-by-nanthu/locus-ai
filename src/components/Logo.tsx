import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import gradientString from 'gradient-string';
import chalk from 'chalk';
import { LOGO_LONG, LOGO_SHORT, logoWidth } from './ascii-art.js';
import { useTerminalSize } from './use-terminal-size.js';

const STOPS = ['#00d4ff', '#0077ff', '#7a3cff', '#ff3ce0'];
const TRUECOLOR = chalk.level >= 2;

// The large banner logo shown on setup screens
export function BigLogo() {
  const { columns } = useTerminalSize();

  const art = useMemo(() => {
    if (columns >= logoWidth(LOGO_LONG) + 2) return LOGO_LONG;
    if (columns >= logoWidth(LOGO_SHORT) + 2) return LOGO_SHORT;
    return null;
  }, [columns]);

  if (!art) {
    return (
      <Box marginBottom={1}>
        <Text bold color="cyan">LOCUS</Text>
      </Box>
    );
  }

  if (!TRUECOLOR) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        {art.split('\n').map((line, i) => (
          <Text key={i} bold color="cyan" wrap="truncate">{line}</Text>
        ))}
      </Box>
    );
  }

  // multiline:true applies one gradient across the block, column-aligned.
  const painted = gradientString(STOPS).multiline(art);

  return (
    <Box flexDirection="column" marginBottom={1}>
      {painted.split('\n').map((line, i) => (
        <Text key={i} wrap="truncate">{line}</Text>
      ))}
    </Box>
  );
}

// The small header logo shown in the chat view
export function Logo() {
  if (!TRUECOLOR) {
    return (
      <Box>
        <Text bold color="cyan">◆ </Text>
        <Text bold color="white">Locus</Text>
      </Box>
    );
  }

  // Apply horizontal gradient to the small logo string
  const painted = gradientString(STOPS)('◆ Locus');
  return (
    <Box>
      <Text bold>{painted}</Text>
    </Box>
  );
}
