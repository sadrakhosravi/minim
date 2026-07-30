import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

function runHook(event, stdin) {
  return execFileSync('node', ['bin/minim.js', 'hook', event], {
    input: stdin,
    encoding: 'utf8',
  });
}

test('unknown hook event responds with continue:true and exits 0', () => {
  const out = runHook('Nope', '{"hook_event_name":"Nope"}');
  assert.deepEqual(JSON.parse(out), { continue: true });
});

test('malformed stdin JSON still responds with continue:true', () => {
  const out = runHook('SessionStart', 'not-json');
  assert.equal(JSON.parse(out).continue, true);
});
