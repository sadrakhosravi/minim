import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractNotes } from '../src/extract.ts';

test('extracts MINIM-NOTE lines', () => {
  const t = 'blah\nMINIM-NOTE: auth uses JWT with 15m expiry\nmore\n  MINIM-NOTE: db is postgres 16\n';
  assert.deepEqual(extractNotes(t), ['auth uses JWT with 15m expiry', 'db is postgres 16']);
});

test('dedupes repeated notes and ignores empty ones', () => {
  const t = 'MINIM-NOTE: same fact\nMINIM-NOTE: same fact\nMINIM-NOTE:   \n';
  assert.deepEqual(extractNotes(t), ['same fact']);
});

test('no notes yields empty array', () => {
  assert.deepEqual(extractNotes('nothing here'), []);
});

test('non-string input yields empty array', () => {
  assert.deepEqual(extractNotes(null as unknown as string), []);
});
