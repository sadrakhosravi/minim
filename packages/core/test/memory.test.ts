import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendFacts, compactMemory, memPath } from '../src/memory.ts';

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
}

test('appends facts as dated lines, creating dirs', () => {
  const root = tmpRepo();
  const n = appendFacts(root, ['fact one', 'fact two'], '2026-07-30');
  assert.equal(n, 2);
  assert.equal(
    fs.readFileSync(memPath(root), 'utf8'),
    '- [2026-07-30] fact one\n- [2026-07-30] fact two\n'
  );
});

test('dedupes against existing file content', () => {
  const root = tmpRepo();
  appendFacts(root, ['fact one'], '2026-07-29');
  const n = appendFacts(root, ['fact one', 'fact two'], '2026-07-30');
  assert.equal(n, 1);
  assert.equal(
    fs.readFileSync(memPath(root), 'utf8'),
    '- [2026-07-29] fact one\n- [2026-07-30] fact two\n'
  );
});

test('empty fact list writes nothing', () => {
  const root = tmpRepo();
  assert.equal(appendFacts(root, [], '2026-07-30'), 0);
  assert.equal(fs.existsSync(memPath(root)), false);
});

test('moves entries older than maxAgeDays to archive', () => {
  const root = tmpRepo();
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
  assert.deepEqual(compactMemory(tmpRepo(), 45, '2026-07-30'), { kept: 0, archived: 0 });
});
