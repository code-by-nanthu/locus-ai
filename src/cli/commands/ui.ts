import express from 'express';
import * as path from 'path';
import open from 'open';
import { fileURLToPath } from 'url';
import { loadConfig, saveConfig, LocusConfig } from '../../core/config.js';
import { getLocalClient, fetchLocalModels } from '../../services/llm.js';
import { generateSessionId, saveSession, listSessionsDetail, loadSession, deleteSession, renameSession } from '../../core/session.js';
import { runAgentLoop, fetchPromptSuggestions } from '../../services/agent.js';
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

  const webDir = path.join(__dirname, '..', '..', 'web');
  app.use(express.static(webDir));

  // Map to hold pending approvals: authId -> resolve function
  const pendingApprovals = new Map<string, (result: { approved: boolean; always: boolean }) => void>();

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

  // ── Approval endpoint ──────────────────────────────────────────────────────

  app.post('/api/approve', (req, res) => {
    const { authId, approved, always } = req.body;
    const resolve = pendingApprovals.get(authId);
    if (!resolve) {
      return res.status(404).json({ error: 'Approval not found or already resolved' });
    }
    resolve({ approved, always });
    pendingApprovals.delete(authId);
    res.json({ success: true });
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

    const client = getLocalClient(config.defaultProvider, config.baseURLs?.[config.defaultProvider]);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      await runAgentLoop(client, config as LocusConfig, history, sessionId, pendingApprovals, res);
      res.write('data: [DONE]\n\n');
      // Final save to catch text-only turns where no in-loop save occurred
      await saveSession(sessionId, config.defaultProvider, config.defaultModel, history);
      res.end();
    } catch (err: any) {
      console.error(err);
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    }
  });

  // ── Server ─────────────────────────────────────────────────────────────────

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, async () => {
    console.log(`\n\x1b[36mLocus UI is running at http://localhost:${PORT}\x1b[0m\n`);
    await open(`http://localhost:${PORT}`);
  });
}
