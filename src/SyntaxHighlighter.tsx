import React from 'react';
import { Box, Text } from 'ink';

interface SyntaxHighlighterProps {
  text: string;
}

// Tokenize a single line of code for syntax highlighting
function tokenizeLine(line: string): React.ReactNode[] {
  // Pattern order matters: comments > strings > keywords > numbers > identifiers
  const tokenPattern = /(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$)|("""[\s\S]*?"""|'''[\s\S]*?'''|`[^`]*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(const|let|var|function|return|import|from|export|default|class|extends|interface|type|if|else|switch|case|break|for|while|do|in|of|async|await|try|catch|finally|throw|new|this|super|typeof|instanceof|void|null|undefined|true|false|static|public|private|protected|readonly|abstract|enum|namespace|module|declare|require|yield|get|set|def|fn|impl|struct|trait|match|mod|use|pub|let|mut|ref|move|clone|self|Self|println|print|echo|puts)\b|\b(\d+\.?\d*(?:e[+-]?\d+)?(?:px|em|rem|%|vh|vw)?)\b|([A-Z][a-zA-Z0-9_]*)|([a-zA-Z_][a-zA-Z0-9_]*\s*(?=\()|)/g;

  const tokens: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(line)) !== null) {
    const [full, comment, str, keyword, num, typeName, fn] = match;
    const start = match.index;

    // Push unstyled text before this match
    if (start > lastIndex) {
      tokens.push(<Text key={lastIndex} color="white">{line.slice(lastIndex, start)}</Text>);
    }

    if (comment) {
      tokens.push(<Text key={start} color="green" dimColor>{full}</Text>);
    } else if (str) {
      tokens.push(<Text key={start} color="yellow">{full}</Text>);
    } else if (keyword) {
      tokens.push(<Text key={start} color="magenta" bold>{full}</Text>);
    } else if (num) {
      tokens.push(<Text key={start} color="cyan">{full}</Text>);
    } else if (typeName) {
      tokens.push(<Text key={start} color="blueBright">{full}</Text>);
    } else if (fn) {
      tokens.push(<Text key={start} color="blue">{full}</Text>);
    } else {
      tokens.push(<Text key={start} color="white">{full}</Text>);
    }

    lastIndex = start + full.length;
  }

  if (lastIndex < line.length) {
    tokens.push(<Text key={lastIndex} color="white">{line.slice(lastIndex)}</Text>);
  }

  return tokens.length > 0 ? tokens : [<Text key={0} color="white">{line}</Text>];
}

// Render inline markdown: **bold**, *italic*, `code`, plain text
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <Text key={i} bold>{part.slice(2, -2)}</Text>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <Text key={i} italic>{part.slice(1, -1)}</Text>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <Text key={i} color="cyan" backgroundColor="blackBright"> {part.slice(1, -1)} </Text>;
    }
    return <Text key={i}>{part}</Text>;
  });
}

// Detect the language from the tag for display
function getLanguageLabel(lang: string): string {
  const map: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript (JSX)', js: 'JavaScript', jsx: 'JavaScript (JSX)',
    py: 'Python', python: 'Python', rs: 'Rust', go: 'Go', sh: 'Shell',
    bash: 'Bash', zsh: 'Zsh', json: 'JSON', yaml: 'YAML', yml: 'YAML',
    md: 'Markdown', css: 'CSS', html: 'HTML', sql: 'SQL', toml: 'TOML',
  };
  return map[lang.toLowerCase()] ?? lang.toUpperCase();
}

export function SyntaxHighlighter({ text }: SyntaxHighlighterProps) {
  // Split text into prose and fenced code blocks
  const segments = text.split(/(```[\w]*\n?[\s\S]*?```)/g);

  return (
    <Box flexDirection="column">
      {segments.map((segment, idx) => {
        if (!segment.startsWith('```')) {
          // Render prose — split on newlines to handle them explicitly
          const lines = segment.split('\n');
          return (
            <Box key={idx} flexDirection="column">
              {lines.map((line, lIdx) => {
                // Bullet points
                if (/^\s*[-*•]\s/.test(line)) {
                  return (
                    <Box key={lIdx}>
                      <Text color="cyan">  ▸ </Text>
                      <Text>{renderInlineMarkdown(line.replace(/^\s*[-*•]\s/, ''))}</Text>
                    </Box>
                  );
                }
                // Numbered list
                if (/^\s*\d+\.\s/.test(line)) {
                  const numMatch = line.match(/^\s*(\d+)\.\s(.*)/);
                  if (numMatch) {
                    return (
                      <Box key={lIdx}>
                        <Text color="cyan" dimColor>  {numMatch[1]}. </Text>
                        <Text>{renderInlineMarkdown(numMatch[2])}</Text>
                      </Box>
                    );
                  }
                }
                // Heading
                if (/^#{1,3}\s/.test(line)) {
                  const level = (line.match(/^(#+)/) || [''])[0].length;
                  const content = line.replace(/^#+\s/, '');
                  return (
                    <Box key={lIdx} marginTop={level === 1 ? 1 : 0}>
                      <Text bold color={level === 1 ? 'cyan' : level === 2 ? 'blue' : 'white'}>
                        {content}
                      </Text>
                    </Box>
                  );
                }
                // Horizontal rule
                if (/^---+$/.test(line.trim())) {
                  return <Text key={lIdx} dimColor>{'─'.repeat(40)}</Text>;
                }
                // Normal prose line
                return (
                  <Text key={lIdx} wrap="wrap">
                    {renderInlineMarkdown(line)}
                  </Text>
                );
              })}
            </Box>
          );
        }

        // === Code Block ===
        const raw = segment.replace(/^```/, '').replace(/```$/, '');
        const firstNewline = raw.indexOf('\n');
        const langTag = firstNewline === -1 ? raw : raw.slice(0, firstNewline).trim();
        const code = firstNewline === -1 ? '' : raw.slice(firstNewline + 1);
        const codeLines = code.split('\n');

        // Remove trailing empty line
        if (codeLines.length > 0 && codeLines[codeLines.length - 1].trim() === '') {
          codeLines.pop();
        }

        return (
          <Box key={idx} flexDirection="column" marginY={1}>
            {/* Code block header */}
            <Box>
              <Text color="blackBright">╭─ </Text>
              <Text color="cyan" bold>{langTag ? getLanguageLabel(langTag) : 'Code'}</Text>
              <Text color="blackBright"> ─────────────────────────</Text>
            </Box>
            {/* Code lines */}
            {codeLines.map((line, lIdx) => (
              <Box key={lIdx}>
                <Text dimColor color="blackBright">{String(lIdx + 1).padStart(3)} │ </Text>
                {tokenizeLine(line)}
              </Box>
            ))}
            {/* Code block footer */}
            <Box>
              <Text color="blackBright">╰{'─'.repeat(42)}</Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
