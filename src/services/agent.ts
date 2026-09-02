import type express from 'express';
import type OpenAI from 'openai';
import { executeTool } from './tools.js';
import { saveSession } from '../core/session.js';
import { saveConfig } from '../core/config.js';
import { GUARDED_TOOLS } from '../core/constants.js';
import type { LocusConfig } from '../core/config.js';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ToolCallBuffer {
  id: string;
  name: string;
  args: string;
}

// ── Tool Authorization ─────────────────────────────────────────────────────────

/**
 * Persists a new pattern to the auto-approve list.
 * Mutates config in place and writes to disk.
 */
async function persistAutoApprove(config: LocusConfig, pattern: string): Promise<void> {
  config.autoApprove = [...(config.autoApprove ?? []), pattern];
  await saveConfig(config);
}

/**
 * Derives the authorization pattern key for a given tool call.
 * For run_command, the pattern includes the executable name (e.g. "run_command:npm").
 */
function getAuthPattern(name: string, parsedArgs: Record<string, any>): string {
  if (name !== 'run_command') return name;
  const execName = (parsedArgs.command ?? '').trim().split(/\s+/)[0];
  return `run_command:${execName}`;
}

/**
 * Authorizes a guarded tool call via the pending approvals map and SSE.
 * Returns the parsed result from the client approval action.
 *
 * This is a long-lived promise — it resolves only when the user clicks
 * Approve/Deny in the UI and the /api/approve endpoint resolves it.
 */
async function requestToolApproval(
  name: string,
  parsedArgs: Record<string, any>,
  pattern: string,
  res: express.Response,
  pendingApprovals: Map<string, (result: { approved: boolean; always: boolean }) => void>
): Promise<{ approved: boolean; always: boolean }> {
  const authId = Math.random().toString(36).substring(2, 15);

  const approvalPromise = new Promise<{ approved: boolean; always: boolean }>((resolve) => {
    pendingApprovals.set(authId, resolve);
  });

  res.write(
    `data: ${JSON.stringify({ type: 'tool_auth_required', authId, toolName: name, args: parsedArgs, pattern })}\n\n`
  );

  return approvalPromise;
}

/**
 * Runs a single tool call, handling authorization for guarded tools.
 * Uses guard clauses to keep the happy path flat.
 */
export async function runTool(
  toolCall: ToolCallBuffer,
  config: LocusConfig,
  pendingApprovals: Map<string, (result: { approved: boolean; always: boolean }) => void>,
  res: express.Response
): Promise<string> {
  let parsedArgs: Record<string, any> = {};

  try {
    parsedArgs = JSON.parse(toolCall.args || '{}');
  } catch {
    return JSON.stringify({ error: 'Invalid tool arguments JSON' });
  }

  // Fast-path: unguarded tools run immediately
  if (!GUARDED_TOOLS.has(toolCall.name)) return executeTool(toolCall.name, parsedArgs);

  const pattern = getAuthPattern(toolCall.name, parsedArgs);

  // Fast-path: already in the auto-approve whitelist
  if (config.autoApprove?.includes(pattern)) return executeTool(toolCall.name, parsedArgs);

  // Slow-path: pause and request user approval over SSE
  const authResult = await requestToolApproval(toolCall.name, parsedArgs, pattern, res, pendingApprovals);

  if (!authResult.approved) return JSON.stringify({ denied: true });

  if (authResult.always) await persistAutoApprove(config, pattern);

  return executeTool(toolCall.name, parsedArgs);
}

// ── Agent loop ─────────────────────────────────────────────────────────────────

/**
 * Runs the streaming agent loop for a single user turn.
 * Emits SSE events via `res.write` and persists session state after each tool call.
 *
 * The loop continues until the model produces a text-only response (no tool calls),
 * at which point it emits [DONE] and returns.
 */
export async function runAgentLoop(
  client: OpenAI,
  config: LocusConfig,
  initialHistory: any[],
  sessionId: string,
  pendingApprovals: Map<string, (result: { approved: boolean; always: boolean }) => void>,
  res: express.Response
): Promise<void> {
  let currentHistory = [...initialHistory];

  while (true) {
    const stream = await client.chat.completions.create({
      model: config.defaultModel,
      messages: currentHistory,
      stream: true,
    });

    let fullContent = '';
    let toolCallBuffer: ToolCallBuffer | null = null;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        fullContent += delta.content;
        res.write(`data: ${JSON.stringify({ type: 'content', content: delta.content })}\n\n`);
      }

      if (delta?.tool_calls) {
        for (const call of delta.tool_calls) {
          if (call.function?.name) {
            // A new tool call starts — flush and execute the previous one first
            if (toolCallBuffer) {
              res.write(`data: ${JSON.stringify({ type: 'tool_start', name: toolCallBuffer.name, args: toolCallBuffer.args })}\n\n`);
              const result = await runTool(toolCallBuffer, config, pendingApprovals, res);
              res.write(`data: ${JSON.stringify({ type: 'tool_result', name: toolCallBuffer.name, result })}\n\n`);
              currentHistory.push(
                { role: 'assistant', tool_calls: [{ id: toolCallBuffer.id, type: 'function', function: { name: toolCallBuffer.name, arguments: toolCallBuffer.args } }] },
                { role: 'tool', tool_call_id: toolCallBuffer.id, name: toolCallBuffer.name, content: result }
              );
              await saveSession(sessionId, config.defaultProvider, config.defaultModel, currentHistory);
            }
            toolCallBuffer = { id: call.id ?? '', name: call.function.name, args: '' };
          }
          if (call.function?.arguments && toolCallBuffer) {
            toolCallBuffer.args += call.function.arguments;
          }
        }
      }
    }

    // Flush the last buffered tool call (if any)
    if (toolCallBuffer) {
      res.write(`data: ${JSON.stringify({ type: 'tool_start', name: toolCallBuffer.name, args: toolCallBuffer.args })}\n\n`);
      const result = await runTool(toolCallBuffer, config, pendingApprovals, res);
      res.write(`data: ${JSON.stringify({ type: 'tool_result', name: toolCallBuffer.name, result })}\n\n`);
      currentHistory.push(
        { role: 'assistant', tool_calls: [{ id: toolCallBuffer.id, type: 'function', function: { name: toolCallBuffer.name, arguments: toolCallBuffer.args } }] },
        { role: 'tool', tool_call_id: toolCallBuffer.id, name: toolCallBuffer.name, content: result }
      );
      await saveSession(sessionId, config.defaultProvider, config.defaultModel, currentHistory);
      // Continue looping — the model needs to synthesize a response
    } else {
      // No tool calls: model produced a final text response — we are done
      break;
    }
  }
}
