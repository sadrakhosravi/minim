# minim TypeScript Workspace + VS Code Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert minim from a single-package JavaScript CLI into a TypeScript npm workspace, and add a VS Code extension that contributes two agent-callable language model tools (`minim_memory`, `minim_remember`) so Copilot's agent queries project memory through a real interface instead of being asked in prose to read a file.

**Architecture:** Three workspace packages. `packages/core` holds pure TypeScript with no `vscode` import and no ambient state — every function takes `root: string` explicitly and every dated function takes `dateIso: string`. `packages/cli` owns stdin/stdout, exit codes and `cwd` resolution, and bundles `core` into a single ESM file that `minim init` vendors into consumer repos. `packages/extension` owns the `vscode` API and bundles `core` into a single CJS file. Both consumers *bundle* core rather than depend on it, because core is a private workspace package that must never appear as an unresolvable dependency of a published artifact.

**Tech Stack:** TypeScript 5.8+ (for `erasableSyntaxOnly`), Node 24 for development (native type stripping) and Node 20 floor for published artifacts, esbuild for bundling, `node:test` + `node:assert/strict` for tests, `@vscode/vsce` for VSIX packaging, `@vscode/test-electron` for one extension smoke test.

**Spec:** `docs/superpowers/specs/2026-07-30-minim-ts-vscode-extension-design.md`

## Global Constraints

- **Zero runtime dependencies.** Both published artifacts are self-contained JavaScript trees. devDependencies are now permitted: `typescript`, `esbuild`, `@types/node`, `@types/vscode`, `@vscode/vsce`, `@vscode/test-electron`.
- **Development requires Node ≥ 24.** Tests run directly against `.ts` files using native type stripping, no build step. On Node 22.18–23.5 add `--experimental-strip-types`; on Node 20 TypeScript tests cannot run at all.
- **Published artifacts keep `"engines": { "node": ">=20" }`.** Consumers run compiled JavaScript.
- **`erasableSyntaxOnly: true`.** No enums, no namespaces, no parameter properties, no `declare` fields. Type stripping requires it.
- **Relative imports use explicit `.ts` extensions** (`import { estimateTokens } from './tokens.ts'`). Node's type stripping does not resolve `.js` to `.ts`. This requires `allowImportingTsExtensions: true`, which in turn requires `noEmit: true` — correct here, because esbuild does all emitting and `tsc` is typecheck-only.
- **`core` imports neither `vscode` nor anything ambient.** No `process.cwd()`, no `process.env`, no `Date.now()`, no argless `new Date()`.
- **Every hook invocation exits 0 and writes valid JSON to stdout**, at minimum `{"continue":true}`. minim never uses exit code 2.
- **Token estimation stays `ceil(chars / 4)`.** A real tokenizer is deferred to the measurement spec.
- Budget caps, exact: Tier 0 = `1500` tokens, Tier 1 = `800` tokens per file, `minim pack` output = `20000` tokens.
- `searchMemory` defaults, exact: `limit = 20`, `maxTokens = 800`. `buildPack` passes `Infinity` for both.
- Memory entry line format, exact: `- [YYYY-MM-DD] <fact text>` — one line per fact, no wrapping.
- Markers, exact strings: `MINIM-NOTE:` (transcript extraction) and `#remember` (prompt capture).
- Memory archive age, exact: `45` days. Pack line trim, exact: `400` lines per file.
- Hook payload fields are snake_case (`timestamp`, `hook_event_name`, `cwd`, `session_id`, `transcript_path`); camelCase tolerance is retained because the format is Preview-stage and VS Code rewrites Copilot CLI event names.
- Extension manifest requires `"engines": { "vscode": "^1.109.0" }` — the release that introduced agent hooks, which minim already requires.
- LM tool names, exact: `minim_memory` and `minim_remember`; reference names `minimMemory` and `minimRemember`. The `name` in `package.json` must match the first argument to `vscode.lm.registerTool` exactly.
- All tests create fixtures in `fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'))`.
- Work on branch `feat/ts-workspace-extension`, which already exists and holds the spec commit.

## File Structure

**Deleted at the end of Task 19** (superseded, kept working until then): `src/`, `bin/`, `test/`, `templates/` at repo root.

| File | Responsibility |
|---|---|
| `package.json` | Workspace root. Private, `workspaces: ["packages/*"]`, scripts for typecheck/test/build/bench. |
| `tsconfig.base.json` | Compiler options only. Every package extends it. |
| `tsconfig.json` | Root typecheck target. Extends base, includes all package `src` and `test`. |
| `packages/core/src/tokens.ts` | `estimateTokens`. |
| `packages/core/src/extract.ts` | `extractNotes` — `MINIM-NOTE:` scraping. |
| `packages/core/src/config.ts` | `loadConfig` and defaults. |
| `packages/core/src/memory.ts` | `memPath`, `appendFacts`, `compactMemory`. |
| `packages/core/src/search.ts` | `searchMemory` — shared by `buildPack` and the `minim_memory` tool. |
| `packages/core/src/budget.ts` | `TIER0_CAP`, `TIER1_CAP`, `checkBudgets`. |
| `packages/core/src/metrics.ts` | `appendMetric`, `readMetrics`. |
| `packages/core/src/pack.ts` | `buildPack`. |
| `packages/core/src/summarize.ts` | `summarize` — metrics aggregation, shared by `minim stats` and the extension command. |
| `packages/core/src/render.ts` | `renderSearchResult` — the exact text the `minim_memory` tool hands the model. |
| `packages/core/src/budgetsummary.ts` | `summarizeBudget`, `formatTokens` — status bar and diagnostics arithmetic. |
| `packages/core/src/types.ts` | Hook payload interfaces and the typed `pick` helper. |
| `packages/core/src/root.ts` | `resolveRoot` — pure workspace-folder selection policy, no `vscode`. |
| `packages/core/src/install.ts` | `install` — writes the config pack. Called by both the CLI and the extension, so it takes explicit asset directories rather than guessing a package root. |
| `packages/cli/bin/minim.js` | Two-line shim into `dist/minim.js`. Path referenced by `hooks.json`; must not move. |
| `packages/cli/src/hookio.ts` | `readStdinJson`, `respond`. |
| `packages/cli/src/hookrun.ts` | Event dispatch, `MINIM_DEBUG` payload dumping, error containment. |
| `packages/cli/src/hooks/*.ts` | Six thin adapters, one per wired hook event. |
| `packages/cli/src/cli/*.ts` | Five command adapters: `budget`, `stats`, `mem`, `pack`, `init`. |
| `packages/cli/src/main.ts` | Command switch. esbuild entry point. |
| `packages/cli/templates/*` | Config pack shipped to consumer repos. Moved from repo root. |
| `packages/extension/package.json` | VS Code manifest: `contributes.languageModelTools`, commands, activation. |
| `packages/extension/src/extension.ts` | Activation, registration, disposal. |
| `packages/extension/src/log.ts` | Output channel. Every failure path reports here. |
| `packages/extension/src/workspace.ts` | `vscode` glue over `resolveRoot`. |
| `packages/extension/src/watch.ts` | File watcher driving status bar and diagnostics refresh. |
| `packages/extension/src/tools/memory.ts` | `minim_memory` adapter. |
| `packages/extension/src/tools/remember.ts` | `minim_remember` adapter. |
| `packages/extension/src/statusbar.ts` | Tier 0+1 fixed-cost indicator. |
| `packages/extension/src/diagnostics.ts` | Budget overages as Problems-panel warnings. |
| `packages/extension/src/commands.ts` | Six command implementations. |
| `scripts/bench-hook.mjs` | Cold-start benchmark. Guards against regressing the measured 23ms baseline. |
| `.github/workflows/ci.yml` | typecheck, test on 24, compat smoke on 20, VSIX artifact. |
| `LICENSE` | MIT. `package.json` has claimed MIT since v0.1.0 with no file present. |

---

### Task 1: Workspace scaffold, TypeScript config, and the `tokens` port

Proves the whole toolchain before any real porting: workspaces resolve, `tsc` typechecks, and `node --test` runs raw `.ts`.

**Files:**
- Create: `package.json` (replaces the existing root `package.json`)
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`
- Create: `packages/core/package.json`
- Create: `packages/core/src/tokens.ts`
- Test: `packages/core/test/tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `estimateTokens(text: string): number` from `packages/core/src/tokens.ts`. Every later task imports it.

- [ ] **Step 1: Install devDependencies and create the workspace root**

```bash
git checkout feat/ts-workspace-extension
mkdir -p packages/core/src packages/core/test scripts
```

Replace the root `package.json` entirely:

```json
{
  "name": "minim-workspace",
  "version": "0.2.0",
  "description": "Token-efficiency toolkit for GitHub Copilot in VS Code",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "engines": { "node": ">=24" },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "node --test \"packages/*/test/*.test.ts\"",
    "build": "npm run build --workspaces --if-present",
    "bench": "node scripts/bench-hook.mjs"
  },
  "license": "MIT"
}
```

Note `"typecheck": "tsc -p tsconfig.json"` carries no `--noEmit` flag because `noEmit` is set in the config file itself.

- [ ] **Step 2: Create the TypeScript configuration**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`noUncheckedIndexedAccess` is deliberately omitted. It would turn every regex capture group and array index in the ported code into a `T | undefined` narrowing exercise, converting a mechanical port into a rewrite. Enabling it is a reasonable later cleanup, not part of this migration.

Create `tsconfig.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "include": ["packages/*/src/**/*.ts", "packages/*/test/**/*.ts"]
}
```

`scripts/**/*.mjs` is deliberately excluded. Including plain JavaScript without `allowJs: true` fails with `TS6504: File is a JavaScript file. Did you mean to enable the 'allowJs' option?`, and enabling `allowJs` just to lint two build scripts is not worth the config surface.

- [ ] **Step 3: Install the toolchain**

```bash
npm install --save-dev typescript@^5.8.0 @types/node@^22.0.0
```

Verify the TypeScript version supports `erasableSyntaxOnly` (5.8+):

```bash
npx tsc --version
```

Expected: `Version 5.8.x` or higher.

- [ ] **Step 4: Create the core package manifest**

Create `packages/core/package.json`:

```json
{
  "name": "@minim/core",
  "version": "0.2.0",
  "description": "Pure token-efficiency logic. Bundled into consumers, never published.",
  "private": true,
  "type": "module",
  "license": "MIT"
}
```

- [ ] **Step 5: Write the failing test**

Create `packages/core/test/tokens.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens } from '../src/tokens.ts';

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
  assert.equal(estimateTokens(null as unknown as string), 0);
  assert.equal(estimateTokens(undefined as unknown as string), 0);
  assert.equal(estimateTokens(42 as unknown as string), 0);
});
```

The `as unknown as string` casts are deliberate. The runtime guard exists because hook payloads are untrusted JSON, so the test must be able to pass values the type forbids.

- [ ] **Step 6: Run the test to verify it fails**

```bash
node --test packages/core/test/tokens.test.ts
```

Expected: FAIL — `Cannot find module '.../packages/core/src/tokens.ts'`

- [ ] **Step 7: Write the minimal implementation**

Create `packages/core/src/tokens.ts`:

```ts
// Heuristic token estimator: ~4 chars per token, ±15%. Good enough for budgets.
export function estimateTokens(text: string): number {
  if (typeof text !== 'string' || text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
node --test packages/core/test/tokens.test.ts
npm run typecheck
```

Expected: 4 tests pass; typecheck clean.

If the test run fails with `Unknown file extension ".ts"`, the Node version is below 23.6 — check `node --version` and either upgrade or add `--experimental-strip-types`.

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.base.json tsconfig.json packages/core
git commit -m "build: TypeScript workspace scaffold with tokens port"
```

---

### Task 2: Port `extract` and `config`

Two leaf modules with no internal dependencies. Grouped because neither is independently rejectable — both are pure ports whose tests already exist.

**Files:**
- Create: `packages/core/src/extract.ts`
- Create: `packages/core/src/config.ts`
- Test: `packages/core/test/extract.test.ts`
- Test: `packages/core/test/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `extractNotes(text: string): string[]` from `packages/core/src/extract.ts`.
  - `MinimConfig` interface and `loadConfig(root: string): MinimConfig` from `packages/core/src/config.ts`, where `MinimConfig` is `{ guard: { denyPatterns: string[], decision: 'ask' | 'deny' }, memory: { maxAgeDays: number }, pack: { maxTokens: number, maxLinesPerFile: number } }`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/extract.test.ts`:

```ts
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
```

Create `packages/core/test/config.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.ts';

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
}

test('missing config returns defaults', () => {
  const c = loadConfig(tmpRepo());
  assert.equal(c.guard.decision, 'ask');
  assert.equal(c.memory.maxAgeDays, 45);
  assert.equal(c.pack.maxTokens, 20000);
  assert.equal(c.pack.maxLinesPerFile, 400);
  assert.ok(c.guard.denyPatterns.includes('node_modules/'));
});

test('malformed config falls back to defaults', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.minim'), { recursive: true });
  fs.writeFileSync(path.join(root, '.minim', 'config.json'), '{ not json');
  assert.equal(loadConfig(root).memory.maxAgeDays, 45);
});

