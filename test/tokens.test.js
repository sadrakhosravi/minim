import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens } from '../src/tokens.js';

test('empty string is 0 tokens', () => {
  assert.equal(estimateTokens(''), 0);
});

test('4 chars is 1 token', () => {
  assert.equal(estimateTokens('abcd'), 1);
});

test('5 chars rounds up to 2 tokens', () => {
  assert.equal(estimateTokens('abcde'), 2);
});

test('non-string input is 0 tokens', () => {
  assert.equal(estimateTokens(null), 0);
  assert.equal(estimateTokens(undefined), 0);
  assert.equal(estimateTokens(42), 0);
});
