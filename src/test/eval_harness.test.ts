import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import { executeTool } from '../services/tools.js';

interface EvalTask {
  id: string;
  name: string;
  run: () => Promise<boolean>;
}

describe('Locus Eval Harness (I-1)', () => {
  const fixtureDir = path.resolve(process.cwd(), 'eval-fixture');

  before(async () => {
    await fs.mkdir(fixtureDir, { recursive: true });
    await fs.writeFile(path.join(fixtureDir, 'README.md'), '# Eval Fixture Project\nVersion 1.0.0', 'utf-8');
    await fs.writeFile(path.join(fixtureDir, 'index.js'), 'function add(a, b) { return a - b; }\nmodule.exports = { add };', 'utf-8');
  });

  after(async () => {
    try {
      await fs.rm(fixtureDir, { recursive: true, force: true });
    } catch {}
  });

  it('runs scripted task harness and outputs pass-rate', async () => {
    const tasks: EvalTask[] = [
      {
        id: 'TASK-1',
        name: 'Workspace Search Verification',
        run: async () => {
          const raw = await executeTool('search_workspace', { query: 'eval-fixture' });
          const res = JSON.parse(raw);
          return res.ok && res.workspaceFiles.some((f: string) => f.includes('eval-fixture'));
        },
      },
      {
        id: 'TASK-2',
        name: 'Surgical Diff Fix Verification',
        run: async () => {
          // Bug in fixture: add(a, b) returns a - b instead of a + b. Fix it using edit_file!
          const editRaw = await executeTool('edit_file', {
            filePath: path.join('eval-fixture', 'index.js'),
            targetContent: 'return a - b;',
            replacementContent: 'return a + b;',
          });
          const editRes = JSON.parse(editRaw);
          if (!editRes.ok) return false;

          const readRaw = await executeTool('read_file', {
            filePath: path.join('eval-fixture', 'index.js'),
          });
          const readRes = JSON.parse(readRaw);
          return readRes.content.includes('return a + b;');
        },
      },
      {
        id: 'TASK-3',
        name: 'Command Execution Verification',
        run: async () => {
          const raw = await executeTool('run_command', { command: 'node -e "process.stdout.write(\'eval-ok\')"' });
          const res = JSON.parse(raw);
          return res.ok && res.stdout === 'eval-ok';
        },
      },
    ];

    let passed = 0;
    for (const task of tasks) {
      const ok = await task.run();
      if (ok) passed++;
    }

    const passRate = (passed / tasks.length) * 100;
    console.log(`\n  Eval Harness Result: ${passed}/${tasks.length} tasks passed (${passRate}%)\n`);

    assert.strictEqual(passed, tasks.length, `Expected 100% pass rate, got ${passRate}%`);
  });
});