test('user config overrides per section without dropping siblings', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.minim'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.minim', 'config.json'),
    JSON.stringify({ guard: { decision: 'deny' }, memory: { maxAgeDays: 10 } })
  );
  const c = loadConfig(root);
  assert.equal(c.guard.decision, 'deny');
  assert.equal(c.memory.maxAgeDays, 10);
  assert.ok(c.guard.denyPatterns.includes('dist/'));
  assert.equal(c.pack.maxTokens, 20000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test packages/core/test/extract.test.ts packages/core/test/config.test.ts
```

Expected: FAIL — `Cannot find module '.../src/extract.ts'`

- [ ] **Step 3: Write the implementations**

Create `packages/core/src/extract.ts`:

```ts
const NOTE_RE = /^.*?MINIM-NOTE:[ \t]*(.+)$/gm;

export function extractNotes(text: string): string[] {
  const out: string[] = [];
  if (typeof text !== 'string') return out;
  for (const m of text.matchAll(NOTE_RE)) {
    const fact = m[1].trim();
    if (fact && !out.includes(fact)) out.push(fact);
  }
  return out;
}
```

Create `packages/core/src/config.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';

export interface GuardConfig {
  denyPatterns: string[];
  decision: 'ask' | 'deny';
}

export interface MinimConfig {
  guard: GuardConfig;
  memory: { maxAgeDays: number };
  pack: { maxTokens: number; maxLinesPerFile: number };
}

const DEFAULTS: MinimConfig = {
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

export function loadConfig(root: string): MinimConfig {
  const p = path.join(root, '.minim', 'config.json');
  let user: Partial<MinimConfig> = {};
  try {
    user = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<MinimConfig>;
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

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test && npm run typecheck
```

Expected: 11 tests pass (4 tokens + 4 extract + 3 config); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/extract.ts packages/core/src/config.ts packages/core/test/extract.test.ts packages/core/test/config.test.ts
git commit -m "refactor: port extract and config to TypeScript"
```

---

### Task 3: Port `memory`

**Files:**
- Create: `packages/core/src/memory.ts`
- Test: `packages/core/test/memory.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, from `packages/core/src/memory.ts`:
  - `memPath(root: string): string` — returns `<root>/.minim/memory/decisions.md`.
  - `appendFacts(root: string, facts: string[], dateIso: string): number` — returns the count of newly written facts, deduping against existing file content.
  - `compactMemory(root: string, maxAgeDays: number, todayIso: string): { kept: number, archived: number }`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/memory.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendFacts, compactMemory, memPath } from '../src/memory.ts';

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
}

test('appends facts as dated lines, creating dirs', () => {
  const root = tmpRepo();
  const n = appendFacts(root, ['fact one', 'fact two'], '2026-07-30');
  assert.equal(n, 2);
  assert.equal(
    fs.readFileSync(memPath(root), 'utf8'),
    '- [2026-07-30] fact one\n- [2026-07-30] fact two\n'
  );
});

test('dedupes against existing file content', () => {
  const root = tmpRepo();
  appendFacts(root, ['fact one'], '2026-07-29');
  const n = appendFacts(root, ['fact one', 'fact two'], '2026-07-30');
  assert.equal(n, 1);
  assert.equal(
    fs.readFileSync(memPath(root), 'utf8'),
    '- [2026-07-29] fact one\n- [2026-07-30] fact two\n'
  );
});

test('empty fact list writes nothing', () => {
  const root = tmpRepo();
  assert.equal(appendFacts(root, [], '2026-07-30'), 0);
  assert.equal(fs.existsSync(memPath(root)), false);
});

test('moves entries older than maxAgeDays to archive', () => {
  const root = tmpRepo();
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
  assert.deepEqual(compactMemory(tmpRepo(), 45, '2026-07-30'), { kept: 0, archived: 0 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test packages/core/test/memory.test.ts
```

Expected: FAIL — `Cannot find module '.../src/memory.ts'`

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/memory.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';

export interface CompactResult {
  kept: number;
  archived: number;
}

export function memPath(root: string): string {
  return path.join(root, '.minim', 'memory', 'decisions.md');
}

export function appendFacts(root: string, facts: string[], dateIso: string): number {
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

export function compactMemory(
  root: string,
  maxAgeDays: number,
  todayIso: string
): CompactResult {
  const p = memPath(root);
  if (!fs.existsSync(p)) return { kept: 0, archived: 0 };
  const cutoff = new Date(todayIso).getTime() - maxAgeDays * 86400000;
  const keep: string[] = [];
  const old: string[] = [];
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

`appendFacts` deliberately dedupes with `existing.includes()` on the raw file text rather than parsing lines. That is what makes the `minim_remember` tool and the `Stop` transcript scrape safe to overlap in Task 16 — no coordination between them is needed.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test && npm run typecheck
```

Expected: 16 tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/memory.ts packages/core/test/memory.test.ts
git commit -m "refactor: port memory store to TypeScript"
```

---

### Task 4: `searchMemory` — new shared search with token cap

The only genuinely new core logic in the migration. The relevance grep currently lives as a private `relevantMemory()` inside `pack.js`; the `minim_memory` tool in Task 15 needs identical matching. Extract it once with caps that the tool uses and `buildPack` opts out of.

**Files:**
- Create: `packages/core/src/search.ts`
- Test: `packages/core/test/search.test.ts`

**Interfaces:**
- Consumes: `memPath` (Task 3), `estimateTokens` (Task 1).
- Produces, from `packages/core/src/search.ts`:
  - `MemoryHit` = `{ date: string, fact: string, line: string }`. `date` is `''` for lines that do not match the dated format.
  - `SearchOptions` = `{ limit?: number, maxTokens?: number }`, defaults `20` and `800`.
  - `SearchResult` = `{ hits: MemoryHit[], truncated: number }`.
  - `searchMemory(root: string, query: string, opts?: SearchOptions): SearchResult`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/search.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendFacts } from '../src/memory.ts';
import { searchMemory } from '../src/search.ts';

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
}

test('no memory file yields no hits', () => {
  assert.deepEqual(searchMemory(tmpRepo(), 'login'), { hits: [], truncated: 0 });
});

test('matches lines containing any query word longer than three chars', () => {
  const root = tmpRepo();
  appendFacts(root, ['login uses OAuth device flow', 'db is postgres'], '2026-07-01');
  const r = searchMemory(root, 'fix login bug');
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].fact, 'login uses OAuth device flow');
  assert.equal(r.hits[0].date, '2026-07-01');
  assert.equal(r.truncated, 0);
});

test('query of only short words matches nothing', () => {
  const root = tmpRepo();
  appendFacts(root, ['login uses OAuth device flow'], '2026-07-01');
  assert.deepEqual(searchMemory(root, 'is a of'), { hits: [], truncated: 0 });
});

test('limit caps hit count and reports the remainder', () => {
  const root = tmpRepo();
  appendFacts(
    root,
    Array.from({ length: 10 }, (_, i) => `payments fact number ${i}`),
    '2026-07-01'
  );
  const r = searchMemory(root, 'payments', { limit: 3 });
  assert.equal(r.hits.length, 3);
  assert.equal(r.truncated, 7);
});

test('token cap trims hits and reports the remainder', () => {
  const root = tmpRepo();
  // Each fact is ~40 chars => ~10 tokens per line.
  appendFacts(
    root,
    Array.from({ length: 10 }, (_, i) => `payments detail ${i} ${'x'.repeat(20)}`),
    '2026-07-01'
  );
  const r = searchMemory(root, 'payments', { limit: 100, maxTokens: 30 });
  assert.ok(r.hits.length > 0, 'expected at least one hit under the cap');
  assert.ok(r.hits.length < 10, 'expected the token cap to trim hits');
  assert.equal(r.hits.length + r.truncated, 10);
});

test('Infinity caps return everything', () => {
  const root = tmpRepo();
  appendFacts(
    root,
    Array.from({ length: 30 }, (_, i) => `payments fact ${i}`),
    '2026-07-01'
  );
  const r = searchMemory(root, 'payments', { limit: Infinity, maxTokens: Infinity });
  assert.equal(r.hits.length, 30);
  assert.equal(r.truncated, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test packages/core/test/search.test.ts
```

Expected: FAIL — `Cannot find module '.../src/search.ts'`

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/search.ts`:

```ts
import fs from 'node:fs';
import { memPath } from './memory.ts';
import { estimateTokens } from './tokens.ts';

export interface MemoryHit {
  date: string;
  fact: string;
  line: string;
}

export interface SearchOptions {
  limit?: number;
  maxTokens?: number;
}

export interface SearchResult {
  hits: MemoryHit[];
  truncated: number;
}

const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_TOKENS = 800;

function parseLine(line: string): MemoryHit {
  const m = line.match(/^- \[(\d{4}-\d{2}-\d{2})\] (.*)$/);
  if (m) return { date: m[1], fact: m[2].trim(), line };
  return { date: '', fact: line.replace(/^-\s*/, '').trim(), line };
}

export function searchMemory(
  root: string,
  query: string,
  opts: SearchOptions = {}
): SearchResult {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const p = memPath(root);
  if (!fs.existsSync(p)) return { hits: [], truncated: 0 };

  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  if (words.length === 0) return { hits: [], truncated: 0 };

  const matched = fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter((line) => {
      if (!line.trim()) return false;
      const l = line.toLowerCase();
      return words.some((w) => l.includes(w));
    });

  const hits: MemoryHit[] = [];
  let spent = 0;
  for (const line of matched) {
    if (hits.length >= limit) break;
    const cost = estimateTokens(line + '\n');
    if (hits.length > 0 && spent + cost > maxTokens) break;
    hits.push(parseLine(line));
    spent += cost;
  }
  return { hits, truncated: matched.length - hits.length };
}
```

The `hits.length > 0` guard in the token check guarantees at least one hit is always returned when something matched. A cap smaller than a single line would otherwise return nothing and read to the model as "no memory exists", which is a different and misleading answer.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test && npm run typecheck
```

Expected: 22 tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/search.ts packages/core/test/search.test.ts
git commit -m "feat: shared memory search with hit and token caps"
```

---

### Task 5: Port `budget` and `metrics`

**Files:**
- Create: `packages/core/src/budget.ts`
- Create: `packages/core/src/metrics.ts`
- Test: `packages/core/test/budget.test.ts`
- Test: `packages/core/test/metrics.test.ts`

**Interfaces:**
- Consumes: `estimateTokens` (Task 1).
- Produces:
  - From `packages/core/src/budget.ts`: `TIER0_CAP = 1500`, `TIER1_CAP = 800`, `BudgetEntry` = `{ path: string, tokens: number, cap: number, over: boolean }`, `checkBudgets(root: string): BudgetEntry[]`.
  - From `packages/core/src/metrics.ts`: `MetricRecord` = `{ ts: string, [key: string]: unknown }`, `appendMetric(root: string, obj: MetricRecord): void`, `readMetrics(root: string): MetricRecord[]`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/budget.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkBudgets, TIER0_CAP, TIER1_CAP } from '../src/budget.ts';

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
}

test('caps hold their documented values', () => {
  assert.equal(TIER0_CAP, 1500);
  assert.equal(TIER1_CAP, 800);
});

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

test('non-instruction files in the tier 1 dir are ignored', () => {
  const root = tmpRepo();
  const dir = path.join(root, '.github', 'instructions');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'README.md'), 'x'.repeat(10000));
  assert.deepEqual(checkBudgets(root), []);
});
```

Create `packages/core/test/metrics.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendMetric, readMetrics } from '../src/metrics.ts';

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
}

test('appendMetric writes JSONL into a month file and readMetrics reads it back', () => {
  const root = tmpRepo();
  appendMetric(root, { ts: '2026-07-30T10:00:00Z', event: 'tool', tool: 'readFile' });
  appendMetric(root, { ts: '2026-07-30T10:01:00Z', event: 'tool', tool: 'search' });
  const file = path.join(root, '.minim', 'metrics', '2026-07.jsonl');
  assert.equal(fs.readFileSync(file, 'utf8').trim().split('\n').length, 2);
  assert.equal(readMetrics(root).length, 2);
});

test('records split across month files and read back sorted', () => {
  const root = tmpRepo();
  appendMetric(root, { ts: '2026-08-01T00:00:00Z', event: 'tool', tool: 'b' });
  appendMetric(root, { ts: '2026-07-01T00:00:00Z', event: 'tool', tool: 'a' });
  const recs = readMetrics(root);
  assert.equal(recs.length, 2);
  assert.equal(recs[0].tool, 'a');
});

test('corrupt lines are skipped, not fatal', () => {
  const root = tmpRepo();
  const dir = path.join(root, '.minim', 'metrics');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '2026-07.jsonl'), '{"ts":"a"}\nnot-json\n{"ts":"b"}\n');
  assert.equal(readMetrics(root).length, 2);
});

