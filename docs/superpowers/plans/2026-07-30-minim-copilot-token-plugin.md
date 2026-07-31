# Minim — Copilot Token-Efficiency Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `minim` — a zero-dependency Node CLI + VS Code agent-hook pack that cuts GitHub Copilot token spend via persistent file-based memory (claude-mem style), a terse-output style contract (caveman style), hard token budgets, tool-call guards, usage metrics, and a context-packer that replaces exploration turns.

**Architecture:** A single Node CLI (`minim`) dispatches subcommands and hook handlers. VS Code agent hooks (`.github/hooks/*.json`) pipe JSON to `minim hook <Event>` at lifecycle points: SessionStart (budget check), UserPromptSubmit (`#remember` capture), Stop/PreCompact (memory extraction from transcript), PreToolUse (expensive-path guard), PostToolUse (metrics). Memory lives in 4 tiers: Tier 0 = `.github/copilot-instructions.md` (always in context, hard-capped — it IS the prompt-cache prefix); Tier 1 = `.github/instructions/*.instructions.md` (glob-scoped, loaded only when matching files are touched); Tier 2 = `.minim/memory/decisions.md` (on-demand, pulled in by `minim pack` or read by the agent when planning); Tier 3 = `.minim/archive/` (never loaded, grep-searchable). `minim init` vendors the runtime into a target repo so teammates need no npm install. No MCP, no LLM calls, no network — everything deterministic (org has MCP disabled and restricted credits).

**Tech Stack:** Node.js ≥ 20, ESM, zero runtime dependencies, `node:test` + `node:assert/strict` for tests, git.

**Repo root:** `~/dev/minim` (new repository created in Task 1).

## Global Constraints

- Node `>= 20`; `package.json` has `"type": "module"`, `"engines": { "node": ">=20" }`.
- Zero runtime npm dependencies. Zero devDependencies (tests run on built-in `node --test`).
- Every hook invocation MUST exit `0` and write valid JSON to stdout (at minimum `{"continue":true}`). Hooks never halt the user's session in v1 — blocking is done only via `hookSpecificOutput.permissionDecision`.
- Hook input parsing MUST be defensive: accept both `snake_case` (`tool_name`, `tool_input`, `transcript_path`, `session_id`, `hook_event_name`) and `camelCase` (`toolName`, `toolInput`, `transcriptPath`, `sessionId`, `hookEventName`) top-level keys — VS Code documents snake_case top-level fields but camelCase keys inside `tool_input`, and the format is Preview-stage and may drift.
- Token estimation heuristic everywhere: `ceil(chars / 4)` (~±15% error, documented in README). No tokenizer dependency.
- Budget caps: Tier 0 = 1500 tokens, Tier 1 = 800 tokens per file, `minim pack` output = 20000 tokens (override with `--force`).
- Memory entry line format (exact): `- [YYYY-MM-DD] <fact text>` — one line per fact, no wrapping.
- Transcript note marker (exact string): `MINIM-NOTE:` — the Tier 0 template instructs the model to emit it; the extractor greps for it.
- Prompt capture marker (exact string): `#remember` — text after it on the same prompt is saved as a fact.
- All file writes stay under the target repo root passed in (or hook input `cwd`); never write to `$HOME` or absolute paths outside the repo.
- Test determinism: no `Date.now()`/`new Date()` inside pure functions — dates are always parameters. Hook entry points may read `input.timestamp` with a `new Date().toISOString()` fallback.
- All tests create fixtures in `fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'))` temp dirs.

---

