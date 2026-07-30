import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handle as stopHandle } from '../src/hooks/stop.js';
import { handle as promptHandle } from '../src/hooks/userprompt.js';
import { memPath } from '../src/memory.js';

test('Stop extracts notes from transcript into memory', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const tp = path.join(root, 'transcript.txt');
  fs.writeFileSync(tp, 'chat chat\nMINIM-NOTE: retries capped at 3\n');
  const out = await stopHandle({
    cwd: root,
    transcript_path: tp,
    timestamp: '2026-07-30T10:00:00Z',
  });
  assert.match(fs.readFileSync(memPath(root), 'utf8'), /retries capped at 3/);
  assert.match(out.systemMessage, /1 fact/);
});

test('Stop with no transcript is a no-op', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = await stopHandle({ cwd: root, timestamp: '2026-07-30T10:00:00Z' });
  assert.equal(out, undefined);
});

test('UserPromptSubmit captures #remember text', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = await promptHandle({
    cwd: root,
    prompt: 'fix the bug #remember payments API is v2 only',
    timestamp: '2026-07-30T10:00:00Z',
  });
  assert.match(fs.readFileSync(memPath(root), 'utf8'), /payments API is v2 only/);
  assert.match(out.systemMessage, /minim remember/);
});

test('UserPromptSubmit without marker is a no-op', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = await promptHandle({ cwd: root, prompt: 'just fix it' });
  assert.equal(out, undefined);
  assert.equal(fs.existsSync(memPath(root)), false);
});