test('missing metrics dir yields empty array', () => {
  assert.deepEqual(readMetrics(tmpRepo()), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test packages/core/test/budget.test.ts packages/core/test/metrics.test.ts
```

Expected: FAIL — `Cannot find module '.../src/budget.ts'`

- [ ] **Step 3: Write the implementations**

Create `packages/core/src/budget.ts`:

```ts
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { estimateTokens } from './tokens.ts';

export const TIER0_CAP = 1500;
export const TIER1_CAP = 800;

export interface BudgetEntry {
  path: string;
  tokens: number;
  cap: number;
  over: boolean;
}

function checkFile(path: string, cap: number): BudgetEntry {
  const tokens = estimateTokens(readFileSync(path, 'utf8'));
  return { path, tokens, cap, over: tokens > cap };
}

export function checkBudgets(root: string): BudgetEntry[] {
  const report: BudgetEntry[] = [];
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

Create `packages/core/src/metrics.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';

export interface MetricRecord {
  ts: string;
  [key: string]: unknown;
}

export function appendMetric(root: string, obj: MetricRecord): void {
  const dir = path.join(root, '.minim', 'metrics');
  fs.mkdirSync(dir, { recursive: true });
  const month = obj.ts.slice(0, 7);
  fs.appendFileSync(path.join(dir, `${month}.jsonl`), JSON.stringify(obj) + '\n');
}

export function readMetrics(root: string): MetricRecord[] {
  const dir = path.join(root, '.minim', 'metrics');
  if (!fs.existsSync(dir)) return [];
  const out: MetricRecord[] = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as MetricRecord);
      } catch {
        /* skip corrupt lines */
      }
    }
  }
  return out;
}
```

`appendMetric` now requires `ts` on the record type rather than defaulting it with `new Date()`. That is what makes the module comply with the no-ambient-state rule; callers in `packages/cli` supply the timestamp from the hook payload.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test && npm run typecheck
```

Expected: 31 tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/budget.ts packages/core/src/metrics.ts packages/core/test/budget.test.ts packages/core/test/metrics.test.ts
git commit -m "refactor: port budget and metrics to TypeScript"
```

---

### Task 6: Port `pack` on top of `searchMemory`

`buildPack` must produce byte-identical output to v0.1.0. Piece A of the spec claims no behavior change; this task is where that claim is verified.

**Files:**
- Create: `packages/core/src/pack.ts`
- Test: `packages/core/test/pack.test.ts`

**Interfaces:**
- Consumes: `estimateTokens` (Task 1), `searchMemory` (Task 4).
- Produces, from `packages/core/src/pack.ts`: `PackInput` = `{ task: string, files: string[], root: string, maxLinesPerFile?: number }`, `PackOutput` = `{ md: string, tokens: number }`, `buildPack(input: PackInput): PackOutput`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/pack.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPack } from '../src/pack.ts';
import { appendFacts } from '../src/memory.ts';

function repo(): string {
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

test('pack ignores the search token cap so large memories still land in full', () => {
  const root = repo();
  appendFacts(
    root,
    Array.from({ length: 40 }, (_, i) => `payments constraint number ${i}`),
    '2026-07-01'
  );
  const { md } = buildPack({ task: 'payments work', files: ['src/auth.js'], root });
  assert.match(md, /payments constraint number 0/);
  assert.match(md, /payments constraint number 39/);
});

test('no matching memory omits the prior decisions section entirely', () => {
  const root = repo();
  appendFacts(root, ['db is postgres'], '2026-07-01');
  const { md } = buildPack({ task: 'unrelated frontend work', files: ['src/auth.js'], root });
  assert.doesNotMatch(md, /Prior decisions/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test packages/core/test/pack.test.ts
```

Expected: FAIL — `Cannot find module '.../src/pack.ts'`

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/pack.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { estimateTokens } from './tokens.ts';
import { searchMemory } from './search.ts';

export interface PackInput {
  task: string;
  files: string[];
  root: string;
  maxLinesPerFile?: number;
}

export interface PackOutput {
  md: string;
  tokens: number;
}

export function buildPack({ task, files, root, maxLinesPerFile = 400 }: PackInput): PackOutput {
  const sections: string[] = [];
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
  // Caps are the LM tool's concern. Pack reproduces v0.1.0 output exactly.
  const mem = searchMemory(root, task, { limit: Infinity, maxTokens: Infinity }).hits;
  const md = [
    '---\nmode: agent\n---',
    `# Task\n\n${task}`,
    mem.length ? `# Prior decisions\n\n${mem.map((h) => h.line).join('\n')}` : '',
    `# Files\n\n${sections.join('\n\n')}`,
    '# Rules\n\nWork only within the files above. Ask before reading anything else. Emit `MINIM-NOTE: <fact>` for any decision worth remembering.',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { md, tokens: estimateTokens(md) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test && npm run typecheck
```

Expected: 36 tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pack.ts packages/core/test/pack.test.ts
git commit -m "refactor: port pack to TypeScript over shared memory search"
```

---

### Task 7: Hook payload types, `pick`, and `resolveRoot`

Two small pure modules that later packages both depend on. `types.ts` is the structural fix for the field-name guessing in v0.1.0; `root.ts` is the workspace-selection policy the extension needs, kept out of the extension so it can be tested without a `vscode` runtime.

**Files:**
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/root.ts`
- Test: `packages/core/test/types.test.ts`
- Test: `packages/core/test/root.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - From `packages/core/src/types.ts`: `HookInputBase`, `PreToolUseInput`, `PostToolUseInput`, `UserPromptSubmitInput`, `HookOutput`, `PermissionDecision`, and `pick<T>(input: unknown, ...names: string[]): T | undefined`.
  - From `packages/core/src/root.ts`: `resolveRoot(folders: readonly string[], activeFile?: string): string | undefined`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/types.test.ts`:

```ts
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
```

Create `packages/core/test/root.test.ts`:

```ts
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
  assert.equal(resolveRoot(['/repo', '/repo/packages/core'], '/repo/packages/core/src/x.ts'), '/repo/packages/core');
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test packages/core/test/types.test.ts packages/core/test/root.test.ts
```

Expected: FAIL — `Cannot find module '.../src/types.ts'`

- [ ] **Step 3: Write the implementations**

Create `packages/core/src/types.ts`:

```ts
// Hook payload shapes as documented by VS Code. Top-level fields are snake_case;
// camelCase tolerance is retained because the format is Preview-stage and VS Code
// rewrites Copilot CLI event names when importing their configs.
export interface HookInputBase {
  timestamp: string;
  hook_event_name: string;
  cwd?: string;
  session_id?: string;
  /** Documented as NOT a stable API. Treated as a fallback source only. */
  transcript_path?: string;
}

export interface PreToolUseInput extends HookInputBase {
  tool_name?: string;
  tool_input?: unknown;
}

export interface PostToolUseInput extends PreToolUseInput {
  tool_output?: unknown;
}

export interface UserPromptSubmitInput extends HookInputBase {
  prompt?: string;
}

export type PermissionDecision = 'allow' | 'ask' | 'deny';

export interface HookOutput {
  continue?: boolean;
  stopReason?: string;
  systemMessage?: string;
  hookSpecificOutput?: {
    permissionDecision?: PermissionDecision;
    permissionDecisionReason?: string;
  };
}

/** First defined key wins. Payloads are untrusted JSON, so the input is `unknown`. */
export function pick<T>(input: unknown, ...names: string[]): T | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const rec = input as Record<string, unknown>;
  for (const n of names) {
    if (rec[n] !== undefined) return rec[n] as T;
  }
  return undefined;
}
```

Create `packages/core/src/root.ts`:

```ts
import path from 'node:path';

function contains(folder: string, file: string): boolean {
  const rel = path.relative(folder, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Workspace-folder selection policy. Most specific containing folder wins,
 * then the first folder, then nothing. Kept free of `vscode` so it is testable
 * with plain node:test.
 */
export function resolveRoot(
  folders: readonly string[],
  activeFile?: string
): string | undefined {
  if (folders.length === 0) return undefined;
  if (activeFile) {
    const matches = folders.filter((f) => contains(f, activeFile));
    if (matches.length > 0) {
      return matches.reduce((best, f) => (f.length > best.length ? f : best));
    }
  }
  return folders[0];
}
```

`contains` uses `path.relative` rather than `startsWith`, which is why `/repo-other` does not swallow a file in `/repo`. That test exists because the string-prefix version is the obvious wrong implementation.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test && npm run typecheck
```

Expected: 47 tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/root.ts packages/core/test/types.test.ts packages/core/test/root.test.ts
git commit -m "feat: typed hook payloads and workspace root resolution policy"
```

---

### Task 8: CLI package, bundling, and the hook dispatcher

Establishes the build story: esbuild bundles `core` into one ESM file, `bin/minim.js` is a shim, and CLI tests are integration tests that run the built binary. The `bin/minim.js` path is referenced by `hooks.json` in every consumer repo and must not move.

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/bin/minim.js`
- Create: `packages/cli/src/hookio.ts`
- Create: `packages/cli/src/hookrun.ts`
- Create: `packages/cli/src/main.ts`
- Modify: `package.json` (root — build before test)
- Test: `packages/cli/test/hookrun.test.ts`

**Interfaces:**
- Consumes: `pick`, `HookOutput` (Task 7).
- Produces:
  - From `packages/cli/src/hookio.ts`: `readStdinJson(): Promise<unknown>`, `respond(obj?: HookOutput): void`.
  - From `packages/cli/src/hookrun.ts`: `HookHandler` = `(input: unknown) => Promise<HookOutput | undefined>`, a mutable `handlers: Partial<Record<string, HookHandler>>` registry, and `run(event: string): Promise<void>`. Tasks 9 and 10 add entries to `handlers`.
  - `packages/cli/dist/minim.js`, the bundled entry that Task 12 vendors into consumer repos.

- [ ] **Step 1: Create the package and install esbuild**

```bash
mkdir -p packages/cli/src/hooks packages/cli/src/cli packages/cli/bin packages/cli/test
npm install --save-dev esbuild@^0.24.0
```

Create `packages/cli/package.json`:

```json
{
  "name": "minim-copilot",
  "version": "0.2.0",
  "description": "Token-efficiency toolkit for GitHub Copilot in VS Code: memory, budgets, guards, metrics",
  "type": "module",
  "bin": { "minim": "bin/minim.js" },
  "files": ["bin", "dist", "templates"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "esbuild src/main.ts --bundle --platform=node --format=esm --target=node20 --outfile=dist/minim.js"
  },
  "license": "MIT"
}
```

`engines` stays at `>=20` here even though development needs 24 — this manifest describes the *published* artifact, which is compiled JavaScript.

- [ ] **Step 2: Make the root test script build first**

CLI tests exercise the bundled output, so the bundle must exist. In the root `package.json`, change the `test` script:

```json
"test": "npm run build --workspaces --if-present && node --test \"packages/*/test/*.test.ts\""
```

esbuild takes tens of milliseconds, so this does not meaningfully slow the loop.

- [ ] **Step 3: Write the failing test**

Create `packages/cli/test/hookrun.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/minim.js', import.meta.url));

export function runCli(args: string[], input = ''): string {
  return execFileSync(process.execPath, [CLI, ...args], { input, encoding: 'utf8' });
}

test('unknown hook event responds with continue:true and exits 0', () => {
  const out = runCli(['hook', 'Nope'], JSON.stringify({ hook_event_name: 'Nope' }));
  assert.deepEqual(JSON.parse(out), { continue: true });
});

test('malformed stdin JSON still responds with continue:true', () => {
  const out = runCli(['hook', 'SessionStart'], 'not-json');
  assert.equal(JSON.parse(out).continue, true);
});

test('empty stdin still responds with continue:true', () => {
  const out = runCli(['hook', 'SessionStart'], '');
  assert.equal(JSON.parse(out).continue, true);
});

test('MINIM_DEBUG dumps the payload without breaking the response', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const payload = { hook_event_name: 'Nope', cwd: root, timestamp: '2026-07-31T10:00:00Z' };
  const out = execFileSync(process.execPath, [CLI, 'hook', 'Nope'], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, MINIM_DEBUG: '1' },
  });
  assert.equal(JSON.parse(out).continue, true);
  const dumps = fs.readdirSync(path.join(root, '.minim', 'debug'));
  assert.equal(dumps.length, 1);
  assert.match(dumps[0], /-Nope\.json$/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.minim', 'debug', dumps[0]), 'utf8')).cwd, root);
});

test('unknown command exits non-zero', () => {
  assert.throws(() => runCli(['nonsense']));
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — esbuild cannot resolve `src/main.ts`.

- [ ] **Step 5: Write the implementation**

Create `packages/cli/src/hookio.ts`:

```ts
import type { HookOutput } from '../../core/src/types.ts';

export async function readStdinJson(): Promise<unknown> {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return {};
  }
}

export function respond(obj: HookOutput = {}): void {
  process.stdout.write(JSON.stringify({ continue: true, ...obj }));
}
```

Cross-package imports use relative paths into `../../core/src/`. esbuild resolves and inlines them, so no workspace dependency entry is needed and `core` never appears as an unresolvable dependency of the published tarball.

Create `packages/cli/src/hookrun.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pick } from '../../core/src/types.ts';
import type { HookOutput } from '../../core/src/types.ts';
import { readStdinJson, respond } from './hookio.ts';

export type HookHandler = (input: unknown) => Promise<HookOutput | undefined>;

// Handlers register here as tasks land.
export const handlers: Partial<Record<string, HookHandler>> = {};

export async function run(event: string): Promise<void> {
  const input = await readStdinJson();
  if (process.env.MINIM_DEBUG) {
    try {
      const root = pick<string>(input, 'cwd') ?? process.cwd();
      const dir = join(root, '.minim', 'debug');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${Date.now()}-${event}.json`), JSON.stringify(input, null, 2));
    } catch {
      /* debug dump must never break a hook */
    }
  }
  const handler = handlers[event];
  if (!handler) return respond();
  try {
    respond((await handler(input)) ?? {});
  } catch (e) {
    respond({ systemMessage: `minim hook error (${event}): ${(e as Error).message}` });
  }
}
```

Create `packages/cli/src/main.ts`:

```ts
import { run } from './hookrun.ts';

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case 'hook':
    await run(args[0] ?? '');
    break;
  default:
    console.error(
      `minim: unknown command "${cmd ?? ''}"\n` +
        'usage: minim <hook|budget|stats|mem|pack|init> [args]'
    );
    process.exit(1);
}
```

Create `packages/cli/bin/minim.js`:

```js
#!/usr/bin/env node
import '../dist/minim.js';
```

```bash
chmod +x packages/cli/bin/minim.js
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm test && npm run typecheck
```

Expected: 52 tests pass; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/cli package.json
git commit -m "build: CLI package with bundled hook dispatcher"
```

---

### Task 9: Port the three stateless hooks

`SessionStart`, `UserPromptSubmit` and `PreToolUse` need neither the transcript nor the metrics log. Grouped because each is a handful of lines over already-tested core functions.

**Files:**
- Create: `packages/cli/src/hooks/sessionstart.ts`
- Create: `packages/cli/src/hooks/userprompt.ts`
- Create: `packages/cli/src/hooks/pretooluse.ts`
- Modify: `packages/cli/src/hookrun.ts` (register three handlers)
- Test: `packages/cli/test/hooks-stateless.test.ts`

**Interfaces:**
- Consumes: `checkBudgets`, `TIER0_CAP` (Task 5), `appendFacts` (Task 3), `loadConfig` (Task 2), `pick`, `HookOutput` (Task 7), `handlers` (Task 8).
- Produces: three `HookHandler` implementations exported as `handle` from their respective modules, registered under the keys `SessionStart`, `UserPromptSubmit`, `PreToolUse`.

- [ ] **Step 1: Write the failing test**

Create `packages/cli/test/hooks-stateless.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIER0_CAP } from '../../core/src/budget.ts';
import { memPath } from '../../core/src/memory.ts';
import type { HookOutput } from '../../core/src/types.ts';

const CLI = fileURLToPath(new URL('../bin/minim.js', import.meta.url));

function hook(event: string, payload: unknown): HookOutput {
  const out = execFileSync(process.execPath, [CLI, 'hook', event], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  return JSON.parse(out) as HookOutput;
}

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
}

test('SessionStart stays quiet when budgets are fine', () => {
  const out = hook('SessionStart', { cwd: tmpRepo(), timestamp: '2026-07-31T10:00:00Z' });
  assert.deepEqual(out, { continue: true });
});

test('SessionStart names oversized files', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.github'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.github', 'copilot-instructions.md'),
    'x'.repeat((TIER0_CAP + 1) * 4)
  );
  const out = hook('SessionStart', { cwd: root, timestamp: '2026-07-31T10:00:00Z' });
  assert.match(out.systemMessage ?? '', /copilot-instructions\.md/);
  assert.match(out.systemMessage ?? '', /over budget/);
});

test('UserPromptSubmit captures #remember text', () => {
  const root = tmpRepo();
  const out = hook('UserPromptSubmit', {
    cwd: root,
    prompt: 'fix the bug #remember payments API is v2 only',
    timestamp: '2026-07-31T10:00:00Z',
  });
  assert.match(fs.readFileSync(memPath(root), 'utf8'), /- \[2026-07-31\] payments API is v2 only/);
  assert.match(out.systemMessage ?? '', /minim remember/);
});

test('UserPromptSubmit without the marker is a no-op', () => {
  const root = tmpRepo();
  const out = hook('UserPromptSubmit', {
    cwd: root,
    prompt: 'just fix it',
    timestamp: '2026-07-31T10:00:00Z',
  });
  assert.deepEqual(out, { continue: true });
  assert.equal(fs.existsSync(memPath(root)), false);
});

test('UserPromptSubmit with a bare marker and no text is a no-op', () => {
  const root = tmpRepo();
  hook('UserPromptSubmit', { cwd: root, prompt: 'do it #remember  ', timestamp: '2026-07-31T10:00:00Z' });
  assert.equal(fs.existsSync(memPath(root)), false);
});

test('PreToolUse flags node_modules with the ask decision', () => {
  const out = hook('PreToolUse', {
    cwd: tmpRepo(),
    timestamp: '2026-07-31T10:00:00Z',
    tool_name: 'readFile',
    tool_input: { filePath: 'node_modules/lodash/index.js' },
  });
  assert.equal(out.hookSpecificOutput?.permissionDecision, 'ask');
  assert.match(out.hookSpecificOutput?.permissionDecisionReason ?? '', /node_modules/);
});

test('PreToolUse passes clean input untouched', () => {
  const out = hook('PreToolUse', {
    cwd: tmpRepo(),
    timestamp: '2026-07-31T10:00:00Z',
    tool_name: 'readFile',
    tool_input: { filePath: 'src/app.js' },
  });
  assert.deepEqual(out, { continue: true });
});

test('PreToolUse honors a config escalation to deny', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.minim'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.minim', 'config.json'),
    JSON.stringify({ guard: { decision: 'deny' } })
  );
  const out = hook('PreToolUse', {
    cwd: root,
    timestamp: '2026-07-31T10:00:00Z',
    tool_name: 'readFile',
    tool_input: { filePath: 'dist/bundle.min.js' },
  });
  assert.equal(out.hookSpecificOutput?.permissionDecision, 'deny');
});

test('PreToolUse accepts camelCase toolInput', () => {
  const out = hook('PreToolUse', {
    cwd: tmpRepo(),
    timestamp: '2026-07-31T10:00:00Z',
    toolName: 'readFile',
    toolInput: { filePath: 'node_modules/x/index.js' },
  });
  assert.equal(out.hookSpecificOutput?.permissionDecision, 'ask');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `SessionStart stays quiet` passes trivially, but the oversized-file, `#remember` and `PreToolUse` tests fail because no handler is registered.

- [ ] **Step 3: Write the implementations**

Create `packages/cli/src/hooks/sessionstart.ts`:

```ts
import { checkBudgets } from '../../../core/src/budget.ts';
import { pick } from '../../../core/src/types.ts';
import type { HookOutput } from '../../../core/src/types.ts';

export async function handle(input: unknown): Promise<HookOutput | undefined> {
  const root = pick<string>(input, 'cwd') ?? process.cwd();
  const over = checkBudgets(root).filter((r) => r.over);
  if (over.length === 0) return undefined;
  const list = over.map((r) => `${r.path} (${r.tokens}/${r.cap} tok)`).join(', ');
  return {
    systemMessage: `minim warn: instruction files over budget — every session pays for these: ${list}. Run "minim budget" and trim.`,
  };
}
```

Create `packages/cli/src/hooks/userprompt.ts`:

```ts
import { appendFacts } from '../../../core/src/memory.ts';
import { pick } from '../../../core/src/types.ts';
import type { HookOutput } from '../../../core/src/types.ts';

export async function handle(input: unknown): Promise<HookOutput | undefined> {
  const prompt = pick<string>(input, 'prompt') ?? '';
  const idx = prompt.indexOf('#remember');
  if (idx === -1) return undefined;
  const fact = prompt.slice(idx + '#remember'.length).trim();
  if (!fact) return undefined;
  const root = pick<string>(input, 'cwd') ?? process.cwd();
  const date = (pick<string>(input, 'timestamp') ?? new Date().toISOString()).slice(0, 10);
  appendFacts(root, [fact], date);
  return { systemMessage: 'minim remember: saved.' };
}
```

Create `packages/cli/src/hooks/pretooluse.ts`:

```ts
import { loadConfig } from '../../../core/src/config.ts';
import { pick } from '../../../core/src/types.ts';
import type { HookOutput } from '../../../core/src/types.ts';

export async function handle(input: unknown): Promise<HookOutput | undefined> {
  const root = pick<string>(input, 'cwd') ?? process.cwd();
  const { guard } = loadConfig(root);
  const toolInput = pick<unknown>(input, 'tool_input', 'toolInput');
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

In `packages/cli/src/hookrun.ts`, add these imports below the existing ones:

```ts
import { handle as sessionStart } from './hooks/sessionstart.ts';
import { handle as userPromptSubmit } from './hooks/userprompt.ts';
import { handle as preToolUse } from './hooks/pretooluse.ts';
```

and replace the empty registry with:

```ts
export const handlers: Partial<Record<string, HookHandler>> = {
  SessionStart: sessionStart,
  UserPromptSubmit: userPromptSubmit,
  PreToolUse: preToolUse,
};
```

The registry now uses static imports rather than v0.1.0's lazy `() => import(...)`. Everything ends up in one bundled file, so lazy loading buys nothing — and Task 13 verifies cold start did not regress.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test && npm run typecheck
```

Expected: 61 tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/hooks packages/cli/src/hookrun.ts packages/cli/test/hooks-stateless.test.ts
git commit -m "feat: port SessionStart, UserPromptSubmit and PreToolUse hooks"
```

---

### Task 10: Port the three transcript and metrics hooks

`PostToolUse`, `Stop` and `PreCompact`. `Stop` and `PreCompact` are the paths the spec demotes to fallback status — they still work exactly as before, but the primary write path becomes the `minim_remember` tool in Task 16.

**Files:**
- Create: `packages/cli/src/hooks/posttooluse.ts`
- Create: `packages/cli/src/hooks/stop.ts`
- Create: `packages/cli/src/hooks/precompact.ts`
- Modify: `packages/cli/src/hookrun.ts` (register three more handlers)
- Test: `packages/cli/test/hooks-transcript.test.ts`

**Interfaces:**
- Consumes: `appendMetric` (Task 5), `estimateTokens` (Task 1), `extractNotes` (Task 2), `appendFacts` (Task 3), `pick` (Task 7), `handlers` (Task 8).
- Produces: three `HookHandler` implementations registered under `PostToolUse`, `Stop`, `PreCompact`. Metric record shapes: tool records are `{ ts, session, event: 'tool', tool, inTokens, outTokens }`; session records are `{ ts, session, event: 'session_end', transcriptTokens, factsSaved }`. Task 11's `summarize` reads both.

- [ ] **Step 1: Write the failing test**

Create `packages/cli/test/hooks-transcript.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — no `PostToolUse`, `Stop` or `PreCompact` handler registered.

- [ ] **Step 3: Write the implementations**

Create `packages/cli/src/hooks/posttooluse.ts`:

```ts
import { appendMetric } from '../../../core/src/metrics.ts';
import { estimateTokens } from '../../../core/src/tokens.ts';
import { pick } from '../../../core/src/types.ts';
import type { HookOutput } from '../../../core/src/types.ts';

export async function handle(input: unknown): Promise<HookOutput | undefined> {
  const root = pick<string>(input, 'cwd') ?? process.cwd();
  const toolOutput = pick<unknown>(input, 'tool_output', 'toolOutput');
  appendMetric(root, {
    ts: pick<string>(input, 'timestamp') ?? new Date().toISOString(),
    session: pick<string>(input, 'session_id', 'sessionId') ?? 'unknown',
    event: 'tool',
    tool: pick<string>(input, 'tool_name', 'toolName') ?? 'unknown',
    inTokens: estimateTokens(JSON.stringify(pick<unknown>(input, 'tool_input', 'toolInput') ?? '')),
    outTokens: estimateTokens(
      typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput ?? '')
    ),
  });
  return undefined;
}
```

Create `packages/cli/src/hooks/stop.ts`:

```ts
import fs from 'node:fs';
import { extractNotes } from '../../../core/src/extract.ts';
import { appendFacts } from '../../../core/src/memory.ts';
import { appendMetric } from '../../../core/src/metrics.ts';
import { estimateTokens } from '../../../core/src/tokens.ts';
import { pick } from '../../../core/src/types.ts';
import type { HookOutput } from '../../../core/src/types.ts';

export async function handle(input: unknown): Promise<HookOutput | undefined> {
  const root = pick<string>(input, 'cwd') ?? process.cwd();
  const tp = pick<string>(input, 'transcript_path', 'transcriptPath');
  if (!tp || !fs.existsSync(tp)) return undefined;
  const text = fs.readFileSync(tp, 'utf8');
  const ts = pick<string>(input, 'timestamp') ?? new Date().toISOString();
  const n = appendFacts(root, extractNotes(text), ts.slice(0, 10));
  appendMetric(root, {
    ts,
    session: pick<string>(input, 'session_id', 'sessionId') ?? 'unknown',
    event: 'session_end',
    transcriptTokens: estimateTokens(text),
    factsSaved: n,
  });
  if (n === 0) return undefined;
  return { systemMessage: `minim remember: ${n} fact(s) saved to .minim/memory/decisions.md` };
}
```

Create `packages/cli/src/hooks/precompact.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { extractNotes } from '../../../core/src/extract.ts';
import { appendFacts } from '../../../core/src/memory.ts';
import { pick } from '../../../core/src/types.ts';
import type { HookOutput } from '../../../core/src/types.ts';

export async function handle(input: unknown): Promise<HookOutput | undefined> {
  const root = pick<string>(input, 'cwd') ?? process.cwd();
  const tp = pick<string>(input, 'transcript_path', 'transcriptPath');
  if (!tp || !fs.existsSync(tp)) return undefined;
  const text = fs.readFileSync(tp, 'utf8');
  const ts = pick<string>(input, 'timestamp') ?? new Date().toISOString();
  const session = pick<string>(input, 'session_id', 'sessionId') ?? 'session';
  const dir = path.join(root, '.minim', 'snapshots');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${session}-${Date.parse(ts)}.txt`), text);
  const n = appendFacts(root, extractNotes(text), ts.slice(0, 10));
  if (n === 0) return undefined;
  return { systemMessage: `minim: persisted ${n} fact(s) before compaction.` };
}
```

In `packages/cli/src/hookrun.ts`, add the imports:

```ts
import { handle as postToolUse } from './hooks/posttooluse.ts';
import { handle as stop } from './hooks/stop.ts';
import { handle as preCompact } from './hooks/precompact.ts';
```

and extend the registry to all six events:

```ts
export const handlers: Partial<Record<string, HookHandler>> = {
  SessionStart: sessionStart,
  UserPromptSubmit: userPromptSubmit,
  PreToolUse: preToolUse,
  PostToolUse: postToolUse,
  PreCompact: preCompact,
  Stop: stop,
};
```

`SubagentStart` and `SubagentStop` are the two remaining documented events and stay unwired — they belong to the deferred hook-hardening spec.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test && npm run typecheck
```

Expected: 69 tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/hooks packages/cli/src/hookrun.ts packages/cli/test/hooks-transcript.test.ts
git commit -m "feat: port PostToolUse, Stop and PreCompact hooks"
```

---

### Task 11: Port the four read-only commands

`budget`, `stats`, `mem` and `pack`. `init` is deliberately excluded — it changes behavior and gets its own task.

**Files:**
- Create: `packages/core/src/summarize.ts`
- Create: `packages/cli/src/cli/budget.ts`
- Create: `packages/cli/src/cli/stats.ts`
- Create: `packages/cli/src/cli/mem.ts`
- Create: `packages/cli/src/cli/pack.ts`
- Modify: `packages/cli/src/main.ts` (four new cases)
- Test: `packages/core/test/summarize.test.ts`
- Test: `packages/cli/test/commands.test.ts`

**Interfaces:**
- Consumes: `checkBudgets` (Task 5), `readMetrics` (Task 5), `appendFacts`/`compactMemory`/`memPath` (Task 3), `loadConfig` (Task 2), `buildPack` (Task 6).
- Produces:
  - From `packages/core/src/summarize.ts`: `Summary` = `{ sessions: number, totalTranscriptTokens: number, avgTranscriptTokens: number, factsSaved: number, toolCalls: Record<string, number> }` and `summarize(root: string): Summary`. Placed in core rather than the CLI so it is unit-testable and reusable by the extension's `minim.stats` command in Task 18.
  - Four `run(args: string[]): void` exports, one per command module.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/summarize.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { summarize } from '../src/summarize.ts';

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

test('summarize on an empty repo returns zeros, not NaN', () => {
  const s = summarize(fs.mkdtempSync(path.join(os.tmpdir(), 'minim-')));
  assert.equal(s.sessions, 0);
  assert.equal(s.avgTranscriptTokens, 0);
  assert.deepEqual(s.toolCalls, {});
});
```

Create `packages/cli/test/commands.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIER0_CAP } from '../../core/src/budget.ts';
import { memPath } from '../../core/src/memory.ts';

const CLI = fileURLToPath(new URL('../bin/minim.js', import.meta.url));

function cli(args: string[], cwd: string): string {
  return execFileSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
}

test('budget reports no instruction files in a bare repo', () => {
  assert.match(cli(['budget'], tmpRepo()), /no instruction files found/);
});

test('budget exits 1 and prints OVER for an oversized tier 0', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.github'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.github', 'copilot-instructions.md'),
    'x'.repeat((TIER0_CAP + 1) * 4)
  );
  assert.throws(
    () => cli(['budget'], root),
    (e: unknown) => {
      const err = e as { status: number; stdout: string };
      assert.equal(err.status, 1);
      assert.match(err.stdout, /OVER/);
      return true;
    }
  );
});

test('mem add then list round-trips, and a repeat is reported as duplicate', () => {
  const root = tmpRepo();
  assert.match(cli(['mem', 'add', 'payments', 'API', 'is', 'v2'], root), /saved/);
  assert.match(cli(['mem', 'list'], root), /payments API is v2/);
  assert.match(cli(['mem', 'add', 'payments', 'API', 'is', 'v2'], root), /duplicate/);
});

test('mem list on an empty repo says so', () => {
  assert.match(cli(['mem', 'list'], tmpRepo()), /no memory yet/);
});

test('mem compact archives nothing when everything is recent', () => {
  const root = tmpRepo();
  cli(['mem', 'add', 'recent thing'], root);
  assert.match(cli(['mem', 'compact'], root), /kept 1, archived 0/);
});

test('stats on an empty repo prints zeros', () => {
  assert.match(cli(['stats'], tmpRepo()), /sessions:\s+0/);
});

test('pack writes a prompt file and reports its token count', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'auth.js'), 'export function login() {}\n');
  const out = cli(['pack', '--task', 'fix login', 'src/auth.js'], root);
  assert.match(out, /wrote \.github\/prompts\/minim-pack\.prompt\.md/);
  assert.match(out, /~\d+ tokens/);
  const md = fs.readFileSync(path.join(root, '.github', 'prompts', 'minim-pack.prompt.md'), 'utf8');
  assert.match(md, /mode: agent/);
  assert.match(md, /fix login/);
});

test('pack honors --out', () => {
  const root = tmpRepo();
  fs.writeFileSync(path.join(root, 'a.js'), 'let a = 1;\n');
  cli(['pack', '--task', 'tweak a', '--out', 'custom.md', 'a.js'], root);
  assert.ok(fs.existsSync(path.join(root, 'custom.md')));
});

test('pack refuses to exceed the token cap without --force', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.minim'), { recursive: true });
  fs.writeFileSync(path.join(root, '.minim', 'config.json'), JSON.stringify({ pack: { maxTokens: 10 } }));
  fs.writeFileSync(path.join(root, 'big.js'), 'x'.repeat(4000));
  assert.throws(
    () => cli(['pack', '--task', 'trim this file down', 'big.js'], root),
    (e: unknown) => {
      const err = e as { status: number; stderr: string };
      assert.equal(err.status, 1);
      assert.match(err.stderr, /exceeds cap/);
      return true;
    }
  );
  cli(['pack', '--task', 'trim this file down', '--force', 'big.js'], root);
  assert.ok(fs.existsSync(path.join(root, '.github', 'prompts', 'minim-pack.prompt.md')));
});

test('pack without a task exits 1 with usage', () => {
  assert.throws(
    () => cli(['pack', 'a.js'], tmpRepo()),
    (e: unknown) => {
      assert.match((e as { stderr: string }).stderr, /usage: minim pack/);
      return true;
    }
  );
});

test('mem with no subcommand exits 1', () => {
  assert.throws(() => cli(['mem'], tmpRepo()));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module '.../core/src/summarize.ts'`, and every CLI command test fails on the unknown-command exit.

- [ ] **Step 3: Write the implementations**

Create `packages/core/src/summarize.ts`:

```ts
import { readMetrics } from './metrics.ts';

export interface Summary {
  sessions: number;
  totalTranscriptTokens: number;
  avgTranscriptTokens: number;
  factsSaved: number;
  toolCalls: Record<string, number>;
}

export function summarize(root: string): Summary {
  const recs = readMetrics(root);
  const ends = recs.filter((r) => r.event === 'session_end');
  const tools = recs.filter((r) => r.event === 'tool');
  const totalTranscriptTokens = ends.reduce(
    (a, r) => a + ((r.transcriptTokens as number) || 0),
    0
  );
  const toolCalls: Record<string, number> = {};
  for (const t of tools) {
    const name = (t.tool as string) || 'unknown';
    toolCalls[name] = (toolCalls[name] || 0) + 1;
  }
  return {
    sessions: ends.length,
    totalTranscriptTokens,
    avgTranscriptTokens: ends.length ? Math.round(totalTranscriptTokens / ends.length) : 0,
    factsSaved: ends.reduce((a, r) => a + ((r.factsSaved as number) || 0), 0),
    toolCalls,
  };
}
```

Create `packages/cli/src/cli/budget.ts`:

```ts
import { checkBudgets } from '../../../core/src/budget.ts';

export function run(): void {
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

Create `packages/cli/src/cli/stats.ts`:

```ts
import { summarize } from '../../../core/src/summarize.ts';

export function run(): void {
  const s = summarize(process.cwd());
  console.log(`sessions:            ${s.sessions}`);
  console.log(
    `transcript tokens:   ${s.totalTranscriptTokens} total, ${s.avgTranscriptTokens} avg/session (±15% estimate)`
  );
  console.log(`facts saved:         ${s.factsSaved}`);
  console.log('tool calls:');
  for (const [tool, n] of Object.entries(s.toolCalls).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${tool}`);
  }
}
```

Create `packages/cli/src/cli/mem.ts`:

```ts
import fs from 'node:fs';
import { appendFacts, compactMemory, memPath } from '../../../core/src/memory.ts';
import { loadConfig } from '../../../core/src/config.ts';

export function run(args: string[]): void {
  const root = process.cwd();
  const sub = args[0];
  const today = new Date().toISOString().slice(0, 10);
  if (sub === 'add') {
    const fact = args.slice(1).join(' ').trim();
    if (!fact) {
      console.error('usage: minim mem add <fact>');
      process.exit(1);
    }
    console.log(appendFacts(root, [fact], today) ? 'saved.' : 'duplicate, skipped.');
  } else if (sub === 'list') {
    const p = memPath(root);
    console.log(fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '(no memory yet)');
  } else if (sub === 'compact') {
    const { memory } = loadConfig(root);
    const r = compactMemory(root, memory.maxAgeDays, today);
    console.log(`kept ${r.kept}, archived ${r.archived} (older than ${memory.maxAgeDays}d).`);
  } else {
    console.error('usage: minim mem <add|list|compact>');
    process.exit(1);
  }
}
```

Create `packages/cli/src/cli/pack.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { buildPack } from '../../../core/src/pack.ts';
import { loadConfig } from '../../../core/src/config.ts';

export function run(args: string[]): void {
  const root = process.cwd();
  const files: string[] = [];
  let task = '';
  let out = '';
  let force = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--task') task = args[++i] ?? '';
    else if (args[i] === '--out') out = args[++i] ?? '';
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
    console.error(
      `minim pack: ${tokens} tokens exceeds cap ${pack.maxTokens}. Trim files or pass --force.`
    );
    process.exit(1);
  }
  const dest = out || path.join('.github', 'prompts', 'minim-pack.prompt.md');
  fs.mkdirSync(path.dirname(path.resolve(root, dest)), { recursive: true });
  fs.writeFileSync(path.resolve(root, dest), md);
  console.log(`wrote ${dest} (~${tokens} tokens). Run it from chat with "/" or attach it.`);
}
```

In `packages/cli/src/main.ts`, add the imports and four cases:

```ts
import { run } from './hookrun.ts';
import { run as budget } from './cli/budget.ts';
import { run as stats } from './cli/stats.ts';
import { run as mem } from './cli/mem.ts';
import { run as pack } from './cli/pack.ts';

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case 'hook':
    await run(args[0] ?? '');
    break;
  case 'budget':
    budget();
    break;
  case 'stats':
    stats();
    break;
  case 'mem':
    mem(args);
    break;
  case 'pack':
    pack(args);
    break;
  default:
    console.error(
      `minim: unknown command "${cmd ?? ''}"\n` +
        'usage: minim <hook|budget|stats|mem|pack|init> [args]'
    );
    process.exit(1);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test && npm run typecheck
```

Expected: 82 tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/summarize.ts packages/core/test/summarize.test.ts packages/cli/src/cli packages/cli/src/main.ts packages/cli/test/commands.test.ts
git commit -m "feat: port budget, stats, mem and pack commands"
```

---

### Task 12: `install` in core, `minim init`, and the templates move

The one behavior change in piece A: `init` must vendor *compiled* output instead of raw sources. `install` moves into core and takes explicit asset directories, because Task 18's `minim.init` command calls the same code from inside the extension, where the package layout is different.

**Files:**
- Create: `packages/core/src/install.ts`
- Create: `packages/cli/src/cli/init.ts`
- Move: `templates/*` → `packages/cli/templates/*`
- Modify: `packages/cli/src/main.ts` (add the `init` case)
- Modify: `packages/cli/templates/copilot-instructions.md` (tool instructions — see Step 5)
- Test: `packages/core/test/install.test.ts`
- Test: `packages/cli/test/init.test.ts`

**Interfaces:**
- Consumes: nothing from core.
- Produces, from `packages/core/src/install.ts`:
  - `InstallAssets` = `{ templatesDir: string, runtimeDir: string }`.
  - `install(targetRoot: string, assets: InstallAssets): string[]` — returns a human-readable log of actions, each line starting with `write `, `skip `, or `append `.

- [ ] **Step 1: Move the templates**

```bash
git mv templates packages/cli/templates
```

- [ ] **Step 2: Write the failing tests**

Create `packages/core/test/install.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { install } from '../src/install.ts';

function fixtureAssets(): { templatesDir: string; runtimeDir: string } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-assets-'));
  const templatesDir = path.join(base, 'templates');
  const runtimeDir = path.join(base, 'runtime');
  fs.mkdirSync(templatesDir, { recursive: true });
  fs.mkdirSync(path.join(runtimeDir, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(runtimeDir, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(templatesDir, 'copilot-instructions.md'),
    '<!-- minim:begin -->\nmanaged\n<!-- minim:end -->\n'
  );
  fs.writeFileSync(path.join(templatesDir, 'hooks.json'), '{"hooks":{}}\n');
  fs.writeFileSync(path.join(templatesDir, 'example.instructions.md'), 'example\n');
  fs.writeFileSync(path.join(templatesDir, 'settings.json'), '{"search.exclude":{}}\n');
  fs.writeFileSync(path.join(runtimeDir, 'bin', 'minim.js'), '#!/usr/bin/env node\n');
  fs.writeFileSync(path.join(runtimeDir, 'dist', 'minim.js'), 'console.log(1);\n');
  return { templatesDir, runtimeDir };
}

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
}

test('fresh install writes every artifact', () => {
  const root = tmpRepo();
  const log = install(root, fixtureAssets());
  assert.ok(fs.existsSync(path.join(root, '.github', 'copilot-instructions.md')));
  assert.ok(fs.existsSync(path.join(root, '.github', 'hooks', 'minim.json')));
  assert.ok(fs.existsSync(path.join(root, '.github', 'instructions', 'example.instructions.md')));
  assert.ok(fs.existsSync(path.join(root, '.minim', 'config.json')));
  assert.ok(fs.existsSync(path.join(root, '.vscode', 'settings.json')));
  assert.ok(log.some((l) => l.startsWith('write ')));
});

test('vendors the compiled runtime, not sources', () => {
  const root = tmpRepo();
  install(root, fixtureAssets());
  assert.ok(fs.existsSync(path.join(root, '.minim', 'runtime', 'bin', 'minim.js')));
  assert.ok(fs.existsSync(path.join(root, '.minim', 'runtime', 'dist', 'minim.js')));
  assert.equal(fs.existsSync(path.join(root, '.minim', 'runtime', 'src')), false);
});

test('re-running replaces the vendored runtime and leaves config alone', () => {
  const root = tmpRepo();
  const assets = fixtureAssets();
  install(root, assets);
  fs.writeFileSync(path.join(root, '.minim', 'config.json'), '{"custom":true}');
  fs.writeFileSync(path.join(root, '.minim', 'runtime', 'stale.js'), 'old');
  install(root, assets);
  assert.equal(fs.existsSync(path.join(root, '.minim', 'runtime', 'stale.js')), false);
  assert.match(fs.readFileSync(path.join(root, '.minim', 'config.json'), 'utf8'), /custom/);
});

test('appends the managed block to an existing tier 0 file', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.github'), { recursive: true });
  fs.writeFileSync(path.join(root, '.github', 'copilot-instructions.md'), '# House rules\n');
  const log = install(root, fixtureAssets());
  const body = fs.readFileSync(path.join(root, '.github', 'copilot-instructions.md'), 'utf8');
  assert.match(body, /# House rules/);
  assert.match(body, /minim:begin/);
  assert.ok(log.some((l) => l.includes('managed block')));
});

test('does not append the managed block twice', () => {
  const root = tmpRepo();
  const assets = fixtureAssets();
  install(root, assets);
  install(root, assets);
  const body = fs.readFileSync(path.join(root, '.github', 'copilot-instructions.md'), 'utf8');
  assert.equal(body.match(/minim:begin/g)?.length, 1);
});

test('never overwrites an existing .vscode/settings.json, suggests instead', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.vscode'), { recursive: true });
  fs.writeFileSync(path.join(root, '.vscode', 'settings.json'), '{ /* JSONC */ }');
  install(root, fixtureAssets());
  assert.match(fs.readFileSync(path.join(root, '.vscode', 'settings.json'), 'utf8'), /JSONC/);
  assert.ok(fs.existsSync(path.join(root, '.minim', 'suggested-settings.json')));
});

test('adds gitignore entries once', () => {
  const root = tmpRepo();
  const assets = fixtureAssets();
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/');
  install(root, assets);
  install(root, assets);
  const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.equal(gi.match(/\.minim\/metrics\//g)?.length, 1);
  assert.match(gi, /node_modules\//);
});
```

Create `packages/cli/test/init.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/minim.js', import.meta.url));

test('minim init installs a working config pack whose vendored runtime runs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  const out = execFileSync(process.execPath, [CLI, 'init'], { cwd: root, encoding: 'utf8' });
  assert.match(out, /minim init done/);

  // The hooks file must reference the vendored path, and that path must execute.
  const hooks = JSON.parse(
    fs.readFileSync(path.join(root, '.github', 'hooks', 'minim.json'), 'utf8')
  ) as { hooks: Record<string, Array<{ command: string }>> };
  assert.match(hooks.hooks.PreToolUse[0].command, /\.minim\/runtime\/bin\/minim\.js/);

  const vendored = path.join(root, '.minim', 'runtime', 'bin', 'minim.js');
  const res = execFileSync(process.execPath, [vendored, 'hook', 'PreToolUse'], {
    cwd: root,
    input: JSON.stringify({
      cwd: root,
      timestamp: '2026-07-31T10:00:00Z',
      tool_name: 'readFile',
      tool_input: { filePath: 'node_modules/x/index.js' },
    }),
    encoding: 'utf8',
  });
  assert.equal(JSON.parse(res).hookSpecificOutput.permissionDecision, 'ask');
});

test('the installed tier 0 block stays under the budget cap', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
  execFileSync(process.execPath, [CLI, 'init'], { cwd: root, encoding: 'utf8' });
  const out = execFileSync(process.execPath, [CLI, 'budget'], { cwd: root, encoding: 'utf8' });
  assert.doesNotMatch(out, /OVER/);
});
```

That second test is the guard against the Tier 0 edit in Step 5 pushing the managed block over 1500 tokens.

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module '.../core/src/install.ts'`

- [ ] **Step 4: Write the implementations**

Create `packages/core/src/install.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';

export interface InstallAssets {
  /** Directory holding copilot-instructions.md, hooks.json, example.instructions.md, settings.json. */
  templatesDir: string;
  /** Directory containing bin/ and dist/. ONLY those two subdirectories are vendored. */
  runtimeDir: string;
}

const RUNTIME_SUBDIRS = ['bin', 'dist'];

const DEFAULT_CONFIG = {
  guard: { decision: 'ask' },
  memory: { maxAgeDays: 45 },
  pack: { maxTokens: 20000, maxLinesPerFile: 400 },
};

const GITIGNORE_ENTRIES = ['.minim/metrics/', '.minim/snapshots/', '.minim/debug/'];

function writeIfAbsent(dest: string, content: string, log: string[]): boolean {
  if (fs.existsSync(dest)) {
    log.push(`skip  ${dest} (exists)`);
    return false;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
  log.push(`write ${dest}`);
  return true;
}

export function install(targetRoot: string, assets: InstallAssets): string[] {
  const log: string[] = [];
  const tpl = (name: string): string =>
    fs.readFileSync(path.join(assets.templatesDir, name), 'utf8');

  // Tier 0: create, or append the managed block if the file exists without it.
  const tier0 = path.join(targetRoot, '.github', 'copilot-instructions.md');
  const block = tpl('copilot-instructions.md');
  if (!fs.existsSync(tier0)) {
    writeIfAbsent(tier0, block, log);
  } else if (!fs.readFileSync(tier0, 'utf8').includes('minim:begin')) {
    fs.appendFileSync(tier0, '\n' + block);
    log.push(`append ${tier0} (managed block)`);
  } else {
    log.push(`skip  ${tier0} (managed block present)`);
  }

  writeIfAbsent(path.join(targetRoot, '.github', 'hooks', 'minim.json'), tpl('hooks.json'), log);
  writeIfAbsent(
    path.join(targetRoot, '.github', 'instructions', 'example.instructions.md'),
    tpl('example.instructions.md'),
    log
  );
  writeIfAbsent(
    path.join(targetRoot, '.minim', 'config.json'),
    JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n',
    log
  );

  // Vendor the compiled runtime so teammates need no npm install. Only bin/ and
  // dist/ are copied — copying runtimeDir wholesale would drag src/, test/ and
  // node_modules into every consumer repo when run from a working tree.
  const rt = path.join(targetRoot, '.minim', 'runtime');
  fs.rmSync(rt, { recursive: true, force: true });
  fs.mkdirSync(rt, { recursive: true });
  for (const sub of RUNTIME_SUBDIRS) {
    fs.cpSync(path.join(assets.runtimeDir, sub), path.join(rt, sub), { recursive: true });
  }
  log.push(`write ${rt} (vendored runtime)`);

  // Settings: never merge, because the file may be JSONC. Suggest instead.
  const settings = path.join(targetRoot, '.vscode', 'settings.json');
  if (!writeIfAbsent(settings, tpl('settings.json'), log)) {
    writeIfAbsent(
      path.join(targetRoot, '.minim', 'suggested-settings.json'),
      tpl('settings.json'),
      log
    );
  }

  const gi = path.join(targetRoot, '.gitignore');
  const existing = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  const missing = GITIGNORE_ENTRIES.filter((e) => !existing.includes(e));
  if (missing.length) {
    const lead = existing.endsWith('\n') || !existing ? '' : '\n';
    fs.appendFileSync(gi, lead + missing.join('\n') + '\n');
    log.push(`append ${gi}`);
  }
  return log;
}
```

Create `packages/cli/src/cli/init.ts`:

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../../core/src/install.ts';

export function run(): void {
  // After bundling, import.meta.url is <pkg>/dist/minim.js, so the package root is one level up.
  const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const written = install(process.cwd(), {
    templatesDir: path.join(pkgRoot, 'templates'),
    runtimeDir: pkgRoot,
  });
  for (const line of written) console.log(line);
  console.log('\nminim init done. Commit .github/ and .minim/ (metrics/snapshots are gitignored).');
  console.log('If .vscode/settings.json existed, merge .minim/suggested-settings.json by hand.');
}
```

`runtimeDir: pkgRoot` works because `install` copies only the `bin` and `dist` subdirectories, never the directory wholesale. That is what keeps `src/`, `test/` and `node_modules/` out of consumer repos when `minim init` runs from a git working tree rather than an installed tarball — and it is exactly what the `vendors the compiled runtime, not sources` test asserts.

In `packages/cli/src/main.ts`, add the import and case:

```ts
import { run as init } from './cli/init.ts';
```

```ts
  case 'init':
    init();
    break;
```

- [ ] **Step 5: Update the Tier 0 template for the LM tools**

Replace `packages/cli/templates/copilot-instructions.md` entirely:

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

- Before planning non-trivial work, search prior decisions with the `minim_memory` tool (referenceable as `#minimMemory`). It replaces re-exploring the codebase. If that tool is unavailable, read `.minim/memory/decisions.md` instead.
- When you make or learn a durable decision (architecture choice, constraint, gotcha), record it with the `minim_remember` tool. Keep it under 20 words. If that tool is unavailable, emit a single line `MINIM-NOTE: <the fact>` in your response instead — it is scraped automatically.
- Do not re-state facts already recorded.
<!-- minim:end -->
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm test && npm run typecheck
```

Expected: 91 tests pass; typecheck clean. The budget test in `init.test.ts` confirms the reworded block still fits under 1500 tokens.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/install.ts packages/core/test/install.test.ts packages/cli/src/cli/init.ts packages/cli/src/main.ts packages/cli/templates packages/cli/test/init.test.ts
git commit -m "feat: vendor compiled runtime and point tier 0 at the LM tools"
```

---

### Task 13: Cold-start benchmark and Node 20 compatibility check

Guards two properties the migration could silently break: hook latency and the Node 20 floor. The measured v0.1.0 baseline is ~23ms per invocation (50 runs, 1.173s wall, Node 24.16.0).

**Files:**
- Create: `scripts/bench-hook.mjs`
- Create: `scripts/check-node20.mjs`
- Modify: `package.json` (root — add `bench` and `check:node20` scripts)

**Interfaces:**
- Consumes: the built `packages/cli/dist/minim.js` and `packages/cli/bin/minim.js` (Task 8).
- Produces: two standalone scripts invoked by CI in Task 19. Neither exports anything.

- [ ] **Step 1: Write the benchmark**

Create `scripts/bench-hook.mjs`:

```js
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
```

`BUDGET_MS` is 40 rather than 23 because CI runners are slower and noisier than a local machine. It catches an order-of-magnitude regression, which is the failure worth catching; it is not a precision instrument.

- [ ] **Step 2: Write the Node 20 compatibility check**

Create `scripts/check-node20.mjs`:

```js
// Runs the compiled bundle and asserts the hook contract holds. Must pass on
// Node 20, where TypeScript tests cannot run at all.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../packages/cli/bin/minim.js', import.meta.url));

function hook(event, payload) {
  const out = execFileSync(process.execPath, [CLI, 'hook', event], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

const root = mkdtempSync(path.join(tmpdir(), 'minim-node20-'));

// 1. Unknown events are inert.
assert.deepEqual(hook('Nope', { hook_event_name: 'Nope' }), { continue: true });

// 2. The guard fires.
const guarded = hook('PreToolUse', {
  cwd: root,
  timestamp: '2026-07-31T10:00:00Z',
  tool_name: 'readFile',
  tool_input: { filePath: 'node_modules/x/index.js' },
});
assert.equal(guarded.hookSpecificOutput.permissionDecision, 'ask');

// 3. Transcript scraping writes memory.
const tp = path.join(root, 'transcript.txt');
writeFileSync(tp, 'MINIM-NOTE: node 20 path works\n');
const stopped = hook('Stop', {
  cwd: root,
  transcript_path: tp,
  session_id: 's1',
  timestamp: '2026-07-31T10:00:00Z',
});
assert.match(stopped.systemMessage, /1 fact/);

// 4. Commands run.
mkdirSync(path.join(root, '.github'), { recursive: true });
writeFileSync(path.join(root, '.github', 'copilot-instructions.md'), 'small\n');
const budget = execFileSync(process.execPath, [CLI, 'budget'], { cwd: root, encoding: 'utf8' });
assert.match(budget, /ok\s+\d+\/1500/);

console.log(`node ${process.versions.node}: compiled bundle contract OK`);
```

- [ ] **Step 3: Register both scripts**

In the root `package.json`, replace the `bench` script and add one more:

```json
"bench": "npm run build --workspaces --if-present && node scripts/bench-hook.mjs",
"check:node20": "node scripts/check-node20.mjs"
```

- [ ] **Step 4: Run both to verify they pass**

```bash
npm run bench
npm run build --workspaces --if-present && npm run check:node20
```

Expected: the benchmark prints a mean at or below the v0.1.0 baseline and exits 0; the compatibility check prints `compiled bundle contract OK`.

If the mean is well above 23ms, check that no module does filesystem work at import time — everything must happen inside `run()` or a command function.

- [ ] **Step 5: Commit**

```bash
git add scripts package.json
git commit -m "test: cold-start benchmark and Node 20 bundle contract check"
```

---

### Task 14: Extension package, activation, and VSIX packaging

Scaffolds the extension with no contributions yet, so the packaging and activation path is proven before any feature depends on it. Later tasks each add their own `contributes` entry alongside their implementation.

**Files:**
- Create: `packages/extension/package.json`
- Create: `packages/extension/.vscodeignore`
- Create: `packages/extension/scripts/copy-assets.mjs`
- Create: `packages/extension/src/extension.ts`
- Create: `packages/extension/src/log.ts`
- Create: `packages/extension/test/runTest.mjs`
- Create: `packages/extension/test/suite/index.mjs`
- Create: `packages/extension/test/suite/activation.test.mjs`

**Interfaces:**
- Consumes: the built `packages/cli` `bin/`, `dist/` and `templates/` (Tasks 8 and 12), copied into `packages/extension/assets/`.
- Produces:
  - `activate(context: vscode.ExtensionContext): void` and `deactivate(): void` from `packages/extension/src/extension.ts`.
  - `log(message: string): void` and `logError(scope: string, e: unknown): void` from `packages/extension/src/log.ts`. Tasks 15–18 use these.
  - `packages/extension/assets/runtime/{bin,dist}` and `packages/extension/assets/templates/`, which Task 18's `minim.init` passes to `install`.

- [ ] **Step 1: Create the package**

```bash
mkdir -p packages/extension/src/tools packages/extension/scripts packages/extension/test/suite
npm install --save-dev @types/vscode@^1.109.0 @vscode/vsce@^3.2.0 @vscode/test-electron@^2.4.1
```

Create `packages/extension/package.json`:

```json
{
  "name": "minim-vscode",
  "displayName": "minim",
  "description": "Cut GitHub Copilot token spend: agent-callable project memory, instruction-file budgets, context packing",
  "version": "0.2.0",
  "publisher": "sadrakhosravi",
  "license": "MIT",
  "engines": { "vscode": "^1.109.0" },
  "categories": ["AI", "Other"],
  "main": "./dist/extension.js",
  "activationEvents": ["workspaceContains:.minim/config.json"],
  "contributes": {},
  "scripts": {
    "build": "node scripts/copy-assets.mjs && esbuild src/extension.ts --bundle --platform=node --format=cjs --target=node20 --external:vscode --outfile=dist/extension.js",
    "package": "vsce package --no-dependencies --out minim-vscode.vsix",
    "test:ext": "node test/runTest.mjs"
  }
}
```

`--external:vscode` is mandatory: the `vscode` module is injected by the extension host and must never be bundled. `--no-dependencies` on `vsce package` is safe because the bundle is self-contained.

Create `packages/extension/.vscodeignore`:

```
src/**
test/**
scripts/**
tsconfig.json
.vscodeignore
**/*.map
```

- [ ] **Step 2: Write the asset copier**

Create `packages/extension/scripts/copy-assets.mjs`:

```js
// The minim.init command runs install() from inside the extension, so the VSIX
// must carry the CLI's compiled runtime and templates. Layout must match the
// InstallAssets contract: runtimeDir contains bin/ and dist/.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '..', '..', 'cli');
const assets = path.resolve(here, '..', 'assets');

for (const required of ['bin', 'dist', 'templates']) {
  if (!existsSync(path.join(cli, required))) {
    console.error(
      `copy-assets: packages/cli/${required} is missing. Build the CLI first: npm run build -w minim-copilot`
    );
    process.exit(1);
  }
}

rmSync(assets, { recursive: true, force: true });
mkdirSync(path.join(assets, 'runtime'), { recursive: true });
cpSync(path.join(cli, 'bin'), path.join(assets, 'runtime', 'bin'), { recursive: true });
cpSync(path.join(cli, 'dist'), path.join(assets, 'runtime', 'dist'), { recursive: true });
cpSync(path.join(cli, 'templates'), path.join(assets, 'templates'), { recursive: true });
console.log('copy-assets: runtime and templates staged');
```

Add `packages/extension/assets/` to the root `.gitignore` — it is generated:

```bash
printf 'packages/extension/assets/\npackages/*/dist/\n*.vsix\n' >> .gitignore
```

- [ ] **Step 3: Write the failing activation test**

Create `packages/extension/test/suite/activation.test.mjs`:

```js
import assert from 'node:assert/strict';
import * as vscode from 'vscode';

export const tests = [
  [
    'extension is present and activates',
    async () => {
      const ext = vscode.extensions.getExtension('sadrakhosravi.minim-vscode');
      assert.ok(ext, 'extension not found by id');
      await ext.activate();
      assert.equal(ext.isActive, true);
    },
  ],
];
```

Create `packages/extension/test/suite/index.mjs`:

```js
// Minimal runner. Avoids a mocha dependency: each suite exports an array of
// [name, asyncFn] pairs, and failures reject so test-electron exits non-zero.
export async function run() {
  const suites = [await import('./activation.test.mjs')];
  const failures = [];
  for (const suite of suites) {
    for (const [name, fn] of suite.tests) {
      try {
        await fn();
        console.log(`  ok  ${name}`);
      } catch (e) {
        failures.push(`${name}: ${e.message}`);
        console.error(`  FAIL ${name}: ${e.stack}`);
      }
    }
  }
  if (failures.length) throw new Error(`${failures.length} extension test(s) failed`);
}
```

Create `packages/extension/test/runTest.mjs`:

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const here = path.dirname(fileURLToPath(import.meta.url));

try {
  await runTests({
    extensionDevelopmentPath: path.resolve(here, '..'),
    extensionTestsPath: path.resolve(here, 'suite', 'index.mjs'),
    launchArgs: ['--disable-extensions', '--disable-gpu'],
  });
} catch {
  console.error('extension tests failed');
  process.exit(1);
}
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
npm run build --workspaces --if-present
npm run test:ext -w minim-vscode
```

Expected: FAIL — the extension has no `main` bundle yet, so activation throws.

- [ ] **Step 5: Write the implementation**

Create `packages/extension/src/log.ts`:

```ts
import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function initLog(context: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel('minim');
  context.subscriptions.push(channel);
}

export function log(message: string): void {
  channel?.appendLine(message);
}

export function logError(scope: string, e: unknown): void {
  const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
  channel?.appendLine(`[${scope}] ${msg}`);
}
```

Create `packages/extension/src/extension.ts`:

```ts
import * as vscode from 'vscode';
import { initLog, log, logError } from './log.ts';

export function activate(context: vscode.ExtensionContext): void {
  initLog(context);
  try {
    log('minim activated');
  } catch (e) {
    // A broken extension must never break the window.
    logError('activate', e);
  }
}

export function deactivate(): void {
  /* disposables are registered on context.subscriptions */
}
```

Every feature added in Tasks 15–18 goes inside the existing `try` block, so a single failure degrades that feature rather than aborting activation.

- [ ] **Step 6: Run the test to verify it passes**

```bash
npm run build --workspaces --if-present
npm run typecheck
npm run test:ext -w minim-vscode
npm run package -w minim-vscode
```

Expected: activation test prints `ok  extension is present and activates`; `vsce package` writes `minim-vscode.vsix`.

On a headless Linux machine, prefix the test command with `xvfb-run -a`.

- [ ] **Step 7: Commit**

```bash
git add packages/extension .gitignore
git commit -m "feat: VS Code extension scaffold with VSIX packaging"
```

---

### Task 15: The `minim_memory` tool

The largest credit lever in the spec: the agent searches recorded decisions through a capped tool instead of reading a whole file or re-exploring the repo.

**Files:**
- Create: `packages/core/src/render.ts`
- Create: `packages/extension/src/workspace.ts`
- Create: `packages/extension/src/tools/memory.ts`
- Modify: `packages/extension/package.json` (add the `languageModelTools` contribution)
- Modify: `packages/extension/src/extension.ts` (register the tool)
- Test: `packages/core/test/render.test.ts`
- Test: `packages/extension/test/suite/tools.test.mjs`
- Modify: `packages/extension/test/suite/index.mjs` (load the new suite)

**Interfaces:**
- Consumes: `searchMemory`, `SearchResult` (Task 4), `resolveRoot` (Task 7), `log`/`logError` (Task 14).
- Produces:
  - From `packages/core/src/render.ts`: `renderSearchResult(result: SearchResult, query: string): string` — the exact text handed to the model. Lives in core so its wording is unit-testable without a `vscode` runtime.
  - From `packages/extension/src/workspace.ts`: `currentRoot(): string | undefined`.
  - From `packages/extension/src/tools/memory.ts`: `class MemoryTool implements vscode.LanguageModelTool<{ query: string }>`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/render.test.ts`:

```ts
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
        { date: '2026-07-01', fact: 'login uses OAuth device flow', line: '- [2026-07-01] login uses OAuth device flow' },
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
```

Create `packages/extension/test/suite/tools.test.mjs`:

```js
import assert from 'node:assert/strict';
import * as vscode from 'vscode';

export const tests = [
  [
    'minim_memory is registered and visible in lm.tools',
    async () => {
      await vscode.extensions.getExtension('sadrakhosravi.minim-vscode').activate();
      const tool = vscode.lm.tools.find((t) => t.name === 'minim_memory');
      assert.ok(tool, 'minim_memory not registered');
    },
  ],
  [
    'minim_memory returns text for a query with no matches',
    async () => {
      await vscode.extensions.getExtension('sadrakhosravi.minim-vscode').activate();
      const result = await vscode.lm.invokeTool('minim_memory', {
        input: { query: 'nonexistent subject matter' },
        toolInvocationToken: undefined,
      });
      const text = result.content
        .filter((p) => p instanceof vscode.LanguageModelTextPart)
        .map((p) => p.value)
        .join('');
      assert.ok(text.length > 0, 'tool returned no text');
    },
  ],
];
```

In `packages/extension/test/suite/index.mjs`, extend the suite list:

```js
  const suites = [
    await import('./activation.test.mjs'),
    await import('./tools.test.mjs'),
  ];
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test packages/core/test/render.test.ts
```

Expected: FAIL — `Cannot find module '.../core/src/render.ts'`

- [ ] **Step 3: Write the core renderer**

Create `packages/core/src/render.ts`:

```ts
import type { SearchResult } from './search.ts';

export function renderSearchResult(result: SearchResult, query: string): string {
  if (result.hits.length === 0) {
    return (
      `No recorded decisions match "${query}". ` +
      'Nothing is known about this yet — proceed, and record what you learn with the minim_remember tool.'
    );
  }
  const lines = result.hits.map((h) => (h.date ? `- [${h.date}] ${h.fact}` : `- ${h.fact}`));
  const header = `Recorded decisions matching "${query}":`;
  const footer =
    result.truncated > 0
      ? `\n\n(${result.truncated} more match but were withheld to save tokens. Use a narrower query if none of the above answer the question.)`
      : '';
  return `${header}\n${lines.join('\n')}${footer}`;
}
```

- [ ] **Step 4: Write the extension glue**

Create `packages/extension/src/workspace.ts`:

```ts
import * as vscode from 'vscode';
import { resolveRoot } from '../../core/src/root.ts';

/** Workspace folder the tools and commands act on. Policy lives in core. */
export function currentRoot(): string | undefined {
  const folders = (vscode.workspace.workspaceFolders ?? [])
    .filter((f) => f.uri.scheme === 'file')
    .map((f) => f.uri.fsPath);
  const active = vscode.window.activeTextEditor?.document.uri;
  const activeFile = active?.scheme === 'file' ? active.fsPath : undefined;
  return resolveRoot(folders, activeFile);
}
```

The `scheme === 'file'` filters matter: virtual and untitled documents have no filesystem path, and passing their URIs into path logic yields a root that does not exist.

Create `packages/extension/src/tools/memory.ts`:

```ts
import * as vscode from 'vscode';
import { searchMemory } from '../../../core/src/search.ts';
import { renderSearchResult } from '../../../core/src/render.ts';
import { currentRoot } from '../workspace.ts';
import { logError } from '../log.ts';

interface MemoryInput {
  query: string;
}

function text(value: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(value)]);
}

export class MemoryTool implements vscode.LanguageModelTool<MemoryInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<MemoryInput>
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const root = currentRoot();
      if (!root) {
        return text('No workspace folder is open, so no project memory is available.');
      }
      const query = (options.input?.query ?? '').trim();
      if (!query) {
        return text('The query was empty. Call this tool again with keywords describing the task.');
      }
      return text(renderSearchResult(searchMemory(root, query), query));
    } catch (e) {
      logError('minim_memory', e);
      return text('Project memory could not be read. Continue without it.');
    }
  }

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<MemoryInput>
  ): vscode.PreparedToolInvocation {
    return { invocationMessage: `Searching project decisions for "${options.input?.query ?? ''}"` };
  }
}
```

Every failure path returns a result rather than throwing. A thrown error reaches the model as a tool failure and teaches it to stop calling the tool — the opposite of what this feature exists to do.

- [ ] **Step 5: Contribute and register the tool**

In `packages/extension/package.json`, replace `"contributes": {}` with:

```json
  "contributes": {
    "languageModelTools": [
      {
        "name": "minim_memory",
        "displayName": "Search project decisions",
        "modelDescription": "Search this project's recorded architecture decisions, constraints and gotchas. Call this BEFORE exploring the codebase when planning non-trivial work — it replaces reading files.",
        "canBeReferencedInPrompt": true,
        "toolReferenceName": "minimMemory",
        "icon": "$(book)",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "Keywords describing the task or subsystem."
            }
          },
          "required": ["query"]
        }
      }
    ]
  },
```

In `packages/extension/src/extension.ts`, add the import and registration inside the existing `try`:

```ts
import { MemoryTool } from './tools/memory.ts';
```

```ts
    context.subscriptions.push(vscode.lm.registerTool('minim_memory', new MemoryTool()));
    log('registered minim_memory');
```

The string `'minim_memory'` must match the `name` in the contribution exactly, or registration fails silently at runtime.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm test && npm run typecheck
npm run build --workspaces --if-present && npm run test:ext -w minim-vscode
```

Expected: 94 tests pass in `npm test`; the extension suite reports `minim_memory is registered` and the no-match invocation returning text.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/render.ts packages/core/test/render.test.ts packages/extension
git commit -m "feat: minim_memory language model tool"
```

---

### Task 16: The `minim_remember` tool

Makes the model persist facts directly. This is what demotes transcript scraping — and its dependence on the explicitly unstable `transcript_path` — to a fallback.

**Files:**
- Create: `packages/extension/src/tools/remember.ts`
- Modify: `packages/extension/package.json` (second `languageModelTools` entry)
- Modify: `packages/extension/src/extension.ts` (register the tool)
- Modify: `packages/extension/test/suite/tools.test.mjs` (two more cases)

**Interfaces:**
- Consumes: `appendFacts` (Task 3), `currentRoot` (Task 15), `logError` (Task 14).
- Produces: `class RememberTool implements vscode.LanguageModelTool<{ fact: string }>`.

- [ ] **Step 1: Write the failing tests**

Append to the `tests` array in `packages/extension/test/suite/tools.test.mjs`:

```js
  [
    'minim_remember is registered',
    async () => {
      await vscode.extensions.getExtension('sadrakhosravi.minim-vscode').activate();
      assert.ok(vscode.lm.tools.find((t) => t.name === 'minim_remember'));
    },
  ],
  [
    'minim_remember persists a fact and reports back',
    async () => {
      await vscode.extensions.getExtension('sadrakhosravi.minim-vscode').activate();
      const fact = `test fact ${vscode.env.sessionId}`;
      const result = await vscode.lm.invokeTool('minim_remember', {
        input: { fact },
        toolInvocationToken: undefined,
      });
      const text = result.content
        .filter((p) => p instanceof vscode.LanguageModelTextPart)
        .map((p) => p.value)
        .join('');
      assert.match(text, /Recorded/);

      const found = await vscode.lm.invokeTool('minim_memory', {
        input: { query: fact },
        toolInvocationToken: undefined,
      });
      const foundText = found.content
        .filter((p) => p instanceof vscode.LanguageModelTextPart)
        .map((p) => p.value)
        .join('');
      assert.match(foundText, /test fact/);
    },
  ],
```

The second case is a round trip: write through one tool, read back through the other. It is the only test that proves the two tools agree on where memory lives.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run build --workspaces --if-present && npm run test:ext -w minim-vscode
```

Expected: FAIL — `minim_remember` is not registered.

- [ ] **Step 3: Write the implementation**

Create `packages/extension/src/tools/remember.ts`:

```ts
import * as vscode from 'vscode';
import { appendFacts } from '../../../core/src/memory.ts';
import { currentRoot } from '../workspace.ts';
import { logError } from '../log.ts';

interface RememberInput {
  fact: string;
}

function text(value: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(value)]);
}

