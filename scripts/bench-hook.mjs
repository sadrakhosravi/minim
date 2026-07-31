// Cold-start benchmark. v0.1.0 baseline: ~23ms per invocation on Node 24.16.0.
// Fails if the mean regresses past BUDGET_MS, which would mean the bundle grew
// pathologically or lazy work crept into module scope.
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../packages/cli/bin/minim.js', import.meta.url));
const RUNS = 50;
const BUDGET_MS = 40;

const root = mkdtempSync(path.join(tmpdir(), 'minim-bench-'));
const payload = JSON.stringify({
  cwd: root,
  timestamp: '2026-07-31T10:00:00Z',
  tool_name: 'readFile',
  tool_input: { filePath: 'src/app.js' },
});

// One warm-up run so filesystem caches are primed for every measured run.
execFileSync(process.execPath, [CLI, 'hook', 'PreToolUse'], { input: payload });

const started = process.hrtime.bigint();
for (let i = 0; i < RUNS; i++) {
  execFileSync(process.execPath, [CLI, 'hook', 'PreToolUse'], { input: payload });
}
const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
const mean = elapsedMs / RUNS;

console.log(`${RUNS} runs, ${elapsedMs.toFixed(0)}ms total, ${mean.toFixed(1)}ms mean`);
if (mean > BUDGET_MS) {
  console.error(`bench: mean ${mean.toFixed(1)}ms exceeds budget ${BUDGET_MS}ms`);
  process.exit(1);
}
