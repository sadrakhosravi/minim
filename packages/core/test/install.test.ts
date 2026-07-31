import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { install } from '../src/install.ts';

function fixtureAssets(): { templatesDir: string; runtimeDir: string } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-assets-'));
  const templatesDir = path.join(base, 'templates');
  const runtimeDir = path.join(base, 'runtime');
  fs.mkdirSync(templatesDir, { recursive: true });
  fs.mkdirSync(path.join(runtimeDir, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(runtimeDir, 'dist'), { recursive: true });
  fs.mkdirSync(path.join(runtimeDir, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(templatesDir, 'copilot-instructions.md'),
    '<!-- minim:begin -->\nmanaged\n<!-- minim:end -->\n'
  );
  fs.writeFileSync(path.join(templatesDir, 'hooks.json'), '{"hooks":{}}\n');
  fs.writeFileSync(path.join(templatesDir, 'example.instructions.md'), 'example\n');
  fs.writeFileSync(path.join(templatesDir, 'settings.json'), '{"search.exclude":{}}\n');
  fs.writeFileSync(path.join(runtimeDir, 'bin', 'minim.js'), '#!/usr/bin/env node\n');
  fs.writeFileSync(path.join(runtimeDir, 'dist', 'minim.js'), 'console.log(1);\n');
  fs.writeFileSync(path.join(runtimeDir, 'src', 'should-not-be-vendored.ts'), 'export {};\n');
  return { templatesDir, runtimeDir };
}

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
}

test('fresh install writes every artifact', () => {
  const root = tmpRepo();
  const log = install(root, fixtureAssets());
  assert.ok(fs.existsSync(path.join(root, '.github', 'copilot-instructions.md')));
  assert.ok(fs.existsSync(path.join(root, '.github', 'hooks', 'minim.json')));
  assert.ok(fs.existsSync(path.join(root, '.github', 'instructions', 'example.instructions.md')));
  assert.ok(fs.existsSync(path.join(root, '.minim', 'config.json')));
  assert.ok(fs.existsSync(path.join(root, '.vscode', 'settings.json')));
  assert.ok(log.some((l) => l.startsWith('write ')));
});

test('vendors the compiled runtime, not sources', () => {
  const root = tmpRepo();
  install(root, fixtureAssets());
  assert.ok(fs.existsSync(path.join(root, '.minim', 'runtime', 'bin', 'minim.js')));
  assert.ok(fs.existsSync(path.join(root, '.minim', 'runtime', 'dist', 'minim.js')));
  assert.equal(fs.existsSync(path.join(root, '.minim', 'runtime', 'src')), false);
});

test('re-running replaces the vendored runtime and leaves config alone', () => {
  const root = tmpRepo();
  const assets = fixtureAssets();
  install(root, assets);
  fs.writeFileSync(path.join(root, '.minim', 'config.json'), '{"custom":true}');
  fs.writeFileSync(path.join(root, '.minim', 'runtime', 'stale.js'), 'old');
  install(root, assets);
  assert.equal(fs.existsSync(path.join(root, '.minim', 'runtime', 'stale.js')), false);
  assert.match(fs.readFileSync(path.join(root, '.minim', 'config.json'), 'utf8'), /custom/);
});

test('appends the managed block to an existing tier 0 file', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.github'), { recursive: true });
  fs.writeFileSync(path.join(root, '.github', 'copilot-instructions.md'), '# House rules\n');
  const log = install(root, fixtureAssets());
  const body = fs.readFileSync(path.join(root, '.github', 'copilot-instructions.md'), 'utf8');
  assert.match(body, /# House rules/);
  assert.match(body, /minim:begin/);
  assert.ok(log.some((l) => l.includes('managed block')));
});

test('does not append the managed block twice', () => {
  const root = tmpRepo();
  const assets = fixtureAssets();
  install(root, assets);
  install(root, assets);
  const body = fs.readFileSync(path.join(root, '.github', 'copilot-instructions.md'), 'utf8');
  assert.equal(body.match(/minim:begin/g)?.length, 1);
});

test('never overwrites an existing .vscode/settings.json, suggests instead', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.vscode'), { recursive: true });
  fs.writeFileSync(path.join(root, '.vscode', 'settings.json'), '{ /* JSONC */ }');
  install(root, fixtureAssets());
  assert.match(fs.readFileSync(path.join(root, '.vscode', 'settings.json'), 'utf8'), /JSONC/);
  assert.ok(fs.existsSync(path.join(root, '.minim', 'suggested-settings.json')));
});

test('adds gitignore entries once', () => {
  const root = tmpRepo();
  const assets = fixtureAssets();
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/');
  install(root, assets);
  install(root, assets);
  const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.equal(gi.match(/\.minim\/metrics\//g)?.length, 1);
  assert.match(gi, /node_modules\//);
});
