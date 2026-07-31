import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendMetric, readMetrics } from '../src/metrics.ts';

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
}

test('appendMetric writes JSONL into a month file and readMetrics reads it back', () => {
  const root = tmpRepo();
  appendMetric(root, { ts: '2026-07-30T10:00:00Z', event: 'tool', tool: 'readFile' });
  appendMetric(root, { ts: '2026-07-30T10:01:00Z', event: 'tool', tool: 'search' });
  const file = path.join(root, '.minim', 'metrics', '2026-07.jsonl');
  assert.equal(fs.readFileSync(file, 'utf8').trim().split('\n').length, 2);
  assert.equal(readMetrics(root).length, 2);
});

test('records split across month files and read back sorted', () => {
  const root = tmpRepo();
  appendMetric(root, { ts: '2026-08-01T00:00:00Z', event: 'tool', tool: 'b' });
  appendMetric(root, { ts: '2026-07-01T00:00:00Z', event: 'tool', tool: 'a' });
  const recs = readMetrics(root);
  assert.equal(recs.length, 2);
  assert.equal(recs[0].tool, 'a');
});

test('corrupt lines are skipped, not fatal', () => {
  const root = tmpRepo();
  const dir = path.join(root, '.minim', 'metrics');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '2026-07.jsonl'), '{"ts":"a"}\nnot-json\n{"ts":"b"}\n');
  assert.equal(readMetrics(root).length, 2);
});

test('missing metrics dir yields empty array', () => {
  assert.deepEqual(readMetrics(tmpRepo()), []);
});
