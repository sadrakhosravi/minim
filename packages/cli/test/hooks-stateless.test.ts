import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIER0_CAP } from '../../core/src/budget.ts';
import { memPath } from '../../core/src/memory.ts';
import type { HookOutput } from '../../core/src/types.ts';

const CLI = fileURLToPath(new URL('../bin/minim.js', import.meta.url));

function hook(event: string, payload: unknown): HookOutput {
  const out = execFileSync(process.execPath, [CLI, 'hook', event], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  return JSON.parse(out) as HookOutput;
}

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
}

test('SessionStart stays quiet when budgets are fine', () => {
  const out = hook('SessionStart', { cwd: tmpRepo(), timestamp: '2026-07-31T10:00:00Z' });
  assert.deepEqual(out, { continue: true });
});

test('SessionStart names oversized files', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.github'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.github', 'copilot-instructions.md'),
    'x'.repeat((TIER0_CAP + 1) * 4)
  );
  const out = hook('SessionStart', { cwd: root, timestamp: '2026-07-31T10:00:00Z' });
  assert.match(out.systemMessage ?? '', /copilot-instructions\.md/);
  assert.match(out.systemMessage ?? '', /over budget/);
});

test('UserPromptSubmit captures #remember text', () => {
  const root = tmpRepo();
  const out = hook('UserPromptSubmit', {
    cwd: root,
    prompt: 'fix the bug #remember payments API is v2 only',
    timestamp: '2026-07-31T10:00:00Z',
  });
  assert.match(fs.readFileSync(memPath(root), 'utf8'), /- \[2026-07-31\] payments API is v2 only/);
  assert.match(out.systemMessage ?? '', /minim remember/);
});

test('UserPromptSubmit without the marker is a no-op', () => {
  const root = tmpRepo();
  const out = hook('UserPromptSubmit', {
    cwd: root,
    prompt: 'just fix it',
    timestamp: '2026-07-31T10:00:00Z',
  });
  assert.deepEqual(out, { continue: true });
  assert.equal(fs.existsSync(memPath(root)), false);
});

test('UserPromptSubmit with a bare marker and no text is a no-op', () => {
  const root = tmpRepo();
  hook('UserPromptSubmit', {
    cwd: root,
    prompt: 'do it #remember  ',
    timestamp: '2026-07-31T10:00:00Z',
  });
  assert.equal(fs.existsSync(memPath(root)), false);
});

test('PreToolUse flags node_modules with the ask decision', () => {
  const out = hook('PreToolUse', {
    cwd: tmpRepo(),
    timestamp: '2026-07-31T10:00:00Z',
    tool_name: 'readFile',
    tool_input: { filePath: 'node_modules/lodash/index.js' },
  });
  assert.equal(out.hookSpecificOutput?.permissionDecision, 'ask');
  assert.match(out.hookSpecificOutput?.permissionDecisionReason ?? '', /node_modules/);
});

test('PreToolUse passes clean input untouched', () => {
  const out = hook('PreToolUse', {
    cwd: tmpRepo(),
    timestamp: '2026-07-31T10:00:00Z',
    tool_name: 'readFile',
    tool_input: { filePath: 'src/app.js' },
  });
  assert.deepEqual(out, { continue: true });
});

test('PreToolUse honors a config escalation to deny', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.minim'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.minim', 'config.json'),
    JSON.stringify({ guard: { decision: 'deny' } })
  );
  const out = hook('PreToolUse', {
    cwd: root,
    timestamp: '2026-07-31T10:00:00Z',
    tool_name: 'readFile',
    tool_input: { filePath: 'dist/bundle.min.js' },
  });
  assert.equal(out.hookSpecificOutput?.permissionDecision, 'deny');
});

test('PreToolUse accepts camelCase toolInput', () => {
  const out = hook('PreToolUse', {
    cwd: tmpRepo(),
    timestamp: '2026-07-31T10:00:00Z',
    toolName: 'readFile',
    toolInput: { filePath: 'node_modules/x/index.js' },
  });
  assert.equal(out.hookSpecificOutput?.permissionDecision, 'ask');
});
