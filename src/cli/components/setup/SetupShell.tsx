import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { BigLogo } from '../common/Logo.js';
import { Divider } from '../common/Divider.js';
import { StepBar } from './StepBar.js';

interface SetupShellProps {
  stepNum: number;
  label: string;
  description: string;
  children: React.ReactNode;
  loading?: boolean;
  error?: string | null;
}

export function SetupShell({
  stepNum,
  label,
  description,
  children,
  loading,
  error,
}: SetupShellProps) {
  return (
    <Box flexDirection="column" paddingX={3} paddingTop={1} paddingBottom={1}>
      {/* Big ASCII banner */}
      <BigLogo />

      {/* Subtitle + version */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text dimColor>Local AI agent</Text>
        <Text dimColor>v1.1.0</Text>
      </Box>

      <Divider />

      {/* Step progress */}
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <StepBar current={stepNum} total={2} />
        <Box marginTop={0}>
          <Text color="white" bold>{label}</Text>
        </Box>
        <Text dimColor>{description}</Text>
      </Box>

      {/* Content */}
      <Box marginTop={1} marginBottom={1}>
        {children}
      </Box>

      {/* Loading */}
      {loading && (
        <Box marginBottom={1}>
          <Text color="cyan"><Spinner type="dots" /></Text>
          <Text color="blackBright"> Connecting…</Text>
        </Box>
      )}

      {/* Error */}
      {error && (
        <Box marginBottom={1}>
          <Text color="red">✖  </Text>
          <Text color="red">{error}</Text>
        </Box>
      )}

      <Divider />
      {/* Key hints */}
      <Box marginTop={1}>
        <Text dimColor>↑↓</Text>
        <Text color="blackBright"> navigate   </Text>
        <Text dimColor>Enter</Text>
        <Text color="blackBright"> select   </Text>
        <Text dimColor>Esc</Text>
        <Text color="blackBright"> back   </Text>
        <Text dimColor>Ctrl+C</Text>
        <Text color="blackBright"> quit</Text>
      </Box>
    </Box>
  );
}
