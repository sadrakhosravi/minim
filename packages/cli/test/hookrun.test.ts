import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/minim.js', import.meta.url));

export function runCli(args: string[], input = ''): string {
  return execFileSync(process.execPath, [CLI, ...args], { input, encoding: 'utf8' });
}

test('unknown hook event responds with continue:true and exits 0', () => {
  const out = runCli(['hook', 'Nope'], JSON.stringify({ hook_event_name: 'Nope' }));
  assert.deepEqual(JSON.parse(out), { continue: true });
});

test('malformed stdin JSON still responds with continue:true', () => {
  const out = runCli(['hook', 'SessionStart'], 'not-json');
  assert.equal(JSON.parse(out).continue, true);
});

test('empty stdin still responds with continue:true', () => {
  const out = runCli(['hook', 'SessionStart'], '');
  assert.equal(JSON.parse(out).continue, true);
});

test('MINIM_DEBUG dumps the payload without breaking the response', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const payload = { hook_event_name: 'Nope', cwd: root, timestamp: '2026-07-31T10:00:00Z' };
  const out = execFileSync(process.execPath, [CLI, 'hook', 'Nope'], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, MINIM_DEBUG: '1' },
  });
  assert.equal(JSON.parse(out).continue, true);
  const dumps = fs.readdirSync(path.join(root, '.minim', 'debug'));
  assert.equal(dumps.length, 1);
  assert.match(dumps[0], /-Nope\.json$/);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, '.minim', 'debug', dumps[0]), 'utf8')).cwd,
    root
  );
});

test('unknown command exits non-zero', () => {
  assert.throws(() => runCli(['nonsense']));
});