### Task 1: Repo scaffold + token estimator

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `src/tokens.js`
- Test: `test/tokens.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `estimateTokens(text: string) -> number` from `src/tokens.js`. Every later task imports this.

- [ ] **Step 1: Initialize repo and scaffold**

```bash
cd ~/dev/minim
# repo already cloned from github.com/sadrakhosravi/minim
mkdir -p src bin test templates src/hooks src/cli
```

Create `package.json`:

```json
{
  "name": "minim-copilot",
  "version": "0.1.0",
  "description": "Token-efficiency toolkit for GitHub Copilot in VS Code: memory, budgets, guards, metrics",
  "type": "module",
  "bin": { "minim": "bin/minim.js" },
  "engines": { "node": ">=20" },
  "scripts": { "test": "node --test" },
  "license": "MIT"
}
```

Create `.gitignore`:

```
node_modules/
.minim/metrics/
.minim/snapshots/
.minim/debug/
```

- [ ] **Step 2: Write the failing test**

Create `test/tokens.test.js`:

```js
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/tokens.test.js`
Expected: FAIL — `Cannot find module '../src/tokens.js'`

- [ ] **Step 4: Write minimal implementation**

Create `src/tokens.js`:

```js
// Heuristic token estimator: ~4 chars per token, ±15%. Good enough for budgets.
export function estimateTokens(text) {
  if (typeof text !== 'string' || text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/tokens.test.js`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore src/tokens.js test/tokens.test.js
git commit -m "feat: scaffold minim-copilot with token estimator"
```

---

### Task 2: Hook I/O harness + CLI dispatch

**Files:**
- Create: `src/hookio.js`
- Create: `src/hookrun.js`
- Create: `bin/minim.js`
- Test: `test/hookio.test.js`
- Test: `test/hookrun.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `readStdinJson() -> Promise<object>` (empty object on parse failure), `respond(obj?: object) -> void` (writes `{"continue":true, ...obj}` JSON to stdout), `field(input: object, ...names: string[]) -> any` (first defined key wins) — from `src/hookio.js`.
  - `run(event: string) -> Promise<void>` and a `handlers` registry object from `src/hookrun.js`. Later tasks register handler modules here; each handler module exports `handle(input: object) -> Promise<object|undefined>` where the returned object is merged into the hook response.
  - `bin/minim.js` CLI entry: `minim hook <Event>` works end-to-end; later tasks add subcommand cases to its `switch`.

- [ ] **Step 1: Write the failing tests**

Create `test/hookio.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { field } from '../src/hookio.js';

test('field returns first defined key', () => {
  assert.equal(field({ tool_name: 'read' }, 'tool_name', 'toolName'), 'read');
  assert.equal(field({ toolName: 'read' }, 'tool_name', 'toolName'), 'read');
  assert.equal(field({}, 'tool_name', 'toolName'), undefined);
  assert.equal(field(null, 'tool_name', 'toolName'), undefined);
});
```

Create `test/hookrun.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

test('unknown hook event responds with continue:true and exits 0', () => {
  const out = execSync(`echo '{"hook_event_name":"Nope"}' | node bin/minim.js hook Nope`, {
    encoding: 'utf8',
  });
  assert.deepEqual(JSON.parse(out), { continue: true });
});

test('malformed stdin JSON still responds with continue:true', () => {
  const out = execSync(`echo 'not-json' | node bin/minim.js hook SessionStart`, {
    encoding: 'utf8',
  });
  assert.equal(JSON.parse(out).continue, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/hookio.test.js test/hookrun.test.js`
Expected: FAIL — `Cannot find module '../src/hookio.js'` / `Cannot find module bin/minim.js`

- [ ] **Step 3: Write minimal implementation**

Create `src/hookio.js`:

```js
export async function readStdinJson() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export function respond(obj = {}) {
  process.stdout.write(JSON.stringify({ continue: true, ...obj }));
}

// Defensive field access: VS Code hook payloads are Preview-stage;
// accept both snake_case and camelCase names.
export function field(input, ...names) {
  if (!input || typeof input !== 'object') return undefined;
  for (const n of names) {
    if (input[n] !== undefined) return input[n];
  }
  return undefined;
}
```

Create `src/hookrun.js`:

```js
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStdinJson, respond, field } from './hookio.js';

// Handler modules register here as tasks land. Each exports handle(input) -> object|undefined.
export const handlers = {};

export async function run(event) {
  const input = await readStdinJson();
  if (process.env.MINIM_DEBUG) {
    try {
      const root = field(input, 'cwd') || process.cwd();
      const dir = join(root, '.minim', 'debug');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${Date.now()}-${event}.json`), JSON.stringify(input, null, 2));
    } catch {
      /* debug dump must never break a hook */
    }
  }
  const loader = handlers[event];
  if (!loader) return respond();
  try {
    const mod = await loader();
    const out = await mod.handle(input);
    respond(out || {});
  } catch (e) {
    respond({ systemMessage: `minim hook error (${event}): ${e.message}` });
  }
}
```

Create `bin/minim.js`:

```js
#!/usr/bin/env node
const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case 'hook': {
    const { run } = await import('../src/hookrun.js');
    await run(args[0]);
    break;
  }
  default:
    console.error(`minim: unknown command "${cmd ?? ''}"\nusage: minim hook <Event>`);
    process.exit(1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/hookio.test.js test/hookrun.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hookio.js src/hookrun.js bin/minim.js test/hookio.test.js test/hookrun.test.js
git commit -m "feat: hook I/O harness with defensive parsing and CLI dispatch"
```

---

### Task 3: Budget checker + SessionStart hook + `minim budget`

**Files:**
- Create: `src/budget.js`
- Create: `src/hooks/sessionstart.js`
- Create: `src/cli/budget.js`
- Modify: `src/hookrun.js` (register handler)
- Modify: `bin/minim.js` (add `budget` case)
- Test: `test/budget.test.js`
- Test: `test/sessionstart.test.js`

**Interfaces:**
- Consumes: `estimateTokens` (Task 1), `field` (Task 2), `handlers` registry (Task 2).
- Produces:
  - `TIER0_CAP = 1500`, `TIER1_CAP = 800`, `checkBudgets(root: string) -> Array<{path: string, tokens: number, cap: number, over: boolean}>` from `src/budget.js`. Used by the SessionStart hook and the `minim budget` CLI.
  - `handle(input) -> object|undefined` from `src/hooks/sessionstart.js`.

- [ ] **Step 1: Write the failing tests**

Create `test/budget.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkBudgets, TIER0_CAP, TIER1_CAP } from '../src/budget.js';

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
}

test('missing files produce empty report', () => {
  assert.deepEqual(checkBudgets(tmpRepo()), []);
});

test('tier 0 under cap reports over:false', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.github'), { recursive: true });
  fs.writeFileSync(path.join(root, '.github', 'copilot-instructions.md'), 'short file');
  const report = checkBudgets(root);
  assert.equal(report.length, 1);
  assert.equal(report[0].cap, TIER0_CAP);
  assert.equal(report[0].over, false);
});

test('oversized tier 1 file reports over:true', () => {
  const root = tmpRepo();
  const dir = path.join(root, '.github', 'instructions');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'big.instructions.md'), 'x'.repeat((TIER1_CAP + 1) * 4));
  const report = checkBudgets(root);
  assert.equal(report.length, 1);
  assert.equal(report[0].cap, TIER1_CAP);
  assert.equal(report[0].over, true);
});
```

Create `test/sessionstart.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handle } from '../src/hooks/sessionstart.js';
import { TIER0_CAP } from '../src/budget.js';

test('no warning when budgets ok', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = await handle({ cwd: root });
  assert.equal(out, undefined);
});

test('systemMessage names oversized files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  fs.mkdirSync(path.join(root, '.github'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.github', 'copilot-instructions.md'),
    'x'.repeat((TIER0_CAP + 1) * 4)
  );
  const out = await handle({ cwd: root });
  assert.match(out.systemMessage, /copilot-instructions\.md/);
  assert.match(out.systemMessage, /over budget/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/budget.test.js test/sessionstart.test.js`
Expected: FAIL — `Cannot find module '../src/budget.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/budget.js`:

```js
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { estimateTokens } from './tokens.js';

export const TIER0_CAP = 1500;
export const TIER1_CAP = 800;

function checkFile(path, cap) {
  const tokens = estimateTokens(readFileSync(path, 'utf8'));
  return { path, tokens, cap, over: tokens > cap };
}

export function checkBudgets(root) {
  const report = [];
  const tier0 = join(root, '.github', 'copilot-instructions.md');
  if (existsSync(tier0)) report.push(checkFile(tier0, TIER0_CAP));
  const tier1Dir = join(root, '.github', 'instructions');
  if (existsSync(tier1Dir)) {
    for (const f of readdirSync(tier1Dir)) {
      if (f.endsWith('.instructions.md')) report.push(checkFile(join(tier1Dir, f), TIER1_CAP));
    }
  }
  return report;
}
```

Create `src/hooks/sessionstart.js`:

```js
import { checkBudgets } from '../budget.js';
import { field } from '../hookio.js';

export async function handle(input) {
  const root = field(input, 'cwd') || process.cwd();
  const over = checkBudgets(root).filter((r) => r.over);
  if (over.length === 0) return undefined;
  const list = over.map((r) => `${r.path} (${r.tokens}/${r.cap} tok)`).join(', ');
  return {
    systemMessage: `minim warn: instruction files over budget — every session pays for these: ${list}. Run "minim budget" and trim.`,
  };
}
```

Create `src/cli/budget.js`:

```js
import { checkBudgets } from '../budget.js';

export function run() {
  const report = checkBudgets(process.cwd());
  if (report.length === 0) {
    console.log('minim budget: no instruction files found.');
    return;
  }
  for (const r of report) {
    console.log(`${r.over ? 'OVER ' : 'ok   '} ${r.tokens}/${r.cap} tok  ${r.path}`);
  }
  process.exitCode = report.some((r) => r.over) ? 1 : 0;
}
```

In `src/hookrun.js`, change the handlers registry to:

```js
export const handlers = {
  SessionStart: () => import('./hooks/sessionstart.js'),
};
```

In `bin/minim.js`, add a case above `default:`:

```js
  case 'budget': {
    const { run } = await import('../src/cli/budget.js');
    run(args);
    break;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS (all tests, including Tasks 1–2)

- [ ] **Step 5: Commit**

```bash
git add src/budget.js src/hooks/sessionstart.js src/cli/budget.js src/hookrun.js bin/minim.js test/budget.test.js test/sessionstart.test.js
git commit -m "feat: instruction-file token budgets with SessionStart warning"
```

---

### Task 4: Memory store + extractor + Stop/UserPromptSubmit capture

**Files:**
- Create: `src/memory.js`
- Create: `src/extract.js`
- Create: `src/hooks/stop.js`
- Create: `src/hooks/userprompt.js`
- Modify: `src/hookrun.js` (register handlers)
- Test: `test/memory.test.js`
- Test: `test/extract.test.js`
- Test: `test/stop.test.js`

**Interfaces:**
- Consumes: `field` (Task 2).
- Produces:
  - `memPath(root: string) -> string`, `appendFacts(root: string, facts: string[], dateIso: string) -> number` (returns count of newly written facts, dedupes against existing file) from `src/memory.js`.
  - `extractNotes(text: string) -> string[]` from `src/extract.js`.
  - `handle(input)` from `src/hooks/stop.js` and `src/hooks/userprompt.js`. Task 5 (PreCompact) and Task 7 (metrics) reuse `extractNotes`/`appendFacts`; Task 7 modifies `src/hooks/stop.js`.

- [ ] **Step 1: Write the failing tests**

Create `test/extract.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractNotes } from '../src/extract.js';

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
```

Create `test/memory.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendFacts, memPath } from '../src/memory.js';

test('appends facts as dated lines, creating dirs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const n = appendFacts(root, ['fact one', 'fact two'], '2026-07-30');
  assert.equal(n, 2);
  const body = fs.readFileSync(memPath(root), 'utf8');
  assert.equal(body, '- [2026-07-30] fact one\n- [2026-07-30] fact two\n');
});

test('dedupes against existing file content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  appendFacts(root, ['fact one'], '2026-07-29');
  const n = appendFacts(root, ['fact one', 'fact two'], '2026-07-30');
  assert.equal(n, 1);
  const body = fs.readFileSync(memPath(root), 'utf8');
  assert.equal(body, '- [2026-07-29] fact one\n- [2026-07-30] fact two\n');
});
```

Create `test/stop.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handle as stopHandle } from '../src/hooks/stop.js';
import { handle as promptHandle } from '../src/hooks/userprompt.js';
import { memPath } from '../src/memory.js';

test('Stop extracts notes from transcript into memory', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const tp = path.join(root, 'transcript.txt');
  fs.writeFileSync(tp, 'chat chat\nMINIM-NOTE: retries capped at 3\n');
  const out = await stopHandle({
    cwd: root,
    transcript_path: tp,
    timestamp: '2026-07-30T10:00:00Z',
  });
  assert.match(fs.readFileSync(memPath(root), 'utf8'), /retries capped at 3/);
  assert.match(out.systemMessage, /1 fact/);
});

test('Stop with no transcript is a no-op', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = await stopHandle({ cwd: root, timestamp: '2026-07-30T10:00:00Z' });
  assert.equal(out, undefined);
});

