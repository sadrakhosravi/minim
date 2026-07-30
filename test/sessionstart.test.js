import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handle } from '../src/hooks/sessionstart.js';
import { TIER0_CAP } from '../src/budget.js';

test('no warning when budgets ok', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = await handle({ cwd: root });
  assert.equal(out, undefined);
});

test('systemMessage names oversized files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  fs.mkdirSync(path.join(root, '.github'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.github', 'copilot-instructions.md'),
    'x'.repeat((TIER0_CAP + 1) * 4)
  );
  const out = await handle({ cwd: root });
  assert.match(out.systemMessage, /copilot-instructions\.md/);
  assert.match(out.systemMessage, /over budget/);
});
