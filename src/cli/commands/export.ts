import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSession, listSessions } from '../../core/session.js';

export async function runExportCommand(rawArgs: string[] | string = []) {
  const args = Array.isArray(rawArgs) ? rawArgs : [rawArgs].filter(Boolean);

  let sessionId: string | undefined;
  let format: 'md' | 'json' | 'html' = 'md';
  let customOut: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--format' || arg === '-f') {
      const val = args[++i]?.toLowerCase();
      if (val === 'json' || val === 'html' || val === 'md') {
        format = val;
      }
    } else if (arg === '--out' || arg === '-o') {
      customOut = args[++i];
    } else if (!arg.startsWith('-') && !sessionId) {
      sessionId = arg;
    }
  }

  let idToExport = sessionId;
  if (!idToExport) {
    const sessions = await listSessions();
    if (sessions.length === 0) {
      console.error('No saved sessions found.');
      process.exit(1);
    }
    idToExport = sessions[0];
    console.log(`No session ID provided. Exporting latest session (${idToExport})...`);
  }

  const session = await loadSession(idToExport);
  if (!session) {
    console.error(`Error: Session "${idToExport}" not found.`);
    process.exit(1);
  }

  const date = new Date(session.createdAt).toISOString().split('T')[0];
  const defaultFilename = `locus-session-${idToExport.slice(0, 8)}-${date}.${format}`;
  const outPath = customOut ? path.resolve(process.cwd(), customOut) : path.resolve(process.cwd(), defaultFilename);

  let contentToWrite = '';

  if (format === 'json') {
    contentToWrite = JSON.stringify(session, null, 2);
  } else if (format === 'html') {
    contentToWrite = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Locus AI Session - ${session.id.slice(0, 8)}</title>
  <style>
    :root { color-scheme: dark; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #090d16;
      color: #e2e8f0;
      line-height: 1.6;
      padding: 2rem;
      max-width: 860px;
      margin: 0 auto;
    }
    header {
      border-bottom: 1px solid #1e293b;
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }
    h1 { color: #38bdf8; font-size: 1.75rem; margin-bottom: 0.5rem; }
    .meta { color: #94a3b8; font-size: 0.875rem; display: flex; gap: 1.5rem; flex-wrap: wrap; }
    .message {
      margin-bottom: 1.5rem;
      padding: 1rem 1.25rem;
      border-radius: 0.5rem;
      border: 1px solid #1e293b;
    }
    .user { background: #0f172a; border-color: #334155; }
    .assistant { background: #111827; border-color: #1e293b; }
    .tool { background: #030712; border-color: #374151; font-family: monospace; font-size: 0.875rem; }
    .role { font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .user .role { color: #38bdf8; }
    .assistant .role { color: #a78bfa; }
    .tool .role { color: #f59e0b; }
    pre { background: #000; padding: 0.75rem; border-radius: 0.375rem; overflow-x: auto; }
  </style>
</head>
<body>
  <header>
    <h1>Locus AI Session Export</h1>
    <div class="meta">
      <div><strong>ID:</strong> ${session.id}</div>
      <div><strong>Model:</strong> ${session.provider} / ${session.model}</div>
      <div><strong>Date:</strong> ${new Date(session.createdAt).toLocaleString()}</div>
      <div><strong>Turns:</strong> ${session.messages.length}</div>
    </div>
  </header>
  <main>
    ${session.messages
      .map((msg) => {
        const role = msg.role;
        const body = msg.content ? String(msg.content).replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
        return `
    <div class="message ${role}">
      <div class="role">${role}${msg.name ? ` (${msg.name})` : ''}</div>
      <div class="content">${role === 'tool' ? `<pre>${body}</pre>` : body.replace(/\n/g, '<br>')}</div>
    </div>`;
      })
      .join('\n')}
  </main>
</body>
</html>`;
  } else {
    // Markdown
    let mdContent = `# Locus AI Session Export\n\n`;
    mdContent += `- **ID:** ${session.id}\n`;
    mdContent += `- **Date:** ${new Date(session.createdAt).toLocaleString()}\n`;
    mdContent += `- **Model:** ${session.provider} / ${session.model}\n\n`;
    mdContent += `---\n\n`;

    for (const msg of session.messages) {
      switch (msg.role) {
        case 'user':
          mdContent += `### 👤 You\n\n${msg.content}\n\n`;
          break;
        case 'assistant':
          if (msg.content) {
            mdContent += `### 🤖 Assistant\n\n${msg.content}\n\n`;
          }
          break;
        case 'tool':
          mdContent += `**[Tool Executed]** \`${msg.name}\`\n\n\`\`\`json\n${msg.content}\n\`\`\`\n\n`;
          break;
      }
    }
    contentToWrite = mdContent;
  }

  try {
    await fs.writeFile(outPath, contentToWrite, 'utf-8');
    console.log(`\x1b[32mSuccess:\x1b[0m Session exported in ${format.toUpperCase()} format to ${outPath}`);
  } catch (err: any) {
    console.error(`Error saving export file: ${err.message}`);
    process.exit(1);
  }
}
