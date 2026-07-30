import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkBudgets, TIER0_CAP, TIER1_CAP } from '../src/budget.js';

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
}

test('missing files produce empty report', () => {
  assert.deepEqual(checkBudgets(tmpRepo()), []);
});

test('tier 0 under cap reports over:false', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.github'), { recursive: true });
  fs.writeFileSync(path.join(root, '.github', 'copilot-instructions.md'), 'short file');
  const report = checkBudgets(root);
  assert.equal(report.length, 1);
  assert.equal(report[0].cap, TIER0_CAP);
  assert.equal(report[0].over, false);
});

test('oversized tier 1 file reports over:true', () => {
  const root = tmpRepo();
  const dir = path.join(root, '.github', 'instructions');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'big.instructions.md'), 'x'.repeat((TIER1_CAP + 1) * 4));
  const report = checkBudgets(root);
  assert.equal(report.length, 1);
  assert.equal(report[0].cap, TIER1_CAP);
  assert.equal(report[0].over, true);
});
