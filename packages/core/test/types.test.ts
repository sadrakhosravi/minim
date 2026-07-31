import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pick } from '../src/types.ts';

test('pick returns the first defined key', () => {
  assert.equal(pick<string>({ tool_name: 'read' }, 'tool_name', 'toolName'), 'read');
  assert.equal(pick<string>({ toolName: 'read' }, 'tool_name', 'toolName'), 'read');
});

test('pick prefers the earlier name when both are present', () => {
  assert.equal(pick<string>({ tool_name: 'a', toolName: 'b' }, 'tool_name', 'toolName'), 'a');
});

test('pick returns undefined for missing keys and non-objects', () => {
  assert.equal(pick<string>({}, 'tool_name', 'toolName'), undefined);
  assert.equal(pick<string>(null, 'tool_name'), undefined);
  assert.equal(pick<string>('a string', 'tool_name'), undefined);
  assert.equal(pick<string>(42, 'tool_name'), undefined);
});

test('pick treats an explicit undefined value as absent', () => {
  assert.equal(pick<string>({ tool_name: undefined, toolName: 'b' }, 'tool_name', 'toolName'), 'b');
});
