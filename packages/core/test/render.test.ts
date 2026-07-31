import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSearchResult } from '../src/render.ts';

test('no hits states plainly that nothing is recorded', () => {
  const out = renderSearchResult({ hits: [], truncated: 0 }, 'login');
  assert.match(out, /No recorded decisions match "login"/);
  assert.doesNotMatch(out, /truncated/i);
});

test('hits are rendered one per line with their dates', () => {
  const out = renderSearchResult(
    {
      hits: [
        {
          date: '2026-07-01',
          fact: 'login uses OAuth device flow',
          line: '- [2026-07-01] login uses OAuth device flow',
        },
        { date: '', fact: 'undated note', line: '- undated note' },
      ],
      truncated: 0,
    },
    'login'
  );
  assert.match(out, /2026-07-01/);
  assert.match(out, /login uses OAuth device flow/);
  assert.match(out, /undated note/);
});

test('truncation is disclosed with a count and a narrowing hint', () => {
  const out = renderSearchResult(
    { hits: [{ date: '2026-07-01', fact: 'a', line: '- [2026-07-01] a' }], truncated: 12 },
    'payments'
  );
  assert.match(out, /12 more/);
  assert.match(out, /narrower query/);
});
