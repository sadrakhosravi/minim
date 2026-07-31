import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.ts';

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
}

test('missing config returns defaults', () => {
  const c = loadConfig(tmpRepo());
  assert.equal(c.guard.decision, 'ask');
  assert.equal(c.memory.maxAgeDays, 45);
  assert.equal(c.pack.maxTokens, 20000);
  assert.equal(c.pack.maxLinesPerFile, 400);
  assert.ok(c.guard.denyPatterns.includes('node_modules/'));
});

test('malformed config falls back to defaults', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.minim'), { recursive: true });
  fs.writeFileSync(path.join(root, '.minim', 'config.json'), '{ not json');
  assert.equal(loadConfig(root).memory.maxAgeDays, 45);
});

test('user config overrides per section without dropping siblings', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.minim'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.minim', 'config.json'),
    JSON.stringify({ guard: { decision: 'deny' }, memory: { maxAgeDays: 10 } })
  );
  const c = loadConfig(root);
  assert.equal(c.guard.decision, 'deny');
  assert.equal(c.memory.maxAgeDays, 10);
  assert.ok(c.guard.denyPatterns.includes('dist/'));
  assert.equal(c.pack.maxTokens, 20000);
});
