import { describe, it } from 'node:test';
import assert from 'node:assert';
import { compactHistory, parsePseudoToolCalls, shouldProvideTools, extractContentFromHallucinatedToolJson } from '../services/agent.js';
import { getAuthPattern } from '../core/constants.js';

describe('Agent Core Intelligence & Compaction Suite', () => {
  it('correctly maps auth patterns for guarded tools', () => {
    assert.strictEqual(getAuthPattern('write_file', { filePath: 'foo.ts' }), 'write_file');
    assert.strictEqual(getAuthPattern('run_command', { command: 'npm test -- --watch' }), 'run_command:npm');
    assert.strictEqual(getAuthPattern('browser_action', { action: 'navigate' }), 'browser_action:navigate');
  });

  it('gates tool schemas for greetings and creative writing to protect small models', () => {
    assert.strictEqual(shouldProvideTools([{ role: 'user', content: 'hi' }]), false);
    assert.strictEqual(shouldProvideTools([{ role: 'user', content: 'Hello there!' }]), false);
    assert.strictEqual(shouldProvideTools([{ role: 'user', content: 'who are you?' }]), false);

    // Creative writing without file target: no tools
    assert.strictEqual(shouldProvideTools([{ role: 'user', content: 'i need to write a short story on kerala basis' }]), false);
    assert.strictEqual(shouldProvideTools([{ role: 'user', content: 'write a poem about mountains' }]), false);
    assert.strictEqual(shouldProvideTools([{ role: 'user', content: 'tell me a joke' }]), false);

    // Writing with explicit file or code targets: attach tools
    assert.strictEqual(shouldProvideTools([{ role: 'user', content: 'read src/index.tsx' }]), true);
    assert.strictEqual(shouldProvideTools([{ role: 'user', content: 'run npm test' }]), true);
    assert.strictEqual(shouldProvideTools([{ role: 'user', content: 'search for config files' }]), true);
    assert.strictEqual(shouldProvideTools([{ role: 'user', content: 'write a story and save it to story.txt' }]), true);
    assert.strictEqual(shouldProvideTools([{ role: 'user', content: 'write a script to parse data' }]), true);

    // Active tool in history keeps tools enabled
    assert.strictEqual(
      shouldProvideTools([
        { role: 'user', content: 'read file' },
        { role: 'tool', tool_call_id: '1', content: 'ok' },
        { role: 'user', content: 'thanks' },
      ]),
      true
    );
  });

  it('unwraps hallucinated tool JSON envelopes containing console.log code', () => {
    const raw = '```json\n{\n  "name": "write_code",\n  "parameters": {\n    "code": "function writeStory() {\\nconsole.log(\\\"Welcome to Kerala\\\");\\nconsole.log(\\\"Land of coconuts\\\");\\n}\\nwriteStory();"\n  }\n}\n```';
    const unwrapped = extractContentFromHallucinatedToolJson(raw);
    assert.ok(unwrapped);
    assert.ok(unwrapped.includes('Welcome to Kerala'));
    assert.ok(unwrapped.includes('Land of coconuts'));
    assert.ok(!unwrapped.includes('console.log'));
  });

  it('recovers pseudo tool calls from raw assistant strings (AG-10)', () => {
    const rawText = 'Let me read the file for you:\n{"name":"read_file","parameters":{"filePath":"package.json"}}';
    const calls = parsePseudoToolCalls(rawText);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].name, 'read_file');
    assert.strictEqual(calls[0].args.filePath, 'package.json');
  });

  it('compacts context by truncating older tool output (AG-7)', () => {
    const hugeOutput = 'A'.repeat(5000);
    const messages = [
      { role: 'system', content: 'System instructions' },
      { role: 'user', content: 'Read huge file' },
      { role: 'assistant', tool_calls: [{ id: 'c1', function: { name: 'read_file', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', name: 'read_file', content: hugeOutput },
      { role: 'assistant', content: 'Here is what I found.' },
      // 6 subsequent recent turns:
      { role: 'user', content: 'Step 1' },
      { role: 'assistant', content: 'Done 1' },
      { role: 'user', content: 'Step 2' },
      { role: 'assistant', content: 'Done 2' },
      { role: 'user', content: 'Step 3' },
      { role: 'assistant', content: 'Done 3' },
    ];

    const compacted = compactHistory(messages, 2000);
    assert.ok(compacted.length > 0);
    const toolMsg = compacted.find((m) => m.role === 'tool');
    assert.ok(toolMsg);
    assert.ok(toolMsg.content.includes('earlier tool output truncated for context limit'));
    assert.ok(toolMsg.content.length < 1500);
  });
});
