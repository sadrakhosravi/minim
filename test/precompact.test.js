import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handle } from '../src/hooks/precompact.js';
import { memPath } from '../src/memory.js';

test('PreCompact snapshots transcript and extracts notes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const tp = path.join(root, 'transcript.txt');
  fs.writeFileSync(tp, 'MINIM-NOTE: compaction happened, fact persisted\n');
  await handle({
    cwd: root,
    transcript_path: tp,
    session_id: 'abc123',
    timestamp: '2026-07-30T10:00:00Z',
  });
  const snaps = fs.readdirSync(path.join(root, '.minim', 'snapshots'));
  assert.equal(snaps.length, 1);
  assert.match(snaps[0], /^abc123-/);
  assert.match(fs.readFileSync(memPath(root), 'utf8'), /fact persisted/);
});

test('PreCompact with no transcript is a no-op', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = await handle({ cwd: root });
  assert.equal(out, undefined);
  assert.equal(fs.existsSync(path.join(root, '.minim', 'snapshots')), false);
});
