import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPack } from '../src/pack.js';
import { appendFacts } from '../src/memory.js';

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'auth.js'), 'export function login() {}\n');
  return root;
}

test('pack includes task, files, and scope rule', () => {
  const root = repo();
  const { md, tokens } = buildPack({ task: 'fix login bug', files: ['src/auth.js'], root });
  assert.match(md, /^---\nmode: agent\n---/);
  assert.match(md, /fix login bug/);
  assert.match(md, /## src\/auth\.js/);
  assert.match(md, /export function login/);
  assert.match(md, /Work only within the files above/);
  assert.ok(tokens > 0);
});

test('pack pulls in memory lines matching task words', () => {
  const root = repo();
  appendFacts(root, ['login uses OAuth device flow', 'db is postgres'], '2026-07-01');
  const { md } = buildPack({ task: 'fix login bug', files: ['src/auth.js'], root });
  assert.match(md, /OAuth device flow/);
  assert.doesNotMatch(md, /postgres/);
});

test('long files are truncated at maxLinesPerFile', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'src', 'big.js'), Array(500).fill('line();').join('\n'));
  const { md } = buildPack({ task: 't', files: ['src/big.js'], root, maxLinesPerFile: 100 });
  assert.match(md, /\[truncated 400 lines\]/);
});
