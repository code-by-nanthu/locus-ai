import express from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as net from 'net';
import open from 'open';
import { execa } from 'execa';
import { fileURLToPath } from 'url';
import { loadConfig, saveConfig, LocusConfig, getConfigDir } from '../../core/config.js';
import { getLocalClient, fetchLocalModels } from '../../services/llm.js';
import { generateSessionId, saveSession, listSessionsDetail, loadSession, deleteSession, renameSession, truncateSession } from '../../core/session.js';
import { runAgentLoop, fetchPromptSuggestions, PendingApprovalEntry } from '../../services/agent.js';
import { FALLBACK_SUGGESTIONS, DEFAULT_UI_PORT } from '../../core/constants.js';
import { EMBEDDED_WEB_ASSETS } from './webAssets.js';

/** Checks if a port is available on 127.0.0.1, incrementing if busy */
async function findAvailablePort(startPort: number, maxAttempts = 10): Promise<number> {
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    const isAvailable = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.unref();
      server.on('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true));
      });
    });
    if (isAvailable) return port;
  }
  return startPort;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runUiCommand(options?: { port?: number }) {
  const config = await loadConfig();
  if (!config || !config.defaultProvider || !config.defaultModel) {
    console.error('Error: Default provider and model are not set. Start Locus once to configure them.');
    process.exit(1);
  }

  const app = express();
  app.use(express.json());

  const requestedPort = Number(options?.port || process.env.PORT || DEFAULT_UI_PORT);
  const PORT = await findAvailablePort(requestedPort);
  if (PORT !== requestedPort) {
    console.log(`\n\x1b[33mPort ${requestedPort} is in use; automatically selected available port ${PORT}\x1b[0m`);
  }

  const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`, `127.0.0.1`, `localhost`, `[::1]`]);

  // SEC-2: DNS rebinding protection via Host header validation (421 Misdirected Request)
  app.use((req, res, next) => {
    const host = req.headers.host || '';
    if (!ALLOWED_HOSTS.has(host)) {
      return res.status(421).send('Misdirected Request: Invalid Host header (DNS rebinding protection)');
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

  // Serve web dashboard UI from embedded memory assets (with SPA routing and disk fallback)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();

    let assetPath = req.path === '/' ? '/index.html' : req.path;
    let asset = EMBEDDED_WEB_ASSETS[assetPath];

    // Single Page App (SPA) fallback: serve index.html for non-asset routes
    if (!asset && !path.extname(req.path)) {
      asset = EMBEDDED_WEB_ASSETS['/index.html'];
    }

    if (asset) {
      res.setHeader('Content-Type', asset.contentType);
      if (asset.isBase64) {
        res.send(Buffer.from(asset.content, 'base64'));
      } else {
        res.send(asset.content);
      }
      return;
    }

    // Secondary disk fallback if running directly from source directory
    const diskPath = path.join(__dirname, '..', '..', 'web', req.path === '/' ? 'index.html' : req.path);
    res.sendFile(diskPath, (err) => {
      if (err) next();
    });
  });

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

  const handleRename = async (req: express.Request, res: express.Response) => {
    try {
      const { title } = req.body;
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: 'Title is required' });
      }
      const id = String(req.params.id);
      await renameSession(id, title.trim());
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to rename session' });
    }
  };

  app.post('/api/session/:id/rename', handleRename);
  app.put('/api/session/:id/rename', handleRename);
  app.put('/api/session/:id', handleRename);
  app.patch('/api/session/:id', handleRename);

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

  const handleApproval = (req: express.Request, res: express.Response) => {
    const authId = (req.params.id || req.body.authId) as string;
    if (!authId || typeof authId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid authId' });
    }
    const entry = pendingApprovals.get(authId);
    if (!entry) {
      return res.status(404).json({ error: 'Approval request not found, expired, or already resolved' });
    }
    clearTimeout(entry.timer);
    pendingApprovals.delete(authId);

    const approved = req.body.allow !== undefined ? Boolean(req.body.allow) : Boolean(req.body.approved);
    const always = Boolean(req.body.always);

    entry.resolve({ approved, always });
    res.json({ success: true });
  };

  app.post('/api/auth/:id', handleApproval);
  app.post('/api/approve', handleApproval);

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

  // SEC-1: Bind strictly to 127.0.0.1 (never 0.0.0.0 or LAN interfaces)
  app.listen(PORT, '127.0.0.1', async () => {
    const launchUrl = `http://localhost:${PORT}?token=${bearerToken}`;
    console.log(`\n\x1b[36mLocus UI is running at ${launchUrl}\x1b[0m\n`);
    await open(launchUrl);
  });
}
