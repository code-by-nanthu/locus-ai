import React from 'react';
import { Box, Text } from 'ink';

interface CodeHighlighterProps {
  text: string;
}

export function SyntaxHighlighter({ text }: CodeHighlighterProps) {
  if (!text) return null;

  const lines = text.split('\n');
  const renderedElements: React.ReactNode[] = [];
  
  let isInCodeBlock = false;
  let currentLanguage = '';
  let currentCodeLines: string[] = [];
  let literalTextAccumulator: string[] = [];

  // Helper to flush plain conversation text segments securely
  const flushLiteralText = (keyIdx: number) => {
    if (literalTextAccumulator.length > 0) {
      renderedElements.push(
        <Text key={`text-${keyIdx}`}>{literalTextAccumulator.join('\n')}</Text>
      );
      literalTextAccumulator = [];
    }
  };

  // Helper to safely render code blocks with keywords highlighting
  const flushCodeBlock = (keyIdx: number) => {
    if (currentCodeLines.length > 0) {
      const linesToRender = [...currentCodeLines];
      const lang = currentLanguage;

      renderedElements.push(
        <Box 
          key={`code-${keyIdx}`} 
          flexDirection="column" 
          borderStyle="single" 
          borderColor="blue" 
          paddingX={1}
          marginY={1}
          backgroundColor="black"
        >
          {lang ? (
            <Box borderStyle="classic" borderColor="dim" paddingX={1} marginBottom={1}>
              <Text color="blue" bold>{lang.toUpperCase()}</Text>
            </Box>
          ) : null}
          {linesToRender.map((line, lIdx) => {
            const highlightedLine = line.split(/(\b(?:const|let|var|function|return|import|from|export|class|if|else|for|while|async|await|try|catch)\b|(['"`][\s\S]*?['"`])|(\/\/.*))/g).map((token, tIdx) => {
              if (!token) return null;
              if (/^\b(const|let|var|function|return|import|from|export|class|if|else|for|while|async|await|try|catch)\b$/.test(token)) {
                return <Text key={tIdx} color="magenta" bold>{token}</Text>;
              }
              if (/^['"`]/.test(token)) return <Text key={tIdx} color="yellow">{token}</Text>;
              if (/^\/\//.test(token)) return <Text key={tIdx} color="gray" italic>{token}</Text>;
              if (/^\b\d+\b$/.test(token)) return <Text key={tIdx} color="cyan">{token}</Text>;
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
      currentCodeLines = [];
    }
  };

  // Linear line scan (O(N)) avoids memory-leak regex backtracks
  lines.forEach((line, idx) => {
    if (line.startsWith('```')) {
      if (!isInCodeBlock) {
        // Opening gate triggered
        flushLiteralText(idx);
        isInCodeBlock = true;
        currentLanguage = line.replace(/```/g, '').trim();
      } else {
        // Closing gate triggered
        flushCodeBlock(idx);
        isInCodeBlock = false;
        currentLanguage = '';
      }
    } else {
      if (isInCodeBlock) {
        currentCodeLines.push(line);
      } else {
        literalTextAccumulator.push(line);
      }
    }
  });

  // CRITICAL STREAM PROTECTION: If stream ends while code block is still open, flush it anyway!
  if (isInCodeBlock) {
    flushCodeBlock(9999);
  } else {
    flushLiteralText(9999);
  }

  return <Box flexDirection="column">{renderedElements}</Box>;
}