test('UserPromptSubmit captures #remember text', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = await promptHandle({
    cwd: root,
    prompt: 'fix the bug #remember payments API is v2 only',
    timestamp: '2026-07-30T10:00:00Z',
  });
  assert.match(fs.readFileSync(memPath(root), 'utf8'), /payments API is v2 only/);
  assert.match(out.systemMessage, /minim remember/);
});

test('UserPromptSubmit without marker is a no-op', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = await promptHandle({ cwd: root, prompt: 'just fix it' });
  assert.equal(out, undefined);
  assert.equal(fs.existsSync(memPath(root)), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/extract.test.js test/memory.test.js test/stop.test.js`
Expected: FAIL — `Cannot find module '../src/extract.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/extract.js`:

```js
const NOTE_RE = /^.*?MINIM-NOTE:[ \t]*(.+)$/gm;

export function extractNotes(text) {
  const out = [];
  if (typeof text !== 'string') return out;
  for (const m of text.matchAll(NOTE_RE)) {
    const fact = m[1].trim();
    if (fact && !out.includes(fact)) out.push(fact);
  }
  return out;
}
```

Create `src/memory.js`:

```js
import fs from 'node:fs';
import path from 'node:path';

export function memPath(root) {
  return path.join(root, '.minim', 'memory', 'decisions.md');
}

export function appendFacts(root, facts, dateIso) {
  if (!facts || facts.length === 0) return 0;
  const p = memPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const existing = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const fresh = facts.filter((f) => f.trim() && !existing.includes(f.trim()));
  if (fresh.length) {
    fs.appendFileSync(p, fresh.map((f) => `- [${dateIso}] ${f.trim()}\n`).join(''));
  }
  return fresh.length;
}
```

Create `src/hooks/stop.js`:

```js
import fs from 'node:fs';
import { extractNotes } from '../extract.js';
import { appendFacts } from '../memory.js';
import { field } from '../hookio.js';

export async function handle(input) {
  const root = field(input, 'cwd') || process.cwd();
  const tp = field(input, 'transcript_path', 'transcriptPath');
  if (!tp || !fs.existsSync(tp)) return undefined;
  const date = (field(input, 'timestamp') || new Date().toISOString()).slice(0, 10);
  const n = appendFacts(root, extractNotes(fs.readFileSync(tp, 'utf8')), date);
  if (n === 0) return undefined;
  return { systemMessage: `minim remember: ${n} fact(s) saved to .minim/memory/decisions.md` };
}
```

Create `src/hooks/userprompt.js`:

```js
import { appendFacts } from '../memory.js';
import { field } from '../hookio.js';

export async function handle(input) {
  const prompt = field(input, 'prompt') || '';
  const idx = prompt.indexOf('#remember');
  if (idx === -1) return undefined;
  const fact = prompt.slice(idx + '#remember'.length).trim();
  if (!fact) return undefined;
  const root = field(input, 'cwd') || process.cwd();
  const date = (field(input, 'timestamp') || new Date().toISOString()).slice(0, 10);
  appendFacts(root, [fact], date);
  return { systemMessage: 'minim remember: saved.' };
}
```

In `src/hookrun.js`, extend the registry:

```js
export const handlers = {
  SessionStart: () => import('./hooks/sessionstart.js'),
  UserPromptSubmit: () => import('./hooks/userprompt.js'),
  Stop: () => import('./hooks/stop.js'),
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/memory.js src/extract.js src/hooks/stop.js src/hooks/userprompt.js src/hookrun.js test/memory.test.js test/extract.test.js test/stop.test.js
git commit -m "feat: persistent memory with MINIM-NOTE extraction and #remember capture"
```

---

### Task 5: PreCompact hook — persist before context drop

**Files:**
- Create: `src/hooks/precompact.js`
- Modify: `src/hookrun.js` (register handler)
- Test: `test/precompact.test.js`

**Interfaces:**
- Consumes: `extractNotes` (Task 4), `appendFacts` (Task 4), `field` (Task 2).
- Produces: `handle(input)` from `src/hooks/precompact.js`. Snapshot files land in `.minim/snapshots/<sessionId>-<unixMs>.txt`.

- [ ] **Step 1: Write the failing test**

Create `test/precompact.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handle } from '../src/hooks/precompact.js';
import { memPath } from '../src/memory.js';

test('PreCompact snapshots transcript and extracts notes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const tp = path.join(root, 'transcript.txt');
  fs.writeFileSync(tp, 'MINIM-NOTE: compaction happened, fact persisted\n');
  await handle({
    cwd: root,
    transcript_path: tp,
    session_id: 'abc123',
    timestamp: '2026-07-30T10:00:00Z',
  });
  const snaps = fs.readdirSync(path.join(root, '.minim', 'snapshots'));
  assert.equal(snaps.length, 1);
  assert.match(snaps[0], /^abc123-/);
  assert.match(fs.readFileSync(memPath(root), 'utf8'), /fact persisted/);
});

test('PreCompact with no transcript is a no-op', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = await handle({ cwd: root });
  assert.equal(out, undefined);
  assert.equal(fs.existsSync(path.join(root, '.minim', 'snapshots')), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/precompact.test.js`
Expected: FAIL — `Cannot find module '../src/hooks/precompact.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/hooks/precompact.js`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { extractNotes } from '../extract.js';
import { appendFacts } from '../memory.js';
import { field } from '../hookio.js';

export async function handle(input) {
  const root = field(input, 'cwd') || process.cwd();
  const tp = field(input, 'transcript_path', 'transcriptPath');
  if (!tp || !fs.existsSync(tp)) return undefined;
  const text = fs.readFileSync(tp, 'utf8');
  const ts = field(input, 'timestamp') || new Date().toISOString();
  const session = field(input, 'session_id', 'sessionId') || 'session';
  const dir = path.join(root, '.minim', 'snapshots');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${session}-${Date.parse(ts)}.txt`), text);
  const n = appendFacts(root, extractNotes(text), ts.slice(0, 10));
  if (n === 0) return undefined;
  return { systemMessage: `minim: persisted ${n} fact(s) before compaction.` };
}
```

In `src/hookrun.js`, add to the registry:

```js
  PreCompact: () => import('./hooks/precompact.js'),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/precompact.js src/hookrun.js test/precompact.test.js
git commit -m "feat: PreCompact hook persists memory and snapshots transcript"
```

---

### Task 6: PreToolUse guard — block token-expensive paths

**Files:**
- Create: `src/config.js`
- Create: `src/hooks/pretooluse.js`
- Modify: `src/hookrun.js` (register handler)
- Test: `test/pretooluse.test.js`

**Interfaces:**
- Consumes: `field` (Task 2).
- Produces:
  - `loadConfig(root: string) -> object` from `src/config.js` — reads `.minim/config.json`, returns `{ guard: { denyPatterns: string[], decision: 'ask'|'deny' }, memory: { maxAgeDays: number }, pack: { maxTokens: number, maxLinesPerFile: number } }` with defaults merged. Task 8 and Task 9 reuse `loadConfig`; Task 10's init writes the file.
  - `handle(input)` from `src/hooks/pretooluse.js` returning `hookSpecificOutput.permissionDecision` on matches.

- [ ] **Step 1: Write the failing test**

Create `test/pretooluse.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handle } from '../src/hooks/pretooluse.js';

test('flags tool input touching node_modules with ask decision', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = await handle({
    cwd: root,
    tool_name: 'readFile',
    tool_input: { filePath: 'node_modules/lodash/index.js' },
  });
  assert.equal(out.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /node_modules/);
});

test('clean tool input passes untouched', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = await handle({
    cwd: root,
    tool_name: 'readFile',
    tool_input: { filePath: 'src/app.js' },
  });
  assert.equal(out, undefined);
});

test('config can escalate decision to deny', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  fs.mkdirSync(path.join(root, '.minim'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.minim', 'config.json'),
    JSON.stringify({ guard: { decision: 'deny' } })
  );
  const out = await handle({
    cwd: root,
    tool_name: 'readFile',
    tool_input: { filePath: 'dist/bundle.min.js' },
  });
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/pretooluse.test.js`
Expected: FAIL — `Cannot find module '../src/hooks/pretooluse.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/config.js`:

```js
import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = {
  guard: {
    denyPatterns: [
      'node_modules/',
      'dist/',
      'build/',
      '.min.js',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
    ],
    decision: 'ask',
  },
  memory: { maxAgeDays: 45 },
  pack: { maxTokens: 20000, maxLinesPerFile: 400 },
};

export function loadConfig(root) {
  const p = path.join(root, '.minim', 'config.json');
  let user = {};
  try {
    user = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    /* missing or malformed config falls back to defaults */
  }
  return {
    guard: { ...DEFAULTS.guard, ...user.guard },
    memory: { ...DEFAULTS.memory, ...user.memory },
    pack: { ...DEFAULTS.pack, ...user.pack },
  };
}
```

Create `src/hooks/pretooluse.js`:

```js
import { loadConfig } from '../config.js';
import { field } from '../hookio.js';

export async function handle(input) {
  const root = field(input, 'cwd') || process.cwd();
  const { guard } = loadConfig(root);
  const toolInput = field(input, 'tool_input', 'toolInput');
  const haystack = JSON.stringify(toolInput ?? '');
  const hit = guard.denyPatterns.find((p) => haystack.includes(p));
  if (!hit) return undefined;
  return {
    hookSpecificOutput: {
      permissionDecision: guard.decision,
      permissionDecisionReason: `minim guard: "${hit}" is vendored/generated — reading it costs tokens for no signal. Override in .minim/config.json if intentional.`,
    },
  };
}
```

In `src/hookrun.js`, add to the registry:

```js
  PreToolUse: () => import('./hooks/pretooluse.js'),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/config.js src/hooks/pretooluse.js src/hookrun.js test/pretooluse.test.js
git commit -m "feat: PreToolUse guard flags vendored/generated paths"
```

---

### Task 7: Metrics — PostToolUse logger, Stop session summary, `minim stats`

**Files:**
- Create: `src/metrics.js`
- Create: `src/hooks/posttooluse.js`
- Create: `src/cli/stats.js`
- Modify: `src/hooks/stop.js` (append session summary metric)
- Modify: `src/hookrun.js` (register handler)
- Modify: `bin/minim.js` (add `stats` case)
- Test: `test/metrics.test.js`
- Test: `test/stats.test.js`

**Interfaces:**
- Consumes: `estimateTokens` (Task 1), `field` (Task 2), `extractNotes`/`appendFacts` (Task 4).
- Produces:
  - `appendMetric(root: string, obj: object) -> void` and `readMetrics(root: string) -> object[]` from `src/metrics.js`. Metric records are JSONL in `.minim/metrics/YYYY-MM.jsonl`; each record has `ts` (ISO string) plus free-form fields. Tool records: `{ ts, session, event: 'tool', tool, inTokens, outTokens }`. Session records: `{ ts, session, event: 'session_end', transcriptTokens, factsSaved }`.
  - `summarize(root: string) -> { sessions, totalTranscriptTokens, avgTranscriptTokens, factsSaved, toolCalls }` from `src/cli/stats.js`.

- [ ] **Step 1: Write the failing tests**

Create `test/metrics.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendMetric, readMetrics } from '../src/metrics.js';
import { handle } from '../src/hooks/posttooluse.js';

test('appendMetric writes JSONL into month file and readMetrics reads it back', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  appendMetric(root, { ts: '2026-07-30T10:00:00Z', event: 'tool', tool: 'readFile' });
  appendMetric(root, { ts: '2026-07-30T10:01:00Z', event: 'tool', tool: 'search' });
  const file = path.join(root, '.minim', 'metrics', '2026-07.jsonl');
  assert.equal(fs.readFileSync(file, 'utf8').trim().split('\n').length, 2);
  assert.equal(readMetrics(root).length, 2);
});

test('PostToolUse logs tool call with token estimates', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = await handle({
    cwd: root,
    session_id: 's1',
    timestamp: '2026-07-30T10:00:00Z',
    tool_name: 'readFile',
    tool_input: { filePath: 'src/app.js' },
    tool_output: 'x'.repeat(400),
  });
  assert.equal(out, undefined); // metrics are silent
  const [rec] = readMetrics(root);
  assert.equal(rec.tool, 'readFile');
  assert.equal(rec.outTokens, 100);
});
```

Create `test/stats.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { summarize } from '../src/cli/stats.js';

test('summarize aggregates sessions and tool calls', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const dir = path.join(root, '.minim', 'metrics');
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    { ts: '2026-07-30T10:00:00Z', session: 's1', event: 'tool', tool: 'readFile', inTokens: 5, outTokens: 100 },
    { ts: '2026-07-30T10:05:00Z', session: 's1', event: 'session_end', transcriptTokens: 5000, factsSaved: 2 },
    { ts: '2026-07-30T11:00:00Z', session: 's2', event: 'session_end', transcriptTokens: 3000, factsSaved: 0 },
  ];
  fs.writeFileSync(path.join(dir, '2026-07.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const s = summarize(root);
  assert.equal(s.sessions, 2);
  assert.equal(s.totalTranscriptTokens, 8000);
  assert.equal(s.avgTranscriptTokens, 4000);
  assert.equal(s.toolCalls.readFile, 1);
  assert.equal(s.factsSaved, 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/metrics.test.js test/stats.test.js`
Expected: FAIL — `Cannot find module '../src/metrics.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/metrics.js`:

```js
import fs from 'node:fs';
import path from 'node:path';

export function appendMetric(root, obj) {
  const dir = path.join(root, '.minim', 'metrics');
  fs.mkdirSync(dir, { recursive: true });
  const month = (obj.ts || new Date().toISOString()).slice(0, 7);
  fs.appendFileSync(path.join(dir, `${month}.jsonl`), JSON.stringify(obj) + '\n');
}

export function readMetrics(root) {
  const dir = path.join(root, '.minim', 'metrics');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        /* skip corrupt lines */
      }
    }
  }
  return out;
}
```

Create `src/hooks/posttooluse.js`:

```js
import { appendMetric } from '../metrics.js';
import { estimateTokens } from '../tokens.js';
import { field } from '../hookio.js';

export async function handle(input) {
  const root = field(input, 'cwd') || process.cwd();
  const toolOutput = field(input, 'tool_output', 'toolOutput');
  appendMetric(root, {
    ts: field(input, 'timestamp') || new Date().toISOString(),
    session: field(input, 'session_id', 'sessionId') || 'unknown',
    event: 'tool',
    tool: field(input, 'tool_name', 'toolName') || 'unknown',
    inTokens: estimateTokens(JSON.stringify(field(input, 'tool_input', 'toolInput') ?? '')),
    outTokens: estimateTokens(
      typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput ?? '')
    ),
  });
  return undefined;
}
```

Create `src/cli/stats.js`:

```js
import { readMetrics } from '../metrics.js';

export function summarize(root) {
  const recs = readMetrics(root);
  const ends = recs.filter((r) => r.event === 'session_end');
  const tools = recs.filter((r) => r.event === 'tool');
  const totalTranscriptTokens = ends.reduce((a, r) => a + (r.transcriptTokens || 0), 0);
  const toolCalls = {};
  for (const t of tools) toolCalls[t.tool] = (toolCalls[t.tool] || 0) + 1;
  return {
    sessions: ends.length,
    totalTranscriptTokens,
    avgTranscriptTokens: ends.length ? Math.round(totalTranscriptTokens / ends.length) : 0,
    factsSaved: ends.reduce((a, r) => a + (r.factsSaved || 0), 0),
    toolCalls,
  };
}

export function run() {
  const s = summarize(process.cwd());
  console.log(`sessions:            ${s.sessions}`);
  console.log(`transcript tokens:   ${s.totalTranscriptTokens} total, ${s.avgTranscriptTokens} avg/session (±15% estimate)`);
  console.log(`facts saved:         ${s.factsSaved}`);
  console.log('tool calls:');
  for (const [tool, n] of Object.entries(s.toolCalls).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${tool}`);
  }
}
```

Replace `src/hooks/stop.js` in full (adds the session-summary metric):

```js
import fs from 'node:fs';
import { extractNotes } from '../extract.js';
import { appendFacts } from '../memory.js';
import { appendMetric } from '../metrics.js';
import { estimateTokens } from '../tokens.js';
import { field } from '../hookio.js';

