import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSession, listSessions } from '../core/session.js';

export async function runExportCommand(sessionId?: string) {
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
  const filename = `locus-session-${idToExport.slice(0, 8)}-${date}.md`;
  const outPath = path.resolve(process.cwd(), filename);

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

  try {
    await fs.writeFile(outPath, mdContent, 'utf-8');
    console.log(`\x1b[32mSuccess:\x1b[0m Session exported to ${outPath}`);
  } catch (err: any) {
    console.error(`Error saving export file: ${err.message}`);
    process.exit(1);
  }
}
