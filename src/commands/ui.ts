import express from 'express';
import * as path from 'path';
import open from 'open';
import { fileURLToPath } from 'url';
import { loadConfig, saveConfig, LocusConfig } from '../core/config.js';
import { getLocalClient } from '../services/llm.js';
import { executeTool } from '../services/tools.js';
import { generateSessionId, saveSession, listSessionsDetail, loadSession } from '../core/session.js';

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

  // Serve static files from the compiled dist/web directory
  const webDir = path.join(__dirname, '..', 'web');
  app.use(express.static(webDir));

  // Map to hold pending approvals: authId -> resolve function
  const pendingApprovals = new Map<string, (result: { approved: boolean; always: boolean }) => void>();

  app.get('/api/sessions', async (req, res) => {
    try {
      const sessions = await listSessionsDetail();
      res.json(sessions);
    } catch (e) {
      res.status(500).json({ error: 'Failed to load sessions' });
    }
  });

  app.get('/api/session/:id', async (req, res) => {
    try {
      const session = await loadSession(req.params.id);
      if (session) res.json(session);
      else res.status(404).json({ error: 'Not found' });
    } catch (e) {
      res.status(500).json({ error: 'Failed to load session' });
    }
  });

  app.post('/api/approve', async (req, res) => {
    const { authId, approved, always } = req.body;
    const resolve = pendingApprovals.get(authId);
    if (resolve) {
      resolve({ approved, always });
      pendingApprovals.delete(authId);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Approval not found or already resolved' });
    }
  });

  // The chat API endpoint
  app.post('/api/chat', async (req, res) => {
    let { history, sessionId } = req.body;
    
    if (!history || !Array.isArray(history)) {
      return res.status(400).json({ error: 'Invalid history format' });
    }
    
    if (!sessionId) {
      sessionId = generateSessionId();
    }

    const userInput = history[history.length - 1]?.content?.trim();
    if (userInput?.startsWith('/')) {
      if (userInput === '/whitelist') {
        const list = config?.autoApprove || [];
        const content = list.length === 0 
          ? 'Your auto-approve whitelist is currently empty.'
          : `**Auto-approved patterns:**\n${list.map(l => `- ${l}`).join('\n')}\n\nType \`/whitelist clear\` to reset it.`;
        return res.json({ systemMessage: content });
      }
      if (userInput === '/whitelist clear') {
        config.autoApprove = [];
        await saveConfig(config as LocusConfig);
        return res.json({ systemMessage: 'Whitelist cleared successfully.' });
      }
    }

    const client = getLocalClient(config.defaultProvider, config.baseURLs?.[config.defaultProvider]);
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      let isRunning = true;
      let currentHistory = [...history];
      
      while (isRunning) {
        const stream = await client.chat.completions.create({
          model: config.defaultModel,
          messages: currentHistory,
          stream: true,
        });

        let fullContent = '';
        let toolCallBuffer: any = null;

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          
          if (delta?.content) {
            fullContent += delta.content;
            res.write(`data: ${JSON.stringify({ type: 'content', content: delta.content })}\n\n`);
          }

          if (delta?.tool_calls) {
            for (const call of delta.tool_calls) {
              if (call.function?.name) {
                if (toolCallBuffer) {
                  // Execute previous tool
                  res.write(`data: ${JSON.stringify({ type: 'tool_start', name: toolCallBuffer.name, args: toolCallBuffer.args })}\n\n`);
                  const result = await runTool(toolCallBuffer, config, pendingApprovals, res);
                  res.write(`data: ${JSON.stringify({ type: 'tool_result', name: toolCallBuffer.name, result })}\n\n`);
                  currentHistory.push(
                    { role: 'assistant', tool_calls: [{ id: toolCallBuffer.id, type: 'function', function: { name: toolCallBuffer.name, arguments: toolCallBuffer.args } }] },
                    { role: 'tool', tool_call_id: toolCallBuffer.id, name: toolCallBuffer.name, content: result }
                  );
                  await saveSession(sessionId, config.defaultProvider, config.defaultModel, currentHistory);
                }
                toolCallBuffer = { id: call.id, name: call.function.name, args: '' };
              }
              if (call.function?.arguments) {
                if (toolCallBuffer) toolCallBuffer.args += call.function.arguments;
              }
            }
          }
        }

        if (toolCallBuffer) {
          res.write(`data: ${JSON.stringify({ type: 'tool_start', name: toolCallBuffer.name, args: toolCallBuffer.args })}\n\n`);
          const result = await runTool(toolCallBuffer, config, pendingApprovals, res);
          res.write(`data: ${JSON.stringify({ type: 'tool_result', name: toolCallBuffer.name, result })}\n\n`);
          currentHistory.push(
            { role: 'assistant', tool_calls: [{ id: toolCallBuffer.id, type: 'function', function: { name: toolCallBuffer.name, arguments: toolCallBuffer.args } }] },
            { role: 'tool', tool_call_id: toolCallBuffer.id, name: toolCallBuffer.name, content: result }
          );
          await saveSession(sessionId, config.defaultProvider, config.defaultModel, currentHistory);
        } else {
          isRunning = false;
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
      
      // Save session one last time just in case there were no tools
      await saveSession(sessionId, config.defaultProvider, config.defaultModel, currentHistory);
    } catch (err: any) {
      console.error(err);
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    }
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, async () => {
    console.log(`\n\x1b[36mLocus UI is running at http://localhost:${PORT}\x1b[0m\n`);
    await open(`http://localhost:${PORT}`);
  });
}

async function runTool(toolCall: any, config: any, pendingApprovals: Map<string, any>, res: express.Response): Promise<string> {
  const GUARDED_TOOLS = new Set(['write_file', 'run_command']);
  let name = toolCall.name;
  let argsObj = {};
  
  try {
    argsObj = JSON.parse(toolCall.args || '{}');
  } catch (e) {
    return JSON.stringify({ error: 'Invalid tool arguments JSON' });
  }

  if (GUARDED_TOOLS.has(name)) {
    let pattern = name;
    if (name === 'run_command') {
      const cmdArgs = argsObj as any;
      const execName = (cmdArgs.command || '').trim().split(/\s+/)[0];
      pattern = `run_command:${execName}`;
    }

    if (!config?.autoApprove?.includes(pattern)) {
      // Pause execution and ask for approval over SSE
      const authId = Math.random().toString(36).substring(2, 15);
      
      const approvalPromise = new Promise<{ approved: boolean, always: boolean }>((resolve) => {
        pendingApprovals.set(authId, resolve);
      });
      
      res.write(`data: ${JSON.stringify({ type: 'tool_auth_required', authId, toolName: name, args: argsObj, pattern })}\n\n`);
      
      const authResult = await approvalPromise;
      
      if (!authResult.approved) {
        return JSON.stringify({ denied: true });
      }
      
      if (authResult.always) {
        config.autoApprove = [...(config.autoApprove || []), pattern];
        await saveConfig(config as LocusConfig);
      }
    }
  }

  return await executeTool(name, argsObj);
}
