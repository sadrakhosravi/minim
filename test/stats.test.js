import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { summarize } from '../src/cli/stats.js';

test('summarize aggregates sessions and tool calls', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const dir = path.join(root, '.minim', 'metrics');
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    { ts: '2026-07-30T10:00:00Z', session: 's1', event: 'tool', tool: 'readFile', inTokens: 5, outTokens: 100 },
    { ts: '2026-07-30T10:05:00Z', session: 's1', event: 'session_end', transcriptTokens: 5000, factsSaved: 2 },
    { ts: '2026-07-30T11:00:00Z', session: 's2', event: 'session_end', transcriptTokens: 3000, factsSaved: 0 },
  ];
  fs.writeFileSync(path.join(dir, '2026-07.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const s = summarize(root);
  assert.equal(s.sessions, 2);
  assert.equal(s.totalTranscriptTokens, 8000);
  assert.equal(s.avgTranscriptTokens, 4000);
  assert.equal(s.toolCalls.readFile, 1);
  assert.equal(s.factsSaved, 2);
});
