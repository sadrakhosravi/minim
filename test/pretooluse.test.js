import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handle } from '../src/hooks/pretooluse.js';

test('flags tool input touching node_modules with ask decision', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = await handle({
    cwd: root,
    tool_name: 'readFile',
    tool_input: { filePath: 'node_modules/lodash/index.js' },
  });
  assert.equal(out.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /node_modules/);
});

test('clean tool input passes untouched', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = await handle({
    cwd: root,
    tool_name: 'readFile',
    tool_input: { filePath: 'src/app.js' },
  });
  assert.equal(out, undefined);
});

test('config can escalate decision to deny', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  fs.mkdirSync(path.join(root, '.minim'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.minim', 'config.json'),
    JSON.stringify({ guard: { decision: 'deny' } })
  );
  const out = await handle({
    cwd: root,
    tool_name: 'readFile',
    tool_input: { filePath: 'dist/bundle.min.js' },
  });
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
});
