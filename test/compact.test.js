import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendFacts, compactMemory, memPath } from '../src/memory.js';

test('moves entries older than maxAgeDays to archive', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  appendFacts(root, ['ancient fact'], '2026-01-01');
  appendFacts(root, ['recent fact'], '2026-07-25');
  const r = compactMemory(root, 45, '2026-07-30');
  assert.equal(r.archived, 1);
  assert.equal(r.kept, 1);
  const mem = fs.readFileSync(memPath(root), 'utf8');
  assert.match(mem, /recent fact/);
  assert.doesNotMatch(mem, /ancient fact/);
  const archive = fs.readFileSync(path.join(root, '.minim', 'archive', '2026-07.md'), 'utf8');
  assert.match(archive, /ancient fact/);
});

test('no memory file is a no-op', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  assert.deepEqual(compactMemory(root, 45, '2026-07-30'), { kept: 0, archived: 0 });
});
