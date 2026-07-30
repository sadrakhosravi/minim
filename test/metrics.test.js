import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendMetric, readMetrics } from '../src/metrics.js';
import { handle } from '../src/hooks/posttooluse.js';

test('appendMetric writes JSONL into month file and readMetrics reads it back', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  appendMetric(root, { ts: '2026-07-30T10:00:00Z', event: 'tool', tool: 'readFile' });
  appendMetric(root, { ts: '2026-07-30T10:01:00Z', event: 'tool', tool: 'search' });
  const file = path.join(root, '.minim', 'metrics', '2026-07.jsonl');
  assert.equal(fs.readFileSync(file, 'utf8').trim().split('\n').length, 2);
  assert.equal(readMetrics(root).length, 2);
});

test('PostToolUse logs tool call with token estimates', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = await handle({
    cwd: root,
    session_id: 's1',
    timestamp: '2026-07-30T10:00:00Z',
    tool_name: 'readFile',
    tool_input: { filePath: 'src/app.js' },
    tool_output: 'x'.repeat(400),
  });
  assert.equal(out, undefined); // metrics are silent
  const [rec] = readMetrics(root);
  assert.equal(rec.tool, 'readFile');
  assert.equal(rec.outTokens, 100);
});
