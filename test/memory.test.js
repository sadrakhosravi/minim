import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendFacts, memPath } from '../src/memory.js';

test('appends facts as dated lines, creating dirs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const n = appendFacts(root, ['fact one', 'fact two'], '2026-07-30');
  assert.equal(n, 2);
  const body = fs.readFileSync(memPath(root), 'utf8');
  assert.equal(body, '- [2026-07-30] fact one\n- [2026-07-30] fact two\n');
});

test('dedupes against existing file content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  appendFacts(root, ['fact one'], '2026-07-29');
  const n = appendFacts(root, ['fact one', 'fact two'], '2026-07-30');
  assert.equal(n, 1);
  const body = fs.readFileSync(memPath(root), 'utf8');
  assert.equal(body, '- [2026-07-29] fact one\n- [2026-07-30] fact two\n');
});