export async function handle(input) {
  const root = field(input, 'cwd') || process.cwd();
  const tp = field(input, 'transcript_path', 'transcriptPath');
  if (!tp || !fs.existsSync(tp)) return undefined;
  const text = fs.readFileSync(tp, 'utf8');
  const ts = field(input, 'timestamp') || new Date().toISOString();
  const n = appendFacts(root, extractNotes(text), ts.slice(0, 10));
  appendMetric(root, {
    ts,
    session: field(input, 'session_id', 'sessionId') || 'unknown',
    event: 'session_end',
    transcriptTokens: estimateTokens(text),
    factsSaved: n,
  });
  if (n === 0) return undefined;
  return { systemMessage: `minim remember: ${n} fact(s) saved to .minim/memory/decisions.md` };
}
```

In `src/hookrun.js`, add to the registry:

```js
  PostToolUse: () => import('./hooks/posttooluse.js'),
```

In `bin/minim.js`, add a case above `default:`:

```js
  case 'stats': {
    const { run } = await import('../src/cli/stats.js');
    run(args);
    break;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS (all tests — including Task 4's stop tests, which still pass because the transcript fixture now also produces a metric alongside the same systemMessage)

- [ ] **Step 5: Commit**

```bash
git add src/metrics.js src/hooks/posttooluse.js src/cli/stats.js src/hooks/stop.js src/hookrun.js bin/minim.js test/metrics.test.js test/stats.test.js
git commit -m "feat: JSONL usage metrics with per-session summaries and minim stats"
```

---

### Task 8: Memory compaction — `minim mem compact|list|add`

**Files:**
- Modify: `src/memory.js` (add `compactMemory`)
- Create: `src/cli/mem.js`
- Modify: `bin/minim.js` (add `mem` case)
- Test: `test/compact.test.js`

**Interfaces:**
- Consumes: `memPath`, `appendFacts` (Task 4), `loadConfig` (Task 6).
- Produces: `compactMemory(root: string, maxAgeDays: number, todayIso: string) -> { kept: number, archived: number }` from `src/memory.js`. Old entries move to `.minim/archive/YYYY-MM.md` (month of compaction run).

- [ ] **Step 1: Write the failing test**

Create `test/compact.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendFacts, compactMemory, memPath } from '../src/memory.js';

test('moves entries older than maxAgeDays to archive', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  appendFacts(root, ['ancient fact'], '2026-01-01');
  appendFacts(root, ['recent fact'], '2026-07-25');
  const r = compactMemory(root, 45, '2026-07-30');
  assert.equal(r.archived, 1);
  assert.equal(r.kept, 1);
  const mem = fs.readFileSync(memPath(root), 'utf8');
  assert.match(mem, /recent fact/);
  assert.doesNotMatch(mem, /ancient fact/);
  const archive = fs.readFileSync(path.join(root, '.minim', 'archive', '2026-07.md'), 'utf8');
  assert.match(archive, /ancient fact/);
});

test('no memory file is a no-op', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  assert.deepEqual(compactMemory(root, 45, '2026-07-30'), { kept: 0, archived: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/compact.test.js`
Expected: FAIL — `compactMemory` is not exported

- [ ] **Step 3: Write minimal implementation**

Append to `src/memory.js`:

```js
export function compactMemory(root, maxAgeDays, todayIso) {
  const p = memPath(root);
  if (!fs.existsSync(p)) return { kept: 0, archived: 0 };
  const cutoff = new Date(todayIso).getTime() - maxAgeDays * 86400000;
  const keep = [];
  const old = [];
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(/^- \[(\d{4}-\d{2}-\d{2})\]/);
    if (m && new Date(m[1]).getTime() < cutoff) old.push(line);
    else keep.push(line);
  }
  if (old.length) {
    const ap = path.join(root, '.minim', 'archive', `${todayIso.slice(0, 7)}.md`);
    fs.mkdirSync(path.dirname(ap), { recursive: true });
    fs.appendFileSync(ap, old.join('\n') + '\n');
    fs.writeFileSync(p, keep.length ? keep.join('\n') + '\n' : '');
  }
  return { kept: keep.length, archived: old.length };
}
```

Create `src/cli/mem.js`:

```js
import fs from 'node:fs';
import { appendFacts, compactMemory, memPath } from '../memory.js';
import { loadConfig } from '../config.js';

export function run(args) {
  const root = process.cwd();
  const sub = args[0];
  if (sub === 'add') {
    const fact = args.slice(1).join(' ').trim();
    if (!fact) return console.error('usage: minim mem add <fact>');
    const n = appendFacts(root, [fact], new Date().toISOString().slice(0, 10));
    console.log(n ? 'saved.' : 'duplicate, skipped.');
  } else if (sub === 'list') {
    const p = memPath(root);
    console.log(fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '(no memory yet)');
  } else if (sub === 'compact') {
    const { memory } = loadConfig(root);
    const r = compactMemory(root, memory.maxAgeDays, new Date().toISOString().slice(0, 10));
    console.log(`kept ${r.kept}, archived ${r.archived} (older than ${memory.maxAgeDays}d).`);
  } else {
    console.error('usage: minim mem <add|list|compact>');
    process.exit(1);
  }
}
```

In `bin/minim.js`, add a case above `default:`:

```js
  case 'mem': {
    const { run } = await import('../src/cli/mem.js');
    run(args);
    break;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/memory.js src/cli/mem.js bin/minim.js test/compact.test.js
git commit -m "feat: memory compaction with age-based archiving"
```

---

### Task 9: Context packer — `minim pack`

**Files:**
- Create: `src/pack.js`
- Create: `src/cli/pack.js`
- Modify: `bin/minim.js` (add `pack` case)
- Test: `test/pack.test.js`

**Interfaces:**
- Consumes: `estimateTokens` (Task 1), `memPath` (Task 4), `loadConfig` (Task 6).
- Produces: `buildPack({ task, files, root, maxLinesPerFile }) -> { md: string, tokens: number }` from `src/pack.js`. Output markdown is a VS Code prompt file (frontmatter `mode: agent`) containing task, relevant prior decisions, trimmed file contents, and a scope rule.

- [ ] **Step 1: Write the failing test**

Create `test/pack.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPack } from '../src/pack.js';
import { appendFacts } from '../src/memory.js';

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'auth.js'), 'export function login() {}\n');
  return root;
}

test('pack includes task, files, and scope rule', () => {
  const root = repo();
  const { md, tokens } = buildPack({ task: 'fix login bug', files: ['src/auth.js'], root });
  assert.match(md, /^---\nmode: agent\n---/);
  assert.match(md, /fix login bug/);
  assert.match(md, /## src\/auth\.js/);
  assert.match(md, /export function login/);
  assert.match(md, /Work only within the files above/);
  assert.ok(tokens > 0);
});

test('pack pulls in memory lines matching task words', () => {
  const root = repo();
  appendFacts(root, ['login uses OAuth device flow', 'db is postgres'], '2026-07-01');
  const { md } = buildPack({ task: 'fix login bug', files: ['src/auth.js'], root });
  assert.match(md, /OAuth device flow/);
  assert.doesNotMatch(md, /postgres/);
});

test('long files are truncated at maxLinesPerFile', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'src', 'big.js'), Array(500).fill('line();').join('\n'));
  const { md } = buildPack({ task: 't', files: ['src/big.js'], root, maxLinesPerFile: 100 });
  assert.match(md, /\[truncated 400 lines\]/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/pack.test.js`
Expected: FAIL — `Cannot find module '../src/pack.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/pack.js`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { estimateTokens } from './tokens.js';
import { memPath } from './memory.js';

function relevantMemory(root, task) {
  const p = memPath(root);
  if (!fs.existsSync(p)) return [];
  const words = task.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  if (words.length === 0) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter((line) => {
      const l = line.toLowerCase();
      return line.trim() && words.some((w) => l.includes(w));
    });
}

export function buildPack({ task, files, root, maxLinesPerFile = 400 }) {
  const sections = [];
  for (const f of files) {
    const text = fs.readFileSync(path.resolve(root, f), 'utf8');
    const lines = text.split('\n');
    const body =
      lines.length > maxLinesPerFile
        ? lines.slice(0, maxLinesPerFile).join('\n') +
          `\n... [truncated ${lines.length - maxLinesPerFile} lines]`
        : text;
    sections.push(`## ${f}\n\n\`\`\`\n${body}\n\`\`\``);
  }
  const mem = relevantMemory(root, task);
  const md = [
    '---\nmode: agent\n---',
    `# Task\n\n${task}`,
    mem.length ? `# Prior decisions\n\n${mem.join('\n')}` : '',
    `# Files\n\n${sections.join('\n\n')}`,
    '# Rules\n\nWork only within the files above. Ask before reading anything else. Emit `MINIM-NOTE: <fact>` for any decision worth remembering.',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { md, tokens: estimateTokens(md) };
}
```

Create `src/cli/pack.js`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { buildPack } from '../pack.js';
import { loadConfig } from '../config.js';

export function run(args) {
  const root = process.cwd();
  const files = [];
  let task = '';
  let out = '';
  let force = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--task') task = args[++i];
    else if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--force') force = true;
    else files.push(args[i]);
  }
  if (!task || files.length === 0) {
    console.error('usage: minim pack --task "<description>" [--out <file>] [--force] <file>...');
    process.exit(1);
  }
  const { pack } = loadConfig(root);
  const { md, tokens } = buildPack({ task, files, root, maxLinesPerFile: pack.maxLinesPerFile });
  if (tokens > pack.maxTokens && !force) {
    console.error(`minim pack: ${tokens} tokens exceeds cap ${pack.maxTokens}. Trim files or pass --force.`);
    process.exit(1);
  }
  const dest = out || path.join('.github', 'prompts', 'minim-pack.prompt.md');
  fs.mkdirSync(path.dirname(path.resolve(root, dest)), { recursive: true });
  fs.writeFileSync(path.resolve(root, dest), md);
  console.log(`wrote ${dest} (~${tokens} tokens). Run it from chat with "/" or attach it.`);
}
```

In `bin/minim.js`, add a case above `default:`:

```js
  case 'pack': {
    const { run } = await import('../src/cli/pack.js');
    run(args);
    break;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/pack.js src/cli/pack.js bin/minim.js test/pack.test.js
git commit -m "feat: context packer builds budget-capped prompt files with memory grep"
```

---

### Task 10: Templates + `minim init` installer

**Files:**
- Create: `templates/copilot-instructions.md`
- Create: `templates/hooks.json`
- Create: `templates/example.instructions.md`
- Create: `templates/settings.json`
- Create: `src/cli/init.js`
- Modify: `bin/minim.js` (add `init` case)
- Test: `test/init.test.js`

**Interfaces:**
- Consumes: templates directory; `checkBudgets` (Task 3) conceptually validated by README workflow.
- Produces: `install(targetRoot: string, pkgRoot: string) -> string[]` (list of written/skipped paths) from `src/cli/init.js`. After init, target repo has: `.github/copilot-instructions.md`, `.github/hooks/minim.json`, `.github/instructions/example.instructions.md`, `.minim/config.json`, `.minim/runtime/` (vendored `src/` + `bin/`), `.vscode/settings.json` (only if absent), `.gitignore` entries.

- [ ] **Step 1: Write the templates**

Create `templates/copilot-instructions.md` (Tier 0 — this text is the product; keep it under 800 tokens so teams have headroom to add their own architecture notes up to the 1500 cap):

```markdown
<!-- minim:begin (managed block — edit above/below, not inside) -->
## Response style

- Be terse in prose. Skip preamble, apologies, restating the question, and summaries of what you just did.
- Never compress code, commit messages, error strings, or security warnings — write those in full.
- Prefer diffs and file references over re-printing whole files.
- On genuinely hard debugging or design questions, reason as much as needed — correctness beats brevity.

## Cost rules

- Do not read or search `node_modules/`, `dist/`, `build/`, lockfiles, or generated code. If you believe you must, ask first.
- Before a broad codebase search, state what you are looking for and ask if the user can point you to the file instead.
- Work within the files the user gives you. Ask before expanding scope.

## Memory protocol

- Project decisions live in `.minim/memory/decisions.md`. When planning non-trivial work, read it first — it replaces re-exploring the codebase.
- When you make or learn a durable decision (architecture choice, constraint, gotcha), emit a single line in your response: `MINIM-NOTE: <the fact>`. Keep it under 20 words. It is saved automatically.
- Do not re-state facts already in `.minim/memory/decisions.md`.
<!-- minim:end -->
```

Create `templates/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      { "type": "command", "command": "node .minim/runtime/bin/minim.js hook SessionStart" }
    ],
    "UserPromptSubmit": [
      { "type": "command", "command": "node .minim/runtime/bin/minim.js hook UserPromptSubmit" }
    ],
    "PreToolUse": [
      { "type": "command", "command": "node .minim/runtime/bin/minim.js hook PreToolUse" }
    ],
    "PostToolUse": [
      { "type": "command", "command": "node .minim/runtime/bin/minim.js hook PostToolUse" }
    ],
    "PreCompact": [
      { "type": "command", "command": "node .minim/runtime/bin/minim.js hook PreCompact" }
    ],
    "Stop": [
      { "type": "command", "command": "node .minim/runtime/bin/minim.js hook Stop" }
    ]
  }
}
```

Create `templates/example.instructions.md` (Tier 1 sample — teams copy and adapt):

```markdown
---
applyTo: "src/**"
---

<!-- Tier 1 memory: loaded ONLY when the agent touches files matching applyTo. -->
<!-- Keep under 800 tokens (run: minim budget). Put subsystem facts here, not style rules. -->

Example subsystem notes (replace with your own):
- Service layer throws `AppError`; controllers never throw raw.
- All DB access goes through `src/db/repo.js` — no inline SQL elsewhere.
```

Create `templates/settings.json`:

```json
{
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/build": true,
    "**/*.min.js": true,
    "**/package-lock.json": true,
    "**/yarn.lock": true,
    "**/pnpm-lock.yaml": true
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `test/init.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../src/cli/init.js';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('init installs config pack and vendors runtime', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  install(root, pkgRoot);
  for (const f of [
    '.github/copilot-instructions.md',
    '.github/hooks/minim.json',
    '.github/instructions/example.instructions.md',
    '.minim/config.json',
    '.minim/runtime/bin/minim.js',
    '.minim/runtime/src/hookrun.js',
    '.vscode/settings.json',
    '.gitignore',
  ]) {
    assert.ok(fs.existsSync(path.join(root, f)), `missing ${f}`);
  }
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /\.minim\/metrics\//);
});

test('init appends managed block to existing copilot-instructions.md without duplicating', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  fs.mkdirSync(path.join(root, '.github'), { recursive: true });
  fs.writeFileSync(path.join(root, '.github', 'copilot-instructions.md'), '# Existing team rules\n');
  install(root, pkgRoot);
  install(root, pkgRoot); // idempotent
  const body = fs.readFileSync(path.join(root, '.github', 'copilot-instructions.md'), 'utf8');
  assert.match(body, /# Existing team rules/);
  assert.equal(body.match(/minim:begin/g).length, 1);
});

test('init leaves existing .vscode/settings.json alone and writes suggestion instead', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  fs.mkdirSync(path.join(root, '.vscode'), { recursive: true });
  fs.writeFileSync(path.join(root, '.vscode', 'settings.json'), '{"editor.tabSize":2}');
  install(root, pkgRoot);
  assert.equal(fs.readFileSync(path.join(root, '.vscode', 'settings.json'), 'utf8'), '{"editor.tabSize":2}');
  assert.ok(fs.existsSync(path.join(root, '.minim', 'suggested-settings.json')));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/init.test.js`
Expected: FAIL — `Cannot find module '../src/cli/init.js'`

- [ ] **Step 4: Write minimal implementation**

Create `src/cli/init.js`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function writeIfAbsent(dest, content, written) {
  if (fs.existsSync(dest)) {
    written.push(`skip  ${dest} (exists)`);
    return false;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
  written.push(`write ${dest}`);
  return true;
}

export function install(targetRoot, pkgRoot) {
  const written = [];
  const tpl = (name) => fs.readFileSync(path.join(pkgRoot, 'templates', name), 'utf8');

  // Tier 0: create, or append managed block if file exists without it.
  const tier0 = path.join(targetRoot, '.github', 'copilot-instructions.md');
  const block = tpl('copilot-instructions.md');
  if (!fs.existsSync(tier0)) {
    writeIfAbsent(tier0, block, written);
  } else if (!fs.readFileSync(tier0, 'utf8').includes('minim:begin')) {
    fs.appendFileSync(tier0, '\n' + block);
    written.push(`append ${tier0} (managed block)`);
  } else {
    written.push(`skip  ${tier0} (managed block present)`);
  }

  writeIfAbsent(path.join(targetRoot, '.github', 'hooks', 'minim.json'), tpl('hooks.json'), written);
  writeIfAbsent(
    path.join(targetRoot, '.github', 'instructions', 'example.instructions.md'),
    tpl('example.instructions.md'),
    written
  );
  writeIfAbsent(
    path.join(targetRoot, '.minim', 'config.json'),
    JSON.stringify(
      {
        guard: { decision: 'ask' },
        memory: { maxAgeDays: 45 },
        pack: { maxTokens: 20000, maxLinesPerFile: 400 },
      },
      null,
      2
    ) + '\n',
    written
  );

  // Vendor runtime so teammates need no npm install.
  const rt = path.join(targetRoot, '.minim', 'runtime');
  fs.rmSync(rt, { recursive: true, force: true });
  fs.mkdirSync(rt, { recursive: true });
  fs.cpSync(path.join(pkgRoot, 'src'), path.join(rt, 'src'), { recursive: true });
  fs.cpSync(path.join(pkgRoot, 'bin'), path.join(rt, 'bin'), { recursive: true });
  written.push(`write ${rt} (vendored runtime)`);

  // Settings: never merge (JSONC risk) — suggest instead.
  const settings = path.join(targetRoot, '.vscode', 'settings.json');
  if (!writeIfAbsent(settings, tpl('settings.json'), written)) {
    writeIfAbsent(path.join(targetRoot, '.minim', 'suggested-settings.json'), tpl('settings.json'), written);
  }

  // .gitignore entries.
  const gi = path.join(targetRoot, '.gitignore');
  const entries = ['.minim/metrics/', '.minim/snapshots/', '.minim/debug/'];
  const existing = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  const missing = entries.filter((e) => !existing.includes(e));
  if (missing.length) {
    fs.appendFileSync(gi, (existing.endsWith('\n') || !existing ? '' : '\n') + missing.join('\n') + '\n');
    written.push(`append ${gi}`);
  }
  return written;
}

export function run() {
  const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  for (const line of install(process.cwd(), pkgRoot)) console.log(line);
  console.log('\nminim init done. Commit .github/ and .minim/ (metrics/snapshots are gitignored).');
  console.log('If .vscode/settings.json existed, merge .minim/suggested-settings.json by hand.');
}
```

In `bin/minim.js`, add a case above `default:`:

```js
  case 'init': {
    const { run } = await import('../src/cli/init.js');
    run(args);
    break;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test`
Expected: PASS (all tests)

- [ ] **Step 6: Smoke-test end to end in a scratch repo**

```bash
cd "$(mktemp -d)" && git init -q
node ~/dev/minim/bin/minim.js init
echo '{"cwd":"'$PWD'","prompt":"#remember smoke test fact","timestamp":"2026-07-30T12:00:00Z"}' \
  | node .minim/runtime/bin/minim.js hook UserPromptSubmit
node .minim/runtime/bin/minim.js mem list
```

Expected: init prints the file list; hook prints `{"continue":true,"systemMessage":"minim remember: saved."}`; `mem list` shows `- [2026-07-30] smoke test fact`.

- [ ] **Step 7: Commit**

```bash
cd ~/dev/minim
git add templates/ src/cli/init.js bin/minim.js test/init.test.js
git commit -m "feat: minim init installs config pack and vendors runtime"
```

---

### Task 11: README + rollout & measurement guide

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything (documentation of the finished tool).
- Produces: nothing consumed by code.

- [ ] **Step 1: Write README.md**

Create `README.md`:

```markdown
# minim — Copilot token-efficiency toolkit

> The least context that works.

Cuts GitHub Copilot (VS Code) token spend under usage-based billing. No MCP, no
network, no LLM calls — deterministic hooks + files only. Works in orgs with
MCP and Copilot memory disabled.

## What it does

| Piece | Mechanism | Saves |
|---|---|---|
| Memory | `MINIM-NOTE:` lines + `#remember` captured to `.minim/memory/decisions.md` via Stop/PreCompact/UserPromptSubmit hooks | Exploration turns (the quadratic cost) |
| Style contract | Managed block in `.github/copilot-instructions.md` | Output tokens (priciest per token) |
| Budgets | `minim budget` + SessionStart warning; Tier 0 ≤ 1500 tok, Tier 1 ≤ 800 tok/file | Cache-prefix bloat paid every request |
| Guard | PreToolUse asks/denies reads of vendored & generated paths | Junk input tokens |
| Metrics | PostToolUse/Stop → `.minim/metrics/*.jsonl`, `minim stats` | Makes savings measurable |
| Packer | `minim pack --task "..." files...` → prompt file with trimmed sources + relevant memory | Replaces 10–20 discovery turns with one |

## Install into a repo

    node /path/to/minim-copilot/bin/minim.js init

Commit `.github/` and `.minim/` (metrics/snapshots/debug are gitignored).
Requires VS Code with agent hooks enabled (Preview) and Node >= 20 on PATH.
Hook payloads are Preview-stage: if a hook misbehaves, set `MINIM_DEBUG=1`,
reproduce, and inspect `.minim/debug/*.json` for the actual schema.

## Memory tiers

- **Tier 0** `.github/copilot-instructions.md` — always in context. It IS the
  prompt-cache prefix: keep it stable, never edit mid-session (any edit
  invalidates the cache and reprocesses at full price).
- **Tier 1** `.github/instructions/*.instructions.md` — glob-scoped, loaded only
  when matching files are touched.
- **Tier 2** `.minim/memory/decisions.md` — on demand: `minim pack` greps it; the
  Tier 0 contract tells the agent to read it when planning.
- **Tier 3** `.minim/archive/` — never loaded. `minim mem compact` moves entries
  older than 45 days here (configurable in `.minim/config.json`).

## Measure it — or you are guessing

Token counts are chars/4 estimates (±15%). Track **tokens per completed task**,
never per session (per-session rewards abandoning work).

Rollout A/B:
1. Baseline 2 weeks: `minim init`, then delete the SessionStart/PreToolUse
   entries from `.github/hooks/minim.json` (keep PostToolUse/Stop) so you get
   metrics ONLY. Record `minim stats`.
2. Restore the full hooks file for 2 weeks. Compare avg transcript
   tokens/session and sessions per shipped PR.
3. Cross-check against the Copilot status dashboard (real credit numbers) and
   per-response hover costs in VS Code.

Monthly chore: `minim mem compact && minim budget`.

## Habits the tool can't do for you

- New chat per task; `/compact` on long sessions; `/fork` to branch context.
- Don't idle mid-session — prompt cache retention is minutes; cold resume
  reprocesses the whole prefix at full price.
- Route easy tasks to cheap models (nano/mini); premium models for design and
  debugging only.
- Inline completions and next-edit suggestions are free — push routine edits there.
```

- [ ] **Step 2: Verify full suite still green**

Run: `node --test`
Expected: PASS (all tests)

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README with rollout and measurement guide"
```