export class RememberTool implements vscode.LanguageModelTool<RememberInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RememberInput>
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const root = currentRoot();
      if (!root) {
        return text('No workspace folder is open, so the decision could not be recorded.');
      }
      const fact = (options.input?.fact ?? '').trim();
      if (!fact) {
        return text('The fact was empty. Nothing was recorded.');
      }
      const today = new Date().toISOString().slice(0, 10);
      const written = appendFacts(root, [fact], today);
      return text(
        written > 0
          ? `Recorded in .minim/memory/decisions.md: ${fact}`
          : 'Already recorded — nothing written. Do not record this fact again.'
      );
    } catch (e) {
      logError('minim_remember', e);
      return text('The decision could not be written to disk. Continue without recording it.');
    }
  }

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<RememberInput>
  ): vscode.PreparedToolInvocation {
    return { invocationMessage: `Recording decision: ${options.input?.fact ?? ''}` };
  }
}
```

`prepareInvocation` returns `invocationMessage` and nothing else. Adding `confirmationMessages` here would put a modal in front of every recorded fact, and the model would stop calling the tool. The write is one appended line inside the open workspace, and `appendFacts` dedupes, so repeat calls are inert.

`new Date()` appears here rather than in core: the tool is an adapter and is allowed ambient state, while `appendFacts` still receives its date explicitly.

- [ ] **Step 4: Contribute and register the tool**

In `packages/extension/package.json`, add a second entry to the `languageModelTools` array:

```json
      {
        "name": "minim_remember",
        "displayName": "Record a project decision",
        "modelDescription": "Persist one durable decision, constraint or gotcha, under 20 words. Do not record transient state or facts already recorded.",
        "canBeReferencedInPrompt": true,
        "toolReferenceName": "minimRemember",
        "icon": "$(pin)",
        "inputSchema": {
          "type": "object",
          "properties": {
            "fact": {
              "type": "string",
              "description": "The durable fact, under 20 words."
            }
          },
          "required": ["fact"]
        }
      }
