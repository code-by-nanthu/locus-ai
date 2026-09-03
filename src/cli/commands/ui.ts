import express from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import open from 'open';
import { execa } from 'execa';
import { fileURLToPath } from 'url';
import { loadConfig, saveConfig, LocusConfig, getConfigDir } from '../../core/config.js';
import { getLocalClient, fetchLocalModels } from '../../services/llm.js';
import { generateSessionId, saveSession, listSessionsDetail, loadSession, deleteSession, renameSession, truncateSession } from '../../core/session.js';
import { runAgentLoop, fetchPromptSuggestions, PendingApprovalEntry } from '../../services/agent.js';
import { FALLBACK_SUGGESTIONS } from '../../core/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runUiCommand() {
  const config = await loadConfig();
  if (!config || !config.defaultProvider || !config.defaultModel) {
    console.error('Error: Default provider and model are not set. Start Locus once to configure them.');
    process.exit(1);
  }

  const app = express();
  app.use(express.json());

  // S-2: DNS rebinding protection via Host header validation
  app.use((req, res, next) => {
    const host = req.headers.host || '';
    const hostname = host.split(':')[0].toLowerCase();
    const allowed = new Set(['localhost', '127.0.0.1', '[::1]']);
    if (!allowed.has(hostname)) {
      return res.status(403).send('Forbidden: Invalid Host header (DNS rebinding protection)');
    }
    next();
  });

  // S-1: Loopback API authentication with persistent bearer token
  const tokenFile = path.join(getConfigDir(), 'session_token');
  let bearerToken: string;
  try {
    bearerToken = (await fs.readFile(tokenFile, 'utf-8')).trim();
    if (!bearerToken || bearerToken.length < 20) throw new Error();
  } catch {
    bearerToken = crypto.randomBytes(24).toString('hex');
    await fs.writeFile(tokenFile, bearerToken, 'utf-8').catch(() => {});
  }

  app.use('/api', (req, res, next) => {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string | undefined;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;
    if (!token || token !== bearerToken) {
      return res.status(401).json({ error: 'Unauthorized: missing or invalid bearer token' });
    }
    next();
  });

  const webDir = path.join(__dirname, '..', '..', 'web');
  app.use(express.static(webDir));

  // Map to hold pending approvals: authId -> PendingApprovalEntry
  const pendingApprovals = new Map<string, PendingApprovalEntry>();

  // ── Session endpoints ──────────────────────────────────────────────────────

  app.get('/api/sessions', async (req, res) => {
    try {
      const sessions = await listSessionsDetail();
      res.json(sessions);
    } catch {
      res.status(500).json({ error: 'Failed to load sessions' });
    }
  });

  app.get('/api/session/:id', async (req, res) => {
    try {
      const session = await loadSession(req.params.id);
      if (session) res.json(session);
      else res.status(404).json({ error: 'Not found' });
    } catch {
      res.status(500).json({ error: 'Failed to load session' });
    }
  });

  app.delete('/api/session/:id', async (req, res) => {
    try {
      await deleteSession(req.params.id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete session' });
    }
  });

  app.put('/api/session/:id', async (req, res) => {
    try {
      const { title } = req.body;
      await renameSession(req.params.id, title);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to rename session' });
    }
  });

  // ── Suggestions endpoint ───────────────────────────────────────────────────

  app.get('/api/suggestions', async (req, res) => {
    try {
      const client = getLocalClient(config.defaultProvider, config.baseURLs?.[config.defaultProvider]);
      const suggestions = await fetchPromptSuggestions(client, config.defaultModel);
      res.json(suggestions);
    } catch {
      res.json(FALLBACK_SUGGESTIONS);
    }
  });

  // ── Config endpoints ───────────────────────────────────────────────────────

  app.get('/api/config', (req, res) => {
    res.json(config);
  });

  app.post('/api/config', async (req, res) => {
    try {
      if (req.body.defaultProvider) config.defaultProvider = req.body.defaultProvider;
      if (req.body.defaultModel) config.defaultModel = req.body.defaultModel;
      if (req.body.baseURLs) {
        config.baseURLs = { ...(config.baseURLs ?? {}), ...req.body.baseURLs };
      }
      await saveConfig(config as LocusConfig);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to save config' });
    }
  });

  app.get('/api/models', async (req, res) => {
    try {
      const provider = (req.query.provider as string) || config.defaultProvider;
      const baseURL = (req.query.baseUrl as string) || config.baseURLs?.[provider as any];
      const models = await fetchLocalModels(provider as any, baseURL);
      res.json(models);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Health & Version endpoints (API-8) ─────────────────────────────────────

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), version: '1.0.0' });
  });

  app.get('/api/version', (_req, res) => {
    res.json({ name: 'locus', version: '1.0.0' });
  });

  // ── Session Export endpoint (API-9) ────────────────────────────────────────

  app.get('/api/session/:id/export', async (req, res) => {
    try {
      const session = await loadSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      const format = ((req.query.format as string) || 'json').toLowerCase();
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="locus-${session.id}.json"`);
        return res.send(JSON.stringify(session, null, 2));
      }
      if (format === 'html') {
        res.setHeader('Content-Type', 'text/html');
        return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Locus Session ${session.id}</title><style>body{background:#090d16;color:#e2e8f0;font-family:sans-serif;padding:2rem;max-width:800px;margin:auto}.msg{margin-bottom:1rem;padding:1rem;border-radius:6px;border:1px solid #1e293b}.user{background:#0f172a}.assistant{background:#111827}.tool{background:#030712;font-family:monospace}</style></head><body><h1>Locus Session Export</h1><p>Model: ${session.provider} / ${session.model}</p>${session.messages.map((m: any) => `<div class="msg ${m.role}"><strong>${m.role}:</strong><br>${String(m.content || '').replace(/</g, '&lt;')}</div>`).join('')}</body></html>`);
      }
      let md = `# Locus Session ${session.id}\n\nModel: ${session.provider} / ${session.model}\n\n---\n\n`;
      for (const m of session.messages) {
        md += `### ${m.role}\n\n${m.content || ''}\n\n`;
      }
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="locus-${session.id}.md"`);
      return res.send(md);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Session Truncate endpoint (API-6) ──────────────────────────────────────

  app.post('/api/session/:id/truncate', async (req, res) => {
    try {
      const { messageIndex } = req.body;
      const updated = await truncateSession(req.params.id, messageIndex);
      if (!updated) return res.status(404).json({ error: 'Session not found' });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Rules endpoint (API-7) ─────────────────────────────────────────────────

  app.get('/api/rules', (_req, res) => {
    res.json({ rules: config.autoApprove || [] });
  });

  app.put('/api/rules', async (req, res) => {
    const { rules } = req.body;
    if (!Array.isArray(rules)) {
      return res.status(400).json({ error: 'rules must be an array of pattern strings' });
    }
    config.autoApprove = rules.map(String);
    await saveConfig(config as LocusConfig);
    res.json({ success: true, rules: config.autoApprove });
  });

  // ── Approval endpoint ──────────────────────────────────────────────────────

  app.post('/api/approve', (req, res) => {
    const { authId, approved, always } = req.body;
    if (!authId || typeof authId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid authId' });
    }
    const entry = pendingApprovals.get(authId);
    if (!entry) {
      return res.status(404).json({ error: 'Approval request not found, expired, or already resolved' });
    }
    clearTimeout(entry.timer);
    pendingApprovals.delete(authId);
    entry.resolve({ approved: Boolean(approved), always: Boolean(always) });
    res.json({ success: true });
  });

  const activeAborts = new Map<string, AbortController>();

  // ── Abort endpoint (API-5) ─────────────────────────────────────────────────

  app.post('/api/chat/:id/abort', (req, res) => {
    const controller = activeAborts.get(req.params.id);
    if (controller) {
      controller.abort();
      activeAborts.delete(req.params.id);
      return res.json({ success: true, message: 'Generation aborted' });
    }
    return res.status(404).json({ error: 'No active generation found for session' });
  });

  // ── Context endpoint (API-10 / W-12) ───────────────────────────────────────

  app.get('/api/context', async (_req, res) => {
    try {
      const { getGitContext } = await import('../../services/agent.js');
      const git = await getGitContext();
      res.json({
        cwd: process.cwd(),
        git: git || 'No git repository detected',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Chat endpoint ──────────────────────────────────────────────────────────

  app.post('/api/chat', async (req, res) => {
    let { history, sessionId } = req.body;

    if (!history || !Array.isArray(history)) {
      return res.status(400).json({ error: 'Invalid history format' });
    }

    if (!sessionId) sessionId = generateSessionId();

    // Handle slash commands
    const userInput = (history[history.length - 1]?.content ?? '').trim();
    if (userInput === '/whitelist') {
      const list = config.autoApprove ?? [];
      const content = list.length
        ? `**Auto-approved patterns:**\n${list.map((l) => `- ${l}`).join('\n')}\n\nType \`/whitelist clear\` to reset it.`
        : 'Your auto-approve whitelist is currently empty.';
      return res.json({ systemMessage: content });
    }
    if (userInput === '/whitelist clear') {
      config.autoApprove = [];
      await saveConfig(config as LocusConfig);
      return res.json({ systemMessage: 'Whitelist cleared successfully.' });
    }
    if (userInput === '/diff') {
      try {
        const { stdout } = await execa({ shell: true, reject: false })`git diff --stat && git diff`;
        const content = stdout.trim()
          ? `\`\`\`diff\n${stdout.slice(0, 6000)}\n\`\`\``
          : 'Working tree is clean. No git changes detected.';
        return res.json({ systemMessage: content });
      } catch (err: any) {
        return res.json({ systemMessage: `Could not retrieve git diff: ${err.message}` });
      }
    }
    if (userInput === '/undo') {
      const { undoLastEdit } = await import('../../services/tools.js');
      const undoResult = await undoLastEdit();
      return res.json({ systemMessage: undoResult.ok ? `⎌ ${undoResult.message}` : `✖ ${undoResult.message}` });
    }

    const client = getLocalClient(config.defaultProvider, config.baseURLs?.[config.defaultProvider]);
    const controller = new AbortController();
    activeAborts.set(sessionId, controller);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ type: 'session', sessionId })}\n\n`);

    res.once('close', () => {
      if (!res.writableEnded) {
        controller.abort();
      }
      activeAborts.delete(sessionId);
    });

    try {
      const finalHistory = await runAgentLoop({
        client,
        config: config as LocusConfig,
        initialHistory: history,
        sessionId,
        pendingApprovals,
        signal: controller.signal,
        onEvent: (event) => {
          if (!res.writableEnded) {
            if (event.type === 'done') {
              res.write('data: [DONE]\n\n');
            } else {
              res.write(`data: ${JSON.stringify(event)}\n\n`);
            }
          }
        },
      });
      res.write('data: [DONE]\n\n');
      activeAborts.delete(sessionId);
      if (finalHistory && finalHistory.length > 0) {
        await saveSession(sessionId, config.defaultProvider, config.defaultModel, finalHistory);
      }
      res.end();
    } catch (err: any) {
      activeAborts.delete(sessionId);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        res.end();
      }
    }
  });

  // ── Server ─────────────────────────────────────────────────────────────────

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, async () => {
    const launchUrl = `http://localhost:${PORT}?token=${bearerToken}`;
    console.log(`\n\x1b[36mLocus UI is running at ${launchUrl}\x1b[0m\n`);
    await open(launchUrl);
  });
}
