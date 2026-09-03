#!/usr/bin/env node
import React from 'react';
import * as fs from 'fs/promises';
import * as path from 'path';
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

// ── Crash handling & safe shutdown (I-6) ────────────────────────────────────

function setupCrashHandlers() {
  process.on('uncaughtException', (err) => {
    console.error('\n\x1b[31m[Locus Fatal Error]\x1b[0m Uncaught exception:', err.message);
    if (process.env.LOCUS_DEBUG) console.error(err.stack);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('\n\x1b[31m[Locus Error]\x1b[0m Unhandled promise rejection:', reason);
    if (process.env.LOCUS_DEBUG && reason instanceof Error) console.error(reason.stack);
  });

  const cleanup = () => {
    // Ensure terminal cursor is restored
    process.stdout.write('\x1b[?25h');
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

// ── Update check against release manifest (D-6) ─────────────────────────────

async function checkForUpdates(): Promise<void> {
  try {
    const { getConfigDir } = await import('./core/config.js');
    const stampFile = path.join(getConfigDir(), 'last_update_check.json');
    let lastCheck = 0;
    try {
      const data = JSON.parse(await fs.readFile(stampFile, 'utf-8'));
      lastCheck = data.timestamp || 0;
    } catch {}

    // Check at most once every 24 hours
    if (Date.now() - lastCheck < 24 * 60 * 60 * 1000) return;

    await fs.writeFile(stampFile, JSON.stringify({ timestamp: Date.now() }), 'utf-8');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const res = await fetch('https://api.github.com/repos/code-by-nanthu/locus-ai/releases/latest', {
      signal: controller.signal,
      headers: { 'User-Agent': 'locus-cli' },
    });
    clearTimeout(timer);

    if (res.ok) {
      const release: any = await res.json();
      const latestTag = release.tag_name?.replace(/^v/, '');
      if (latestTag && latestTag !== '1.0.0') {
        console.log(`\n\x1b[33m💡 Update available: v1.0.0 → v${latestTag} (https://github.com/code-by-nanthu/locus-ai/releases)\x1b[0m\n`);
      }
    }
  } catch {}
}

// ── Main entry point ──────────────────────────────────────────────────────────

async function main() {
  setupCrashHandlers();
  checkForUpdates().catch(() => {});
  const args = process.argv.slice(2);

  // ── --debug flag (I-5) ─────────────────────────────────────────────────────
  if (args.includes('--debug')) {
    process.env.LOCUS_DEBUG = 'true';
  }

  // ── --docker flag (S-10) ───────────────────────────────────────────────────
  if (args.includes('--docker')) {
    process.env.LOCUS_SANDBOX = 'docker';
  }

  // ── --version / -v ─────────────────────────────────────────────────────────
  if (args.includes('--version') || args.includes('-v')) {
    console.log('locus v1.0.0');
    process.exit(0);
  }

  // ── --help / -h ────────────────────────────────────────────────────────────
  if (args.includes('--help') || args.includes('-h') || args[0] === 'help') {
    console.log(`
Locus — Privacy-First Local AI Coding Agent & Orchestrator

Usage:
  locus [subcommand] [options]

Subcommands:
  (none)                  Launch the interactive terminal assistant (React Ink UI)
  ui [--port <port>]      Launch browser Web UI (default port: 7331, with auto-fallback)
  eval                    Run agent evaluation benchmark harness against fixture repos
  diff                    Inspect git working tree modifications and diff statistics
  commit                  Generate Conventional Commit message from staged changes
  export [id] [options]   Export session history to Markdown, JSON, or HTML
  sessions                List all saved conversations and session timestamps

Options:
  --session <id>          Resume a specific conversation session
  --format <md|json|html> Export output format (for export subcommand)
  --out <file>            Custom output destination file
  --debug                 Enable verbose debug diagnostics and logs
  --docker                Execute commands inside isolated Docker sandbox container
  -v, --version           Print the version of Locus
  -h, --help              Show this help menu
`);
    process.exit(0);
  }

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

  // ── locus diff ─────────────────────────────────────────────────────────────
  if (args[0] === 'diff') {
    const { execa } = await import('execa');
    try {
      const { stdout } = await execa({ shell: true, reject: false })`git diff --stat && git diff`;
      if (stdout.trim()) {
        console.log('\n' + stdout.trim() + '\n');
      } else {
        console.log('\n  Working tree is clean. No git changes detected.\n');
      }
    } catch (err: any) {
      console.error(`\n  Failed to inspect git diff: ${err.message}\n`);
    }
    process.exit(0);
  }

  // ── locus export [id] [--format md|json|html] ─────────────────────────────
  if (args[0] === 'export') {
    await runExportCommand(args.slice(1));
    return;
  }

  // ── locus eval (EVAL-1) ────────────────────────────────────────────────────
  if (args[0] === 'eval') {
    const { execa } = await import('execa');
    console.log('\n\x1b[36mRunning Locus Agent Evaluation Harness (EVAL-1)...\x1b[0m\n');
    const res = await execa({ stdio: 'inherit', reject: false })`node --test dist/test/eval_harness.test.js`;
    process.exit(res.exitCode ?? 0);
  }

  // ── locus ui [--port <port>] ───────────────────────────────────────────────
  if (args[0] === 'ui') {
    let customPort: number | undefined;
    const portIdx = args.indexOf('--port');
    if (portIdx !== -1 && args[portIdx + 1]) {
      customPort = Number(args[portIdx + 1]);
    }
    await runUiCommand({ port: customPort });
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