```

In `packages/extension/src/extension.ts`, add the import and registration:

```ts
import { RememberTool } from './tools/remember.ts';
```

```ts
    context.subscriptions.push(vscode.lm.registerTool('minim_remember', new RememberTool()));
    log('registered minim_remember');
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm run typecheck
npm run build --workspaces --if-present && npm run test:ext -w minim-vscode
```

Expected: all four extension cases pass, including the write-then-read round trip.

- [ ] **Step 6: Commit**

```bash
git add packages/extension
git commit -m "feat: minim_remember language model tool"
```

---

### Task 17: Status bar and budget diagnostics

Surfaces the fixed per-request cost to the human. The status bar shows the Tier 0 + Tier 1 total; overages also appear in the Problems panel, which is where a developer actually looks.

**Files:**
- Create: `packages/core/src/budgetsummary.ts`
- Create: `packages/extension/src/statusbar.ts`
- Create: `packages/extension/src/diagnostics.ts`
- Create: `packages/extension/src/watch.ts`
- Modify: `packages/extension/src/extension.ts` (wire all three)
- Test: `packages/core/test/budgetsummary.test.ts`

**Interfaces:**
- Consumes: `checkBudgets`, `BudgetEntry` (Task 5), `currentRoot` (Task 15), `log`/`logError` (Task 14).
- Produces:
  - From `packages/core/src/budgetsummary.ts`: `BudgetSummary` = `{ tokens: number, cap: number, over: boolean, overFiles: string[] }`, `summarizeBudget(entries: BudgetEntry[]): BudgetSummary`, and `formatTokens(n: number): string`.
  - From `packages/extension/src/statusbar.ts`: `createStatusBar(context): () => void` — returns a refresh function.
  - From `packages/extension/src/diagnostics.ts`: `createDiagnostics(context): () => void` — returns a refresh function.
  - From `packages/extension/src/watch.ts`: `watchInstructionFiles(context, onChange: () => void): void`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/budgetsummary.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTokens, summarizeBudget } from '../src/budgetsummary.ts';

test('empty report totals zero and is not over', () => {
  assert.deepEqual(summarizeBudget([]), { tokens: 0, cap: 0, over: false, overFiles: [] });
});

test('totals tokens and caps across tiers', () => {
  const s = summarizeBudget([
    { path: '/r/.github/copilot-instructions.md', tokens: 1200, cap: 1500, over: false },
    { path: '/r/.github/instructions/a.instructions.md', tokens: 400, cap: 800, over: false },
  ]);
  assert.equal(s.tokens, 1600);
  assert.equal(s.cap, 2300);
  assert.equal(s.over, false);
  assert.deepEqual(s.overFiles, []);
});

test('any over-budget file marks the summary over and is listed by basename', () => {
  const s = summarizeBudget([
    { path: '/r/.github/copilot-instructions.md', tokens: 1800, cap: 1500, over: true },
    { path: '/r/.github/instructions/a.instructions.md', tokens: 400, cap: 800, over: false },
  ]);
  assert.equal(s.over, true);
  assert.deepEqual(s.overFiles, ['copilot-instructions.md']);
});

test('formatTokens abbreviates thousands and leaves small values alone', () => {
  assert.equal(formatTokens(0), '0');
  assert.equal(formatTokens(999), '999');
  assert.equal(formatTokens(1000), '1.0k');
  assert.equal(formatTokens(1234), '1.2k');
  assert.equal(formatTokens(23000), '23.0k');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test packages/core/test/budgetsummary.test.ts
```

