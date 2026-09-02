#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './components/App.js';
import { loadSession, listSessions, listSessionsDetail } from './core/session.js';
import { loadConfig } from './core/config.js';

async function main() {
  const args = process.argv.slice(2);
  const sessionFlagIdx = args.indexOf('--session');

  // ── locus sessions — list all saved sessions and exit ──────────────────────
  if (args[0] === 'sessions') {
    const sessions = await listSessionsDetail();
    if (sessions.length === 0) {
      console.log('\n  No sessions saved yet. Start chatting and your history will be stored automatically.\n');
      process.exit(0);
    }
    console.log('\n  Saved sessions (most recent first):\n');
    console.log('  ' + ['ID', 'Model', 'Turns', 'Date'].map(h => h.padEnd(28)).join(''));
    console.log('  ' + '─'.repeat(88));
    for (const s of sessions) {
      const date = new Date(s.createdAt).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
      console.log(
        '  ' +
        s.id.padEnd(28) +
        s.model.padEnd(28) +
        String(s.turns).padEnd(28) +
        date
      );
    }
    console.log('\n  Resume a session: pnpm start -- --session <ID>\n');
    process.exit(0);
  }

  // Load saved config (if any)
  const config = await loadConfig();

  // Load session if --session <id> was passed
  let initialHistory: any[] = [];
  let initialProvider = config?.defaultProvider ?? null;
  let initialModel = config?.defaultModel ?? null;
  let initialSessionId: string | null = null;

  if (sessionFlagIdx !== -1) {
    const sessionId = args[sessionFlagIdx + 1];
    if (sessionId) {
      const session = await loadSession(sessionId);
      if (session) {
        initialHistory = session.messages;
        initialProvider = session.provider as any;
        initialModel = session.model;
        initialSessionId = sessionId;
      } else {
        console.error(`[locus] Session "${sessionId}" not found. Starting fresh.`);
      }
    } else {
      console.error('[locus] --session requires an ID argument. Starting fresh.');
    }
  } else if (config?.defaultProvider && config?.defaultModel) {
    // No explicit --session flag: auto-restore the most recent session
    const sessions = await listSessions();
    if (sessions.length > 0) {
      const latest = await loadSession(sessions[0]);
      if (latest) {
        initialHistory = latest.messages;
        initialSessionId = sessions[0];
      }
    }
  }

  render(
    <App
      config={config}
      initialHistory={initialHistory}
      initialProvider={initialProvider}
      initialModel={initialModel}
      initialSessionId={initialSessionId}
    />
  );
}

main();
