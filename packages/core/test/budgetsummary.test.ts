import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTokens, summarizeBudget } from '../src/budgetsummary.ts';

test('empty report totals zero and is not over', () => {
  assert.deepEqual(summarizeBudget([]), { tokens: 0, cap: 0, over: false, overFiles: [] });
});

test('totals tokens and caps across tiers', () => {
  const s = summarizeBudget([
    { path: '/r/.github/copilot-instructions.md', tokens: 1200, cap: 1500, over: false },
    { path: '/r/.github/instructions/a.instructions.md', tokens: 400, cap: 800, over: false },
  ]);
  assert.equal(s.tokens, 1600);
  assert.equal(s.cap, 2300);
  assert.equal(s.over, false);
  assert.deepEqual(s.overFiles, []);
});

test('any over-budget file marks the summary over and is listed by basename', () => {
  const s = summarizeBudget([
    { path: '/r/.github/copilot-instructions.md', tokens: 1800, cap: 1500, over: true },
    { path: '/r/.github/instructions/a.instructions.md', tokens: 400, cap: 800, over: false },
  ]);
  assert.equal(s.over, true);
  assert.deepEqual(s.overFiles, ['copilot-instructions.md']);
});

test('formatTokens abbreviates thousands and leaves small values alone', () => {
  assert.equal(formatTokens(0), '0');
  assert.equal(formatTokens(999), '999');
  assert.equal(formatTokens(1000), '1.0k');
  assert.equal(formatTokens(1234), '1.2k');
  assert.equal(formatTokens(23000), '23.0k');
});
