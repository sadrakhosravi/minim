import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendFacts } from '../src/memory.ts';
import { searchMemory } from '../src/search.ts';

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
}

test('no memory file yields no hits', () => {
  assert.deepEqual(searchMemory(tmpRepo(), 'login'), { hits: [], truncated: 0 });
});

test('matches lines containing any query word longer than three chars', () => {
  const root = tmpRepo();
  appendFacts(root, ['login uses OAuth device flow', 'db is postgres'], '2026-07-01');
  const r = searchMemory(root, 'fix login bug');
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].fact, 'login uses OAuth device flow');
  assert.equal(r.hits[0].date, '2026-07-01');
  assert.equal(r.truncated, 0);
});

test('query of only short words matches nothing', () => {
  const root = tmpRepo();
  appendFacts(root, ['login uses OAuth device flow'], '2026-07-01');
  assert.deepEqual(searchMemory(root, 'is a of'), { hits: [], truncated: 0 });
});

test('limit caps hit count and reports the remainder', () => {
  const root = tmpRepo();
  appendFacts(
    root,
    Array.from({ length: 10 }, (_, i) => `payments fact number ${i}`),
    '2026-07-01'
  );
  const r = searchMemory(root, 'payments', { limit: 3 });
  assert.equal(r.hits.length, 3);
  assert.equal(r.truncated, 7);
});

test('token cap trims hits and reports the remainder', () => {
  const root = tmpRepo();
  // Each fact is ~40 chars => ~10 tokens per line.
  appendFacts(
    root,
    Array.from({ length: 10 }, (_, i) => `payments detail ${i} ${'x'.repeat(20)}`),
    '2026-07-01'
  );
  const r = searchMemory(root, 'payments', { limit: 100, maxTokens: 30 });
  assert.ok(r.hits.length > 0, 'expected at least one hit under the cap');
  assert.ok(r.hits.length < 10, 'expected the token cap to trim hits');
  assert.equal(r.hits.length + r.truncated, 10);
});

test('Infinity caps return everything', () => {
  const root = tmpRepo();
  appendFacts(
    root,
    Array.from({ length: 30 }, (_, i) => `payments fact ${i}`),
    '2026-07-01'
  );
  const r = searchMemory(root, 'payments', { limit: Infinity, maxTokens: Infinity });
  assert.equal(r.hits.length, 30);
  assert.equal(r.truncated, 0);
});
