import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../src/cli/init.js';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('init installs config pack and vendors runtime', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  install(root, pkgRoot);
  for (const f of [
    '.github/copilot-instructions.md',
    '.github/hooks/minim.json',
    '.github/instructions/example.instructions.md',
    '.minim/config.json',
    '.minim/runtime/bin/minim.js',
    '.minim/runtime/src/hookrun.js',
    '.vscode/settings.json',
    '.gitignore',
  ]) {
    assert.ok(fs.existsSync(path.join(root, f)), `missing ${f}`);
  }
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /\.minim\/metrics\//);
});

test('init appends managed block to existing copilot-instructions.md without duplicating', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  fs.mkdirSync(path.join(root, '.github'), { recursive: true });
  fs.writeFileSync(path.join(root, '.github', 'copilot-instructions.md'), '# Existing team rules\n');
  install(root, pkgRoot);
  install(root, pkgRoot); // idempotent
  const body = fs.readFileSync(path.join(root, '.github', 'copilot-instructions.md'), 'utf8');
  assert.match(body, /# Existing team rules/);
  assert.equal(body.match(/minim:begin/g).length, 1);
});

test('init leaves existing .vscode/settings.json alone and writes suggestion instead', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  fs.mkdirSync(path.join(root, '.vscode'), { recursive: true });
  fs.writeFileSync(path.join(root, '.vscode', 'settings.json'), '{"editor.tabSize":2}');
  install(root, pkgRoot);
  assert.equal(fs.readFileSync(path.join(root, '.vscode', 'settings.json'), 'utf8'), '{"editor.tabSize":2}');
  assert.ok(fs.existsSync(path.join(root, '.minim', 'suggested-settings.json')));
});