Expected: FAIL — `Cannot find module '.../core/src/budgetsummary.ts'`

- [ ] **Step 3: Write the core summary**

Create `packages/core/src/budgetsummary.ts`:

```ts
import path from 'node:path';
import type { BudgetEntry } from './budget.ts';

export interface BudgetSummary {
  tokens: number;
  cap: number;
  over: boolean;
  overFiles: string[];
}

export function summarizeBudget(entries: BudgetEntry[]): BudgetSummary {
  return {
    tokens: entries.reduce((a, e) => a + e.tokens, 0),
    cap: entries.reduce((a, e) => a + e.cap, 0),
    over: entries.some((e) => e.over),
    overFiles: entries.filter((e) => e.over).map((e) => path.basename(e.path)),
  };
}

export function formatTokens(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`;
}
```

- [ ] **Step 4: Write the extension pieces**

Create `packages/extension/src/statusbar.ts`:

```ts
import * as vscode from 'vscode';
import { checkBudgets } from '../../core/src/budget.ts';
import { formatTokens, summarizeBudget } from '../../core/src/budgetsummary.ts';
import { currentRoot } from './workspace.ts';
import { logError } from './log.ts';

export function createStatusBar(context: vscode.ExtensionContext): () => void {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'minim.budget';
  context.subscriptions.push(item);

  return function refresh(): void {
    try {
      const root = currentRoot();
      if (!root) {
        item.hide();
        return;
      }
      const s = summarizeBudget(checkBudgets(root));
      if (s.cap === 0) {
        item.hide();
        return;
      }
      item.text = `$(book) minim ${formatTokens(s.tokens)}/${formatTokens(s.cap)}`;
      item.tooltip = s.over
        ? `Instruction files over budget: ${s.overFiles.join(', ')}. Every request pays this.`
        : 'Instruction-file tokens paid on every request. Click for the full report.';
      item.backgroundColor = s.over
        ? new vscode.ThemeColor('statusBarItem.warningBackground')
        : undefined;
      item.show();
    } catch (e) {
      logError('statusbar', e);
      item.hide();
    }
  };
}
```

Create `packages/extension/src/diagnostics.ts`:

```ts
import * as vscode from 'vscode';
import { checkBudgets } from '../../core/src/budget.ts';
import { currentRoot } from './workspace.ts';
import { logError } from './log.ts';

