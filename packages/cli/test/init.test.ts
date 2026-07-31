import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/minim.js', import.meta.url));

test('minim init installs a working config pack whose vendored runtime runs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = execFileSync(process.execPath, [CLI, 'init'], { cwd: root, encoding: 'utf8' });
  assert.match(out, /minim init done/);

  // The hooks file must reference the vendored path, and that path must execute.
  const hooks = JSON.parse(
    fs.readFileSync(path.join(root, '.github', 'hooks', 'minim.json'), 'utf8')
  ) as { hooks: Record<string, Array<{ command: string }>> };
  assert.match(hooks.hooks.PreToolUse[0].command, /\.minim\/runtime\/bin\/minim\.js/);

  const vendored = path.join(root, '.minim', 'runtime', 'bin', 'minim.js');
  const res = execFileSync(process.execPath, [vendored, 'hook', 'PreToolUse'], {
    cwd: root,
    input: JSON.stringify({
      cwd: root,
      timestamp: '2026-07-31T10:00:00Z',
      tool_name: 'readFile',
      tool_input: { filePath: 'node_modules/x/index.js' },
    }),
    encoding: 'utf8',
  });
  assert.equal(JSON.parse(res).hookSpecificOutput.permissionDecision, 'ask');
});

test('the installed tier 0 block stays under the budget cap', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  execFileSync(process.execPath, [CLI, 'init'], { cwd: root, encoding: 'utf8' });
  const out = execFileSync(process.execPath, [CLI, 'budget'], { cwd: root, encoding: 'utf8' });
  assert.doesNotMatch(out, /OVER/);
});
