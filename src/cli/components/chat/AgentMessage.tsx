import React from 'react';
import { Box, Text } from 'ink';
import { SyntaxHighlighter } from '../common/SyntaxHighlighter.js';

interface AgentMessageProps {
  content: string;
  timestamp?: string;
  streaming?: boolean;
}

export const AgentMessage = React.memo(function AgentMessage({
  content,
  timestamp,
  streaming,
}: AgentMessageProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="cyan" bold>◆ assistant</Text>
        {timestamp && !streaming && <Text dimColor>  {timestamp}</Text>}
        {streaming && <Text color="cyan" dimColor>  writing…</Text>}
      </Box>
      <Box paddingLeft={2} marginTop={0} flexDirection="column">
        {/* Use plain Text during streaming to avoid OOM from re-running the
            regex tokenizer on every incoming chunk. Highlight only after done. */}
        {streaming ? (
          <Text wrap="wrap" color="white">{content}</Text>
        ) : (
          <SyntaxHighlighter text={content} />
        )}
      </Box>
    </Box>
  );
});
