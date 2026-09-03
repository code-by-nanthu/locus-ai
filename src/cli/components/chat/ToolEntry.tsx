import React from 'react';
import { Box, Text } from 'ink';

interface ToolEntryProps {
  name?: string;
  content: string | null;
  rejected?: boolean;
}

export const ToolEntry = React.memo(function ToolEntry({ name, content, rejected }: ToolEntryProps) {
  let success = true;
  let detail = '';

  try {
    const parsed = JSON.parse(content || '{}');
    if (parsed.ok === false || parsed.success === false || parsed.error) {
      success = false;
      detail = parsed.error ?? 'unknown error';
    } else if (parsed.message) {
      detail = parsed.message;
    } else if (parsed.stdout) {
      // Show up to 2 lines of stdout
      const lines = parsed.stdout.trim().split('\n').slice(0, 2);
      detail = lines.join(' ↵ ');
    } else if (parsed.workspaceFiles) {
      detail = `${parsed.workspaceFiles.length} files found`;
    } else if (parsed.content) {
      const chars = parsed.content.length;
      const lines = parsed.content.split('\n').length;
      detail = `${lines} lines, ${chars} chars`;
    }
  } catch {
    detail = 'completed';
  }

  const meta: Record<string, { icon: string; label: string }> = {
    read_file: { icon: '↗', label: 'read' },
    write_file: { icon: '↙', label: 'write' },
    edit_file: { icon: '✎', label: 'edit' },
    run_command: { icon: '⚡', label: 'exec' },
    search_workspace: { icon: '⊙', label: 'scan' },
    browser_action: { icon: '🌐', label: 'browse' },
  };
  const { icon, label } = meta[name || ''] ?? { icon: '◦', label: name ?? 'tool' };

  if (rejected) {
    return (
      <Box paddingLeft={4} marginBottom={0}>
        <Text color="red">× </Text>
        <Text color="red" bold>{label}</Text>
        <Text dimColor>  denied by user</Text>
      </Box>
    );
  }

  return (
    <Box paddingLeft={4} marginBottom={0}>
      <Text color={success ? 'blackBright' : 'red'}>{icon} </Text>
      <Text color={success ? 'blackBright' : 'red'} bold>{label}</Text>
      {detail ? <Text dimColor>  {detail}</Text> : null}
    </Box>
  );
});
