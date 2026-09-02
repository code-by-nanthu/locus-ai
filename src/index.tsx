#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './cli/components/App.js';
import { loadSession, listSessions, listSessionsDetail } from './core/session.js';
import { loadConfig, LocusConfig } from './core/config.js';
import { runCommitCommand } from './cli/commands/commit.js';
import { runExportCommand } from './cli/commands/export.js';
import { runUiCommand } from './cli/commands/ui.js';
import type { Provider } from './services/llm.js';

// ── Session resolution helper ─────────────────────────────────────────────────

interface InitialSession {
  history: any[];
  provider: Provider | null;
  model: string | null;
  sessionId: string | null;
}

/**
 * Resolves initial session state before rendering the CLI app.
 *
 * Priority order:
 *   1. --session <id> flag → load that specific session
 *   2. config defaults set → auto-restore the most recent session
 *   3. No config → return empty state (setup wizard will run)
 */
async function resolveInitialSession(
  config: LocusConfig | null,
  args: string[]
): Promise<InitialSession> {
  const empty: InitialSession = {
    history: [],
    provider: config?.defaultProvider as Provider ?? null,
    model: config?.defaultModel ?? null,
    sessionId: null,
  };

  const sessionFlagIdx = args.indexOf('--session');

  if (sessionFlagIdx !== -1) {
    const sessionId = args[sessionFlagIdx + 1];
    if (!sessionId) {
      console.error('[locus] --session requires an ID argument. Starting fresh.');
      return empty;
    }
    const session = await loadSession(sessionId);
    if (!session) {
      console.error(`[locus] Session "${sessionId}" not found. Starting fresh.`);
      return empty;
    }
    return {
      history: session.messages,
      provider: session.provider as Provider,
      model: session.model,
      sessionId,
    };
  }

  // Auto-restore the most recent session when config defaults are set
  if (config?.defaultProvider && config?.defaultModel) {
    const sessions = await listSessions();
    if (sessions.length > 0) {
      const latest = await loadSession(sessions[0]);
      if (latest) {
        return { ...empty, history: latest.messages, sessionId: sessions[0] };
      }
    }
  }

  return empty;
}

// ── Main entry point ──────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // ── locus sessions — list all saved sessions and exit ──────────────────────
  if (args[0] === 'sessions') {
    const sessions = await listSessionsDetail();
    if (sessions.length === 0) {
      console.log('\n  No sessions saved yet. Start chatting and your history will be stored automatically.\n');
      process.exit(0);
    }
    console.log('\n  Saved sessions (most recent first):\n');
    console.log('  ' + ['ID', 'Model', 'Turns', 'Date'].map((h) => h.padEnd(28)).join(''));
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

  // ── locus commit ───────────────────────────────────────────────────────────
  if (args[0] === 'commit') {
    await runCommitCommand();
    return;
  }

  // ── locus export [id] ──────────────────────────────────────────────────────
  if (args[0] === 'export') {
    await runExportCommand(args[1]);
    return;
  }

  // ── locus ui ───────────────────────────────────────────────────────────────
  if (args[0] === 'ui') {
    await runUiCommand();
    return;
  }

  const config = await loadConfig();
  const { history, provider, model, sessionId } = await resolveInitialSession(config, args);

  render(
    <App
      config={config}
      initialHistory={history}
      initialProvider={provider}
      initialModel={model}
      initialSessionId={sessionId}
    />
  );
}

main();
