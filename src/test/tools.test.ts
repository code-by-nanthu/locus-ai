import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import { executeTool, resolveSafeWorkspacePath, isSecretPath, undoLastEdit } from '../services/tools.js';
import { truncateSession, withSessionLock, saveSession, loadSession, deleteSession, renameSession, listSessionsDetail } from '../core/session.js';

describe('Security & Tool Execution Suite', () => {
  const testFile = path.resolve(process.cwd(), 'test-scratch.txt');

  before(async () => {
    await fs.writeFile(testFile, 'Line 1: Hello World\nLine 2: To be replaced\nLine 3: Keep me', 'utf-8');
  });

  after(async () => {
    try {
      await fs.unlink(testFile);
    } catch {}
  });

  it('detects secret paths and blocks them (AG-13)', () => {
    assert.strictEqual(isSecretPath('.env'), true);
    assert.strictEqual(isSecretPath('/path/to/.env.local'), true);
    assert.strictEqual(isSecretPath('id_rsa'), true);
    assert.strictEqual(isSecretPath('.git/config'), true);
    assert.strictEqual(isSecretPath('src/index.tsx'), false);
  });

  it('rejects path traversal attempts outside workspace (S-4)', async () => {
    await assert.rejects(
      async () => {
        await resolveSafeWorkspacePath('../../../etc/passwd', false);
      },
      /escapes workspace/
    );
  });

  it('reads a file safely within workspace', async () => {
    const raw = await executeTool('read_file', { filePath: 'test-scratch.txt' });
    const res = JSON.parse(raw);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.success, true);
    assert.ok(typeof res.durationMs === 'number');
    assert.ok(res.content.includes('Hello World'));
  });

  it('performs surgical search-and-replace using edit_file (AG-8)', async () => {
    const editRaw = await executeTool('edit_file', {
      filePath: 'test-scratch.txt',
      targetContent: 'Line 2: To be replaced',
      replacementContent: 'Line 2: Successfully updated',
    });
    const editRes = JSON.parse(editRaw);
    assert.strictEqual(editRes.ok, true);

    const readRaw = await executeTool('read_file', { filePath: 'test-scratch.txt' });
    const readRes = JSON.parse(readRaw);
    assert.ok(readRes.content.includes('Line 2: Successfully updated'));
    assert.ok(!readRes.content.includes('Line 2: To be replaced'));
  });

  it('returns structured error when edit_file target is not found', async () => {
    const editRaw = await executeTool('edit_file', {
      filePath: 'test-scratch.txt',
      targetContent: 'Non-existent phrase',
      replacementContent: 'Whatever',
    });
    const editRes = JSON.parse(editRaw);
    assert.strictEqual(editRes.ok, false);
    assert.strictEqual(editRes.errorCode, 'TARGET_NOT_FOUND');
  });

  it('supports line-range slicing in read_file (X-1)', async () => {
    const raw = await executeTool('read_file', { filePath: 'test-scratch.txt', startLine: 1, endLine: 1 });
    const res = JSON.parse(raw);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.content, 'Line 1: Hello World');
    assert.strictEqual(res.startLine, 1);
    assert.strictEqual(res.endLine, 1);
  });

  it('reverts the last edit via undoLastEdit (AG-9)', async () => {
    await executeTool('edit_file', {
      filePath: 'test-scratch.txt',
      targetContent: 'Line 3: Keep me',
      replacementContent: 'Line 3: Changed for undo test',
    });

    const undoRes = await undoLastEdit();
    assert.strictEqual(undoRes.ok, true);

    const readRaw = await executeTool('read_file', { filePath: 'test-scratch.txt' });
    const readRes = JSON.parse(readRaw);
    assert.ok(readRes.content.includes('Line 3: Keep me'));
  });

  it('executes run_command and returns exitCode with durationMs', async () => {
    const raw = await executeTool('run_command', { command: 'echo "Locus Test"' });
    const res = JSON.parse(raw);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.exitCode, 0);
    assert.strictEqual(res.stdout, 'Locus Test');
    assert.ok(res.durationMs >= 0);
  });

  it('locates code symbols across source files using find_symbol (X-2)', async () => {
    const raw = await executeTool('find_symbol', { query: 'resolveSafeWorkspacePath', kind: 'function' });
    const res = JSON.parse(raw);
    assert.strictEqual(res.ok, true);
    assert.ok(res.symbols.length > 0);
    assert.strictEqual(res.symbols[0].kind, 'function');
    assert.ok(res.symbols[0].filePath.includes('tools'));
  });

  it('redacts sensitive API keys and tokens from tool outputs (P-3)', async () => {
    const raw = await executeTool('run_command', { command: 'echo "sk-123456789012345678901234567890"' });
    const res = JSON.parse(raw);
    assert.strictEqual(res.ok, true);
    assert.ok(!res.stdout.includes('sk-123456789012345678901234567890'));
    assert.ok(res.stdout.includes('[REDACTED_SECRET]'));
  });

  it('truncates session history turns cleanly (API-6)', async () => {
    const testSessionId = 'test-trunc-session';
    await saveSession(testSessionId, 'ollama', 'llama3.2', [
      { role: 'user', content: 'Turn 1' },
      { role: 'assistant', content: 'Reply 1' },
      { role: 'user', content: 'Turn 2' },
      { role: 'assistant', content: 'Reply 2' },
    ]);

    const truncated = await truncateSession(testSessionId, 2);
    assert.ok(truncated);
    assert.strictEqual(truncated.messages.length, 2);
    assert.strictEqual(truncated.messages[1].content, 'Reply 1');

    await deleteSession(testSessionId);
  });

  it('coordinates concurrent operations safely via withSessionLock (P-6)', async () => {
    let executed = false;
    const res = await withSessionLock(async () => {
      executed = true;
      return 42;
    });
    assert.strictEqual(executed, true);
    assert.strictEqual(res, 42);
  });

  it('renames session and updates index with persistent title', async () => {
    const testSessionId = 'test-rename-' + Date.now();
    await saveSession(testSessionId, 'ollama', 'test-model', [{ role: 'user', content: 'test message' }]);
    await renameSession(testSessionId, 'Custom Renamed Title');

    const loaded = await loadSession(testSessionId);
    assert.strictEqual(loaded?.title, 'Custom Renamed Title');

    const details = await listSessionsDetail();
    const item = details.find((s) => s.id === testSessionId);
    assert.strictEqual(item?.title, 'Custom Renamed Title');

    await deleteSession(testSessionId);
  });
});
