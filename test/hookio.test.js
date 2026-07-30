import { test } from 'node:test';
import assert from 'node:assert/strict';
import { field } from '../src/hookio.js';

test('field returns first defined key', () => {
  assert.equal(field({ tool_name: 'read' }, 'tool_name', 'toolName'), 'read');
  assert.equal(field({ toolName: 'read' }, 'tool_name', 'toolName'), 'read');
  assert.equal(field({}, 'tool_name', 'toolName'), undefined);
  assert.equal(field(null, 'tool_name', 'toolName'), undefined);
});