export function createDiagnostics(context: vscode.ExtensionContext): () => void {
  const collection = vscode.languages.createDiagnosticCollection('minim');
  context.subscriptions.push(collection);

  return function refresh(): void {
    try {
      collection.clear();
      const root = currentRoot();
      if (!root) return;
      for (const entry of checkBudgets(root)) {
        if (!entry.over) continue;
        const d = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 0),
          `minim: ${entry.tokens} tokens exceeds the ${entry.cap}-token budget. ` +
            'This cost is paid on every request in every session.',
          vscode.DiagnosticSeverity.Warning
        );
        d.source = 'minim';
        collection.set(vscode.Uri.file(entry.path), [d]);
      }
    } catch (e) {
      logError('diagnostics', e);
    }
  };
}
```

Create `packages/extension/src/watch.ts`:

```ts
import * as vscode from 'vscode';

/**
 * Refresh triggers for the status bar and diagnostics. Also warns once per
 * session when the Tier 0 file is edited: it is the prompt-cache prefix, so
 * changing it mid-session forces a full-price reprocess on the next request.
 */
export function watchInstructionFiles(
  context: vscode.ExtensionContext,
  onChange: () => void
): void {
  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/.github/{copilot-instructions.md,instructions/*.instructions.md}'
  );
  context.subscriptions.push(watcher);
  watcher.onDidChange(onChange, undefined, context.subscriptions);
  watcher.onDidCreate(onChange, undefined, context.subscriptions);
  watcher.onDidDelete(onChange, undefined, context.subscriptions);

  let warned = false;
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!doc.uri.fsPath.endsWith('copilot-instructions.md')) return;
      onChange();
      if (warned) return;
      warned = true;
      void vscode.window.showInformationMessage(
        'minim: copilot-instructions.md is the prompt-cache prefix. Editing it mid-session makes the next request reprocess the whole prefix at full price.'
      );
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(onChange),
    vscode.workspace.onDidChangeWorkspaceFolders(onChange)
  );
}
```

**Beyond the spec, flagged for the reviewer:** the prompt-cache warning on Tier 0 save is not in the approved design — it appeared only under the extension-owns-everything option that was not chosen. It is ~12 lines riding on a watcher this task needs anyway, and it addresses a documented cost the spec's own risk table names. Cut it if you disagree; nothing else depends on it.

- [ ] **Step 5: Wire them into activation**

In `packages/extension/src/extension.ts`, add the imports:

```ts
import { createStatusBar } from './statusbar.ts';
import { createDiagnostics } from './diagnostics.ts';
import { watchInstructionFiles } from './watch.ts';
```

and inside the existing `try`, after the tool registrations:

```ts
    const refreshStatus = createStatusBar(context);
    const refreshDiagnostics = createDiagnostics(context);
    const refresh = (): void => {
      refreshStatus();
      refreshDiagnostics();
    };
    watchInstructionFiles(context, refresh);
    refresh();
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm test && npm run typecheck
npm run build --workspaces --if-present && npm run test:ext -w minim-vscode
```

Expected: 98 tests pass; extension suite still green.

- [ ] **Step 7: Manually verify the visible behavior**

```bash
npm run package -w minim-vscode
code --install-extension packages/extension/minim-vscode.vsix
```

Open a repo that has `.minim/config.json`, then confirm:
1. The status bar shows `minim <n>/<cap>` on the right.
2. Padding `.github/copilot-instructions.md` past 6000 characters turns it warning-colored and adds a Problems entry.
3. Saving that file shows the prompt-cache notice once.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/budgetsummary.ts packages/core/test/budgetsummary.test.ts packages/extension
git commit -m "feat: status bar cost indicator and budget diagnostics"
```

---

### Task 18: Extension commands

Six commands so the extension is usable without the CLI on `PATH`. `minim.init` is the one that needs the bundled assets staged in Task 14.

**Files:**
- Create: `packages/extension/src/commands.ts`
- Modify: `packages/extension/package.json` (`contributes.commands`)
- Modify: `packages/extension/src/extension.ts` (register commands)
- Modify: `packages/extension/test/suite/index.mjs` (load the new suite)
- Test: `packages/extension/test/suite/commands.test.mjs`

**Interfaces:**
- Consumes: `install` (Task 12), `buildPack` (Task 6), `checkBudgets` (Task 5), `summarize` (Task 11), `compactMemory`/`memPath` (Task 3), `loadConfig` (Task 2), `currentRoot` (Task 15), `log`/`logError` (Task 14).
- Produces: `registerCommands(context: vscode.ExtensionContext, refresh: () => void): void`.

- [ ] **Step 1: Write the failing test**

Create `packages/extension/test/suite/commands.test.mjs`:

```js
import assert from 'node:assert/strict';
import * as vscode from 'vscode';

const EXPECTED = [
  'minim.init',
  'minim.pack',
  'minim.budget',
  'minim.stats',
  'minim.mem.list',
  'minim.mem.compact',
];

export const tests = [
  [
    'all six commands are registered',
    async () => {
      await vscode.extensions.getExtension('sadrakhosravi.minim-vscode').activate();
      const all = await vscode.commands.getCommands(true);
      for (const id of EXPECTED) {
        assert.ok(all.includes(id), `${id} not registered`);
      }
    },
  ],
  [
    'minim.budget runs without throwing',
    async () => {
      await vscode.extensions.getExtension('sadrakhosravi.minim-vscode').activate();
      await vscode.commands.executeCommand('minim.budget');
    },
  ],
  [
    'minim.stats runs without throwing',
    async () => {
      await vscode.extensions.getExtension('sadrakhosravi.minim-vscode').activate();
      await vscode.commands.executeCommand('minim.stats');
    },
  ],
];
```

In `packages/extension/test/suite/index.mjs`, extend the suite list:

```js
  const suites = [
    await import('./activation.test.mjs'),
    await import('./tools.test.mjs'),
    await import('./commands.test.mjs'),
  ];
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run build --workspaces --if-present && npm run test:ext -w minim-vscode
```

Expected: FAIL — `minim.init not registered`.

- [ ] **Step 3: Write the implementation**

Create `packages/extension/src/commands.ts`:

```ts
import * as vscode from 'vscode';
import path from 'node:path';
import fs from 'node:fs';
import { install } from '../../core/src/install.ts';
import { buildPack } from '../../core/src/pack.ts';
import { checkBudgets } from '../../core/src/budget.ts';
import { summarize } from '../../core/src/summarize.ts';
import { compactMemory, memPath } from '../../core/src/memory.ts';
import { loadConfig } from '../../core/src/config.ts';
import { currentRoot } from './workspace.ts';
import { log, logError } from './log.ts';

function requireRoot(): string | undefined {
  const root = currentRoot();
  if (!root) void vscode.window.showWarningMessage('minim: open a folder first.');
  return root;
}

async function runInit(context: vscode.ExtensionContext, refresh: () => void): Promise<void> {
  const root = requireRoot();
  if (!root) return;
  const assetsDir = path.join(context.extensionUri.fsPath, 'assets');
  const written = install(root, {
    templatesDir: path.join(assetsDir, 'templates'),
    runtimeDir: path.join(assetsDir, 'runtime'),
  });
  for (const line of written) log(line);
  refresh();
  void vscode.window.showInformationMessage(
    `minim: installed ${written.length} item(s). Commit .github/ and .minim/.`
  );
}

async function runPack(): Promise<void> {
  const root = requireRoot();
  if (!root) return;
  const task = await vscode.window.showInputBox({
    title: 'minim pack',
    prompt: 'Describe the task. Prior decisions matching these words are pulled in.',
    ignoreFocusOut: true,
  });
  if (!task) return;

  const picks = await vscode.window.showOpenDialog({
    canSelectMany: true,
    openLabel: 'Pack these files',
    defaultUri: vscode.Uri.file(root),
  });
  if (!picks || picks.length === 0) return;

  const { pack } = loadConfig(root);
  const files = picks.map((u) => path.relative(root, u.fsPath));
  const { md, tokens } = buildPack({ task, files, root, maxLinesPerFile: pack.maxLinesPerFile });

  if (tokens > pack.maxTokens) {
    const go = await vscode.window.showWarningMessage(
      `minim pack: ~${tokens} tokens exceeds the ${pack.maxTokens} cap.`,
      'Write anyway',
      'Cancel'
    );
    if (go !== 'Write anyway') return;
  }

  const dest = path.join(root, '.github', 'prompts', 'minim-pack.prompt.md');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, md);
  const doc = await vscode.workspace.openTextDocument(dest);
  await vscode.window.showTextDocument(doc);
  void vscode.window.showInformationMessage(`minim pack: ~${tokens} tokens written.`);
}

function runBudget(): void {
  const root = requireRoot();
  if (!root) return;
  const report = checkBudgets(root);
  if (report.length === 0) {
    log('budget: no instruction files found.');
  } else {
    for (const r of report) {
      log(`${r.over ? 'OVER ' : 'ok   '} ${r.tokens}/${r.cap} tok  ${r.path}`);
    }
  }
  void vscode.commands.executeCommand('workbench.action.output.toggleOutput');
}

function runStats(): void {
  const root = requireRoot();
  if (!root) return;
  const s = summarize(root);
  log(`sessions:            ${s.sessions}`);
  log(
    `transcript tokens:   ${s.totalTranscriptTokens} total, ${s.avgTranscriptTokens} avg/session (±15% estimate)`
  );
  log(`facts saved:         ${s.factsSaved}`);
  log('tool calls:');
  for (const [tool, n] of Object.entries(s.toolCalls).sort((a, b) => b[1] - a[1])) {
    log(`  ${String(n).padStart(5)}  ${tool}`);
  }
  void vscode.commands.executeCommand('workbench.action.output.toggleOutput');
}

async function runMemList(): Promise<void> {
  const root = requireRoot();
  if (!root) return;
  const p = memPath(root);
  if (!fs.existsSync(p)) {
    void vscode.window.showInformationMessage('minim: no memory recorded yet.');
    return;
  }
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(p));
}

function runMemCompact(): void {
  const root = requireRoot();
  if (!root) return;
  const { memory } = loadConfig(root);
  const today = new Date().toISOString().slice(0, 10);
  const r = compactMemory(root, memory.maxAgeDays, today);
  void vscode.window.showInformationMessage(
    `minim: kept ${r.kept}, archived ${r.archived} (older than ${memory.maxAgeDays}d).`
  );
}

export function registerCommands(
  context: vscode.ExtensionContext,
  refresh: () => void
): void {
  const wrap = (id: string, fn: () => void | Promise<void>): vscode.Disposable =>
    vscode.commands.registerCommand(id, async () => {
      try {
        await fn();
      } catch (e) {
        logError(id, e);
        void vscode.window.showErrorMessage(`minim: ${id} failed. See the minim output channel.`);
      }
    });

  context.subscriptions.push(
    wrap('minim.init', () => runInit(context, refresh)),
    wrap('minim.pack', runPack),
    wrap('minim.budget', runBudget),
    wrap('minim.stats', runStats),
    wrap('minim.mem.list', runMemList),
    wrap('minim.mem.compact', runMemCompact)
  );
}
```

Every command is wrapped so a thrown error becomes an output-channel entry and one error toast, never an unhandled rejection.

- [ ] **Step 4: Contribute the commands**

In `packages/extension/package.json`, add a `commands` array inside `contributes`, as a sibling of `languageModelTools`:

```json
    "commands": [
      { "command": "minim.init", "title": "Install config pack in this workspace", "category": "minim" },
      { "command": "minim.pack", "title": "Pack files into a prompt file", "category": "minim" },
      { "command": "minim.budget", "title": "Check instruction-file budgets", "category": "minim" },
      { "command": "minim.stats", "title": "Show usage stats", "category": "minim" },
      { "command": "minim.mem.list", "title": "Open recorded decisions", "category": "minim" },
      { "command": "minim.mem.compact", "title": "Archive old decisions", "category": "minim" }
    ]
```

- [ ] **Step 5: Register them at activation**

In `packages/extension/src/extension.ts`, add the import:

```ts
import { registerCommands } from './commands.ts';
```

and inside the existing `try`, after the `refresh()` call:

```ts
    registerCommands(context, refresh);
```

`minim.budget` is already the status bar's `command`, so the status bar becomes clickable only once this task lands.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm run typecheck
npm run build --workspaces --if-present && npm run test:ext -w minim-vscode
```

Expected: all seven extension cases pass.

- [ ] **Step 7: Commit**

```bash
git add packages/extension
git commit -m "feat: extension commands for init, pack, budget, stats and memory"
```

---

### Task 19: CI, license, docs, and legacy removal

Closes the migration: continuous verification, the missing license file, updated docs, and deletion of the v0.1.0 JavaScript tree that has been sitting unused since Task 12.

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `LICENSE`
- Modify: `README.md`
- Delete: `src/`, `bin/`, `test/` at the repo root

**Interfaces:**
- Consumes: every script defined in Tasks 1, 8, 13, 14.
- Produces: no code. A green CI run and a VSIX artifact.

- [ ] **Step 1: Confirm the legacy tree is unreferenced, then delete it**

```bash
grep -rn --exclude-dir=.git --exclude-dir=packages --exclude-dir=docs -E '(^|[^a-z])(src|bin|test)/' package.json README.md || true
git rm -r --quiet src bin test
npm test
```

Expected: `npm test` still passes — 98 tests, all inside `packages/`.

If anything still references the old paths, fix that reference before continuing rather than restoring the directory.

- [ ] **Step 2: Add the license file**

The root `package.json` has claimed MIT since v0.1.0 with no `LICENSE` present. Create `LICENSE`:

```
MIT License

Copyright (c) 2026 Sadra Khosravi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 3: Write the CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - name: Typecheck
        run: npm run typecheck
      - name: Test
        run: npm test
      - name: Cold-start benchmark
        run: npm run bench

  node20-compat:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - name: Build the bundle on 24
        run: npm run build --workspaces --if-present
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Run the compiled bundle on 20
        run: npm run check:node20

  extension:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - run: npm run build --workspaces --if-present
      - name: Extension host tests
        run: xvfb-run -a npm run test:ext -w minim-vscode
      - name: Package VSIX
        run: npm run package -w minim-vscode
      - uses: actions/upload-artifact@v4
        with:
          name: minim-vscode-vsix
          path: packages/extension/minim-vscode.vsix
```

The `node20-compat` job builds on 24 and then switches the runtime to 20 before executing. Building on 20 is impossible — esbuild is fine, but the repo's own tooling assumes 24 — and running on 20 is the property that actually matters.

- [ ] **Step 4: Rewrite the README**

Replace `README.md`:

```markdown
# minim — Copilot token-efficiency toolkit

> The least context that works.

Cuts GitHub Copilot (VS Code) token spend under usage-based billing. No MCP, no
network, no LLM calls — deterministic hooks, files, and two agent-callable
tools. Works in orgs with MCP and Copilot memory disabled.

## Layout

| Package | Artifact | Purpose |
|---|---|---|
| `packages/core` | none (bundled) | Pure logic: tokens, memory, search, budgets, packing, install |
| `packages/cli` | `minim-copilot` on npm | Hook runtime and commands; vendored into consumer repos by `minim init` |
| `packages/extension` | `minim-vscode.vsix` | Agent tools, status bar, diagnostics, commands |

## What it does

| Piece | Mechanism | Saves |
|---|---|---|
| Memory (write) | `minim_remember` tool; `MINIM-NOTE:` transcript scraping and `#remember` as fallbacks | Exploration turns — the quadratic cost |
| Memory (read) | `minim_memory` tool (`#minimMemory`), capped at 20 hits and 800 tokens | Replaces re-reading the codebase |
| Style contract | Managed block in `.github/copilot-instructions.md` | Output tokens, the priciest per token |
| Budgets | Status bar, Problems entries, `minim budget`, SessionStart warning; Tier 0 ≤ 1500 tok, Tier 1 ≤ 800 tok/file | Cache-prefix bloat paid on every request |
| Guard | `PreToolUse` asks or denies reads of vendored and generated paths | Junk input tokens |
| Metrics | `PostToolUse`/`Stop` → `.minim/metrics/*.jsonl`, `minim stats` | Makes savings measurable |
| Packer | `minim pack --task "..." files...` | Replaces 10–20 discovery turns with one |

## Install

Extension:

    npm ci
    npm run build --workspaces --if-present
    npm run package -w minim-vscode
    code --install-extension packages/extension/minim-vscode.vsix

Then run **minim: Install config pack in this workspace** from the command
palette. Or, without the extension:

    node packages/cli/bin/minim.js init

Commit `.github/` and `.minim/` (metrics, snapshots and debug dumps are
gitignored). Requires VS Code 1.109+ with agent hooks enabled (Preview) and
Node 20+ on `PATH` for the hooks.

Hook payloads are Preview-stage. If a hook misbehaves, set `MINIM_DEBUG=1`,
reproduce, and inspect `.minim/debug/*.json` for the actual schema.

## Memory tiers

- **Tier 0** `.github/copilot-instructions.md` — always in context. It IS the
  prompt-cache prefix: keep it stable, never edit mid-session.
- **Tier 1** `.github/instructions/*.instructions.md` — glob-scoped, loaded only
  when matching files are touched.
- **Tier 2** `.minim/memory/decisions.md` — on demand via `minim_memory` or
  `minim pack`.
- **Tier 3** `.minim/archive/` — never loaded. `minim mem compact` moves entries
  older than 45 days here.

## Measure it — or you are guessing

Token counts are chars/4 estimates (±15%). Track **tokens per completed task**,
never per session — per-session rewards abandoning work. Cross-check against the
Copilot status dashboard for real credit numbers.

**The savings are not yet proven.** The measurement work — per-task metrics, a
real tokenizer, and a baseline A/B — is specified but not built. Treat the
numbers `minim stats` reports as relative, not absolute.

Monthly chore: `minim mem compact && minim budget`.

## Development

Requires Node 24 (tests run on raw TypeScript via native type stripping).

    npm ci
    npm test          # builds, then runs all tests
    npm run typecheck
    npm run bench     # hook cold-start guard
    npm run test:ext -w minim-vscode

## Habits the tool can't do for you

- New chat per task; `/compact` on long sessions; `/fork` to branch context.
- Don't idle mid-session — prompt cache retention is minutes.
- Route easy tasks to cheap models; premium models for design and debugging only.
- Inline completions and next-edit suggestions are free — push routine edits there.
```

- [ ] **Step 5: Run the full verification suite**

```bash
npm ci
npm run typecheck
npm test
npm run bench
npm run build --workspaces --if-present && npm run check:node20
npm run test:ext -w minim-vscode
npm run package -w minim-vscode
```

Expected: every command exits 0 and `packages/extension/minim-vscode.vsix` exists.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: CI, license, README, and legacy JavaScript removal"
```

- [ ] **Step 7: Walk the spec's verification criteria**

Confirm each one by hand and record the result. Criteria 1–6 are automated above; criterion 7 is manual and is the one that finally validates the hook layer against a real Copilot session:

1. `npm test` green.
2. `npm run typecheck` clean.
3. From a repo where `minim init` ran: `node .minim/runtime/bin/minim.js hook PreToolUse < payload.json` returns `{"continue":true}` for a clean path.
4. VSIX installs; `#minimMemory` appears in the agent-mode tool list; results respect the cap.
5. An agent calling `minim_remember` appends a dated line to `.minim/memory/decisions.md`.
6. Status bar shows the Tier 0+1 total; an over-budget file appears in Problems.
7. **Capture a real payload.** In a repo with the config pack installed, set `MINIM_DEBUG=1` in the VS Code environment, run one agent session that reads a file and finishes, then inspect `.minim/debug/*.json`. Confirm `timestamp`, `hook_event_name`, `cwd`, `session_id`, `transcript_path`, `tool_name` and `tool_input` appear with the documented names.

If step 7 shows different field names, `pick()` already tolerates casing variants — add the observed alias in `packages/core/src/types.ts` and the corresponding hook adapter, then open the hook-hardening spec with the dump attached.

- [ ] **Step 8: Push and open the pull request**

```bash
git push -u origin feat/ts-workspace-extension
gh pr create --fill
```

---

## Deferred work

These are the follow-up specs the design deliberately excluded. Do not fold them into this plan.

- **C — Hook hardening.** Wire `SubagentStart` and `SubagentStop`. Add a `transcript_path` fallback, since VS Code documents that field as unstable. Fix guard false-positives (`denyPatterns` matches substrings of serialized JSON, so `docs/build/guide.md` trips the `build/` pattern). Enforce a Tier 2 budget so `decisions.md` cannot grow without bound. Prune `.minim/snapshots/`.
- **D — Measurement.** A per-completed-task metric, a real tokenizer, and a baseline A/B rollout. This is the spec that decides whether minim's premise is true.
- **E — Release.** Marketplace and Open VSX publishing, release automation, changelog.
