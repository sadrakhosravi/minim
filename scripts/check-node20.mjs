// Runs the compiled bundle and asserts the hook contract holds. Must pass on
// Node 20, where TypeScript tests cannot run at all.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../packages/cli/bin/minim.js', import.meta.url));

function hook(event, payload) {
  const out = execFileSync(process.execPath, [CLI, 'hook', event], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

const root = mkdtempSync(path.join(tmpdir(), 'minim-node20-'));

// 1. Unknown events are inert.
assert.deepEqual(hook('Nope', { hook_event_name: 'Nope' }), { continue: true });

// 2. The guard fires.
const guarded = hook('PreToolUse', {
  cwd: root,
  timestamp: '2026-07-31T10:00:00Z',
  tool_name: 'readFile',
  tool_input: { filePath: 'node_modules/x/index.js' },
});
assert.equal(guarded.hookSpecificOutput.permissionDecision, 'ask');

// 3. Transcript scraping writes memory.
const tp = path.join(root, 'transcript.txt');
writeFileSync(tp, 'MINIM-NOTE: node 20 path works\n');
const stopped = hook('Stop', {
  cwd: root,
  transcript_path: tp,
  session_id: 's1',
  timestamp: '2026-07-31T10:00:00Z',
});
assert.match(stopped.systemMessage, /1 fact/);

// 4. Commands run.
mkdirSync(path.join(root, '.github'), { recursive: true });
writeFileSync(path.join(root, '.github', 'copilot-instructions.md'), 'small\n');
const budget = execFileSync(process.execPath, [CLI, 'budget'], { cwd: root, encoding: 'utf8' });
assert.match(budget, /ok\s+\d+\/1500/);

console.log(`node ${process.versions.node}: compiled bundle contract OK`);
