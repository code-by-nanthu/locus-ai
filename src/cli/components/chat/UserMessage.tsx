import React from 'react';
import { Box, Text } from 'ink';

interface UserMessageProps {
  content: string;
  timestamp?: string;
}

export const UserMessage = React.memo(function UserMessage({
  content,
  timestamp,
}: UserMessageProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="blue" bold>you</Text>
        {timestamp && <Text dimColor>  {timestamp}</Text>}
      </Box>
      <Box paddingLeft={2} marginTop={0}>
        <Text color="white" wrap="wrap">{content}</Text>
      </Box>
    </Box>
  );
});
