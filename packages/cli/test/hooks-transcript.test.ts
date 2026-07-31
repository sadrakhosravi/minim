import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { memPath } from '../../core/src/memory.ts';
import { readMetrics } from '../../core/src/metrics.ts';
import type { HookOutput } from '../../core/src/types.ts';

const CLI = fileURLToPath(new URL('../bin/minim.js', import.meta.url));

function hook(event: string, payload: unknown): HookOutput {
  const out = execFileSync(process.execPath, [CLI, 'hook', event], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  return JSON.parse(out) as HookOutput;
}

function repoWithTranscript(body: string): { root: string; tp: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const tp = path.join(root, 'transcript.txt');
  fs.writeFileSync(tp, body);
  return { root, tp };
}

test('PostToolUse logs a tool call with token estimates and stays silent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = hook('PostToolUse', {
    cwd: root,
    session_id: 's1',
    timestamp: '2026-07-31T10:00:00Z',
    tool_name: 'readFile',
    tool_input: { filePath: 'src/app.js' },
    tool_output: 'x'.repeat(400),
  });
  assert.deepEqual(out, { continue: true });
  const [rec] = readMetrics(root);
  assert.equal(rec.tool, 'readFile');
  assert.equal(rec.event, 'tool');
  assert.equal(rec.outTokens, 100);
  assert.equal(rec.session, 's1');
});

test('PostToolUse serializes non-string tool output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  hook('PostToolUse', {
    cwd: root,
    timestamp: '2026-07-31T10:00:00Z',
    tool_name: 'search',
    tool_output: { matches: [1, 2, 3] },
  });
  const [rec] = readMetrics(root);
  assert.ok((rec.outTokens as number) > 0);
});

test('Stop extracts notes from the transcript into memory', () => {
  const { root, tp } = repoWithTranscript('chat chat\nMINIM-NOTE: retries capped at 3\n');
  const out = hook('Stop', {
    cwd: root,
    transcript_path: tp,
    session_id: 's1',
    timestamp: '2026-07-31T10:00:00Z',
  });
  assert.match(fs.readFileSync(memPath(root), 'utf8'), /- \[2026-07-31\] retries capped at 3/);
  assert.match(out.systemMessage ?? '', /1 fact/);
});

test('Stop writes a session_end metric even when no facts were found', () => {
  const { root, tp } = repoWithTranscript('nothing notable here\n');
  const out = hook('Stop', {
    cwd: root,
    transcript_path: tp,
    session_id: 's2',
    timestamp: '2026-07-31T10:00:00Z',
  });
  assert.deepEqual(out, { continue: true });
  const [rec] = readMetrics(root);
  assert.equal(rec.event, 'session_end');
  assert.equal(rec.factsSaved, 0);
  assert.ok((rec.transcriptTokens as number) > 0);
});

test('Stop with no transcript is a no-op', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = hook('Stop', { cwd: root, timestamp: '2026-07-31T10:00:00Z' });
  assert.deepEqual(out, { continue: true });
  assert.deepEqual(readMetrics(root), []);
});

test('Stop does not duplicate a fact the remember tool already stored', () => {
  const { root, tp } = repoWithTranscript('MINIM-NOTE: retries capped at 3\n');
  hook('Stop', { cwd: root, transcript_path: tp, timestamp: '2026-07-30T10:00:00Z' });
  hook('Stop', { cwd: root, transcript_path: tp, timestamp: '2026-07-31T10:00:00Z' });
  const body = fs.readFileSync(memPath(root), 'utf8');
  assert.equal(body.match(/retries capped at 3/g)?.length, 1);
});

test('PreCompact snapshots the transcript and extracts notes', () => {
  const { root, tp } = repoWithTranscript('MINIM-NOTE: compaction happened, fact persisted\n');
  hook('PreCompact', {
    cwd: root,
    transcript_path: tp,
    session_id: 'abc123',
    timestamp: '2026-07-31T10:00:00Z',
  });
  const snaps = fs.readdirSync(path.join(root, '.minim', 'snapshots'));
  assert.equal(snaps.length, 1);
  assert.match(snaps[0], /^abc123-/);
  assert.match(fs.readFileSync(memPath(root), 'utf8'), /fact persisted/);
});

test('PreCompact with no transcript is a no-op', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = hook('PreCompact', { cwd: root, timestamp: '2026-07-31T10:00:00Z' });
  assert.deepEqual(out, { continue: true });
  assert.equal(fs.existsSync(path.join(root, '.minim', 'snapshots')), false);
});
