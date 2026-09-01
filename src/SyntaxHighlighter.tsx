import React from 'react';
import { Box, Text } from 'ink';

interface CodeHighlighterProps {
  text: string;
}

export function SyntaxHighlighter({ text }: CodeHighlighterProps) {
  // Split the response text into text segments and triple-backtick code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <Box flexDirection="column">
      {parts.map((part, index) => {
        if (part.startsWith('```')) {
          // Clean up backticks and isolate the language tag line
          const lines = part.replace(/```/g, '').split('\n');
          const language = lines[0].trim();
          const codeLines = lines.slice(1);

          // Remove trailing empty line if it exists
          if (codeLines.length > 0 && codeLines[codeLines.length - 1].trim() === '') {
            codeLines.pop();
          }

          return (
            <Box 
              key={index} 
              flexDirection="column" 
              borderStyle="single" 
              borderColor="blue" 
              paddingX={1}
              marginY={1}
              backgroundColor="black"
            >
              {language && (
                <Box borderStyle="classic" borderColor="dim" paddingX={1} marginBottom={1}>
                  <Text color="blue" bold>{language.toUpperCase()}</Text>
                </Box>
              )}
              {codeLines.map((line, lIdx) => {
                // Tokenize structural keywords for syntax highlighting
                const highlightedLine = line.split(/(\b(?:const|let|var|function|return|import|from|export|class|if|else|for|while|async|await|try|catch)\b|(['"`][\s\S]*?['"`])|(\/\/.*))/g).map((token, tIdx) => {
                  if (!token) return null;
                  
                  // Style reserved JavaScript/TypeScript keywords
                  if (/^\b(const|let|var|function|return|import|from|export|class|if|else|for|while|async|await|try|catch)\b$/.test(token)) {
                    return <Text key={tIdx} color="magenta" bold>{token}</Text>;
                  }
                  // Style string literals
                  if (/^['"`]/.test(token)) {
                    return <Text key={tIdx} color="yellow">{token}</Text>;
                  }
                  // Style inline code comments
                  if (/^\/\//.test(token)) {
                    return <Text key={tIdx} color="gray" italic>{token}</Text>;
                  }
                  // Style numbers
                  if (/^\b\d+\b$/.test(token)) {
                    return <Text key={tIdx} color="cyan">{token}</Text>;
                  }
                  
                  return <Text key={tIdx} color="white">{token}</Text>;
                });

                return (
                  <Box key={lIdx}>
                    <Text dimColor color="gray">{String(lIdx + 1).padStart(2)} │ </Text>
                    <Text>{highlightedLine}</Text>
                  </Box>
                );
              })}
            </Box>
          );
        }

        // Render plain conversational text outside of code blocks
        return <Text key={index}>{part}</Text>;
      })}
    </Box>
  );
}
