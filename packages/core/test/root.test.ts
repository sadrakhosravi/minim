import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoot } from '../src/root.ts';

test('no folders yields undefined', () => {
  assert.equal(resolveRoot([], '/a/b/file.ts'), undefined);
  assert.equal(resolveRoot([]), undefined);
});

test('single folder is always the answer', () => {
  assert.equal(resolveRoot(['/repo'], '/repo/src/a.ts'), '/repo');
  assert.equal(resolveRoot(['/repo']), '/repo');
});

test('picks the folder containing the active file', () => {
  assert.equal(resolveRoot(['/a', '/b'], '/b/src/x.ts'), '/b');
});

test('picks the most specific folder when they nest', () => {
  assert.equal(
    resolveRoot(['/repo', '/repo/packages/core'], '/repo/packages/core/src/x.ts'),
    '/repo/packages/core'
  );
});

test('falls back to the first folder when the active file is outside all of them', () => {
  assert.equal(resolveRoot(['/a', '/b'], '/elsewhere/x.ts'), '/a');
});

test('falls back to the first folder when there is no active file', () => {
  assert.equal(resolveRoot(['/a', '/b']), '/a');
});

test('does not match a folder that is only a string prefix of the path', () => {
  assert.equal(resolveRoot(['/repo-other', '/repo'], '/repo/src/x.ts'), '/repo');
});
