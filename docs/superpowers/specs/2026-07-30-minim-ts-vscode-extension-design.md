# minim — TypeScript workspace + VS Code extension

**Date:** 2026-07-30
**Status:** approved, ready for implementation planning
**Supersedes nothing.** Builds on `docs/superpowers/plans/2026-07-30-minim-copilot-token-plugin.md`, which shipped as v0.1.0.

## Goal

Convert minim from a single-package JavaScript CLI into a TypeScript npm workspace, and add a VS Code extension that contributes agent-callable language model tools. The extension gives Copilot's agent a real interface to project memory instead of asking it, in prose, to go read a file.

## Scope

This spec covers two pieces:

- **A — TypeScript core + workspace restructure.** Port the existing 530 lines and 37 tests. No behavior change. Hooks keep working.
- **B — Extension MVP.** Two LM tools, commands, status bar, diagnostics, VSIX build.

Explicit non-goals, each becoming its own spec:

- **C — Hook hardening.** `SubagentStart`/`SubagentStop` events, `transcript_path` fallback, guard false-positive fix, Tier 2 budget enforcement.
- **D — Measurement.** Per-completed-task metric, real tokenizer, baseline A/B rollout.
- **E — Release.** Marketplace and Open VSX publishing, LICENSE, release automation.

**D remains the spec that decides whether minim's premise is true.** A and B make the tool better to use and remove an unstable dependency from the memory write path. Neither proves credit savings.

## Platform facts this design relies on

Confirmed against VS Code documentation, not inferred:

- Agent hooks are real and Preview-stage since VS Code 1.109. Config lives in `.github/hooks/*.json`.
- Eight hook events exist: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `SubagentStart`, `SubagentStop`, `Stop`. minim wires six; the two subagent events are deferred to spec C.
- Hook input is snake_case: `timestamp`, `hook_event_name`, and optional `cwd`, `session_id`, `transcript_path`. VS Code converts Copilot CLI event names from lowerCamelCase to PascalCase, so camelCase tolerance stays worthwhile.
- Hook output fields are `continue`, `stopReason`, `systemMessage`. `PreToolUse` additionally honors `permissionDecision`, resolved most-restrictive-first: deny > ask > allow.
- Exit 0 means parse stdout as JSON. Exit 2 is a blocking error shown to the model. Any other code is a non-blocking warning.
- **`transcript_path` is documented as not a stable API.** minim's memory capture currently depends on it entirely. This spec removes that dependency from the primary path.
- Extensions contribute agent tools via `contributes.languageModelTools` in `package.json` plus `vscode.lm.registerTool` at activation. Names must match between the two.
- No extension API observes Copilot's own tool calls. The `PreToolUse` guard and `PostToolUse` metrics therefore cannot move into the extension. Hooks stay.

Measured: a Node hook invocation costs ~23ms cold (50 runs, 1.173s wall, Node 24.16.0). Latency is not billed, so this does not affect credit spend, but it is why the extension imports core in-process rather than shelling out to the CLI.

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Language | TypeScript, not Rust | Rust saves ~2s wall clock per session and zero credits. Extension host runs JS. Distribution gets worse with per-platform binaries. |
| Repo | Convert in place, npm workspaces | Keeps 11 commits, history, and the existing remote. Two publish targets need two manifests over one shared core. |
| Extension purpose | LM tools plus UX; hooks retained | LM tools are the largest available credit lever. Hooks do what no extension API can. |
| Memory path | Tool-first, hooks as safety net | Removes the unstable `transcript_path` from the primary write path. |
| Distribution | VSIX first, marketplace after spec D | Publishing a savings claim before measuring it is backwards. |
| Runtime dependencies | Still zero | The constraint that mattered. |
| devDependencies | Now allowed | `typescript`, `esbuild`, `@types/node`, `@types/vscode`, `@vscode/vsce`. |

## Architecture

### Layout

```
minim/
  package.json              # private, "workspaces": ["packages/*"]
  tsconfig.base.json        # strict, ES2022, moduleResolution nodenext, erasableSyntaxOnly
  packages/
    core/                   # @minim/core — private, never published alone
      src/
        tokens.ts budget.ts config.ts extract.ts
        memory.ts           # + searchMemory (new)
        metrics.ts pack.ts
        types.ts            # hook payload interfaces (new)
      test/*.test.ts
    cli/                    # minim-copilot — npm, bin: minim
      bin/minim.js          # thin shim into dist
      src/
        hookio.ts hookrun.ts
        hooks/*.ts
        cli/*.ts
    extension/              # minim-vscode — VSIX
      package.json          # contributes.languageModelTools + commands
      src/
        extension.ts
        tools/memory.ts tools/remember.ts
        statusbar.ts diagnostics.ts
```

### Dependency rules

These are structural, not conventional. A violation should fail typecheck or review.

- **`core` imports neither `vscode` nor anything ambient.** No `process.cwd()`, no argless `new Date()`, no `Date.now()`. Every function takes `root: string` explicitly, and every dated function takes `dateIso: string`. The v0.1.0 plan imposed this as a convention for test determinism; the package split makes it enforceable.
- **`cli`** owns stdin/stdout, exit codes, and `cwd` resolution. Depends on `core`.
- **`extension`** owns the `vscode` API. Depends on `core`.
- **`extension` never spawns the CLI.** It imports `core` in-process, so LM tool calls carry no process-spawn cost.

### Build

| Package | Tool | Output |
|---|---|---|
| `core` | `tsc --noEmit` for typecheck only | Never emitted or published on its own. Consumed by bundling. |
| `cli` | `esbuild`, bundling `core` | ESM into `dist/`, `core` inlined. Published to npm; `minim init` vendors this `dist`. |
| `extension` | `esbuild`, bundling `core` | Single CJS `dist/extension.js`, `core` inlined. No `node_modules` inside the VSIX. |

`core` is a private workspace package, so it must never appear as an unresolvable dependency of a published artifact. Both consumers therefore *bundle* it rather than depend on it. This also preserves the zero-runtime-dependency property: the published `cli` tarball and the VSIX each contain exactly one self-contained JavaScript tree.

Two consequences:

1. `install()` in `packages/cli/src/cli/init.ts` currently copies raw `src/` JavaScript into `.minim/runtime`. It must copy compiled `dist` instead. Its test changes with it. Consumer repos still receive plain JS and still need only Node on PATH — nothing changes for teammates.
2. The VSIX must ship a copy of the compiled `cli` `dist` as a bundled asset, because the `minim.init` command writes the vendored runtime. The extension bundle stays a single CJS file; the vendored runtime is a separate directory of plain ESM JS copied at init time.

### Node version split

Development requires Node ≥ 24: tests run directly against `.ts` files using native type stripping, with no build step. This requires `erasableSyntaxOnly: true` in tsconfig — no enums, no namespaces, no parameter properties. That restriction is accepted to keep the test loop instant.

Published artifacts keep `engines: ">=20"`, since consumers run compiled JavaScript. CI covers both: TypeScript tests on Node 24, compiled `dist` smoke tests on Node 20.

## Core API

Mostly re-typing existing functions. Two additions.

### New: `searchMemory`

The relevance-grep currently lives as a private `relevantMemory()` inside `pack.js`. The `minim_memory` tool needs identical behavior. Extract it so both callers share one implementation and one set of tests.

```ts
export interface MemoryHit {
  date: string
  fact: string
  line: string
}

export interface SearchOptions {
  limit?: number      // default 20
  maxTokens?: number  // default 800
}

export interface SearchResult {
  hits: MemoryHit[]
  truncated: number   // hits dropped by limit or token cap
}

export function searchMemory(root: string, query: string, opts?: SearchOptions): SearchResult
```

The token cap is load-bearing, not decorative. A tool that returns an entire grown `decisions.md` is worse than the file read it replaces. When the cap trims results, `truncated` carries the count so the tool can say so.

Matching keeps v0.1.0 behavior: lowercase the query, split on non-word characters, drop tokens of 3 characters or fewer, return lines containing any remaining token.

**The caps apply to the LM tool only.** `buildPack` calls `searchMemory` with both `limit` and `maxTokens` set to `Infinity`, reproducing v0.1.0 pack output byte for byte. Piece A claims no behavior change and must mean it — the existing pack tests are the check. Defaults of 20 and 800 exist for the tool's benefit, and the tool passes them explicitly rather than relying on the default, so the distinction stays visible at both call sites.

### New: hook payload types

```ts
export interface HookInputBase {
  timestamp: string
  hook_event_name: string
  cwd?: string
  session_id?: string
  transcript_path?: string   // documented as NOT a stable API
}

export interface PreToolUseInput extends HookInputBase {
  tool_name?: string
  tool_input?: unknown
}

export interface PostToolUseInput extends PreToolUseInput {
  tool_output?: unknown
}

export interface UserPromptSubmitInput extends HookInputBase {
  prompt?: string
}
```

`field()` survives as a typed `pick()` helper. camelCase tolerance stays: the format is Preview-stage and VS Code rewrites event names when importing Copilot CLI configs.

### Unchanged in behavior, typed only

`estimateTokens`, `appendFacts`, `compactMemory`, `memPath`, `checkBudgets`, `buildPack`, `loadConfig`, `appendMetric`, `readMetrics`, `extractNotes`.

## Extension surface

### Language model tools

```json
{
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
      },
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
    ]
  }
}
```

Registered at activation with `vscode.lm.registerTool('minim_memory', ...)` and `vscode.lm.registerTool('minim_remember', ...)`.

`minim_remember` implements `prepareInvocation` returning an `invocationMessage` only — no confirmation dialog. It appends one line to a workspace file; a per-fact modal would train the model to stop calling it. Existing dedupe in `appendFacts` makes repeat calls harmless.

### Root resolution

LM tools receive no `cwd`. Resolve the workspace folder containing the active editor, falling back to the first workspace folder. Without this, multi-root workspaces write memory into the wrong package. When no folder is open, both tools return explanatory result text rather than throwing.

### Commands

| Command | Behavior |
|---|---|
| `minim.init` | Install the config pack and vendored runtime into the current workspace |
| `minim.pack` | Quick-pick files, prompt for task text, write and open the prompt file |
| `minim.budget` | Run the budget check, show the report |
| `minim.stats` | Show the metrics summary in an output channel |
| `minim.mem.list` | Open `decisions.md` |
| `minim.mem.compact` | Archive entries older than the configured age |

### Status bar

Displays the Tier 0 + Tier 1 token total — the fixed cost paid on every request — as `minim 1.2k/2.3k`, warning-colored when over budget. Clicking opens the budget report.

It deliberately does not display live session spend. No extension API observes Copilot's tool calls, so that number would be fabricated.

### Diagnostics

Budget overages become `vscode.Diagnostic` warnings on line 1 of the offending instruction file, published through a `DiagnosticCollection`. A human reads the Problems panel; a `systemMessage` buried in a chat transcript, they do not.

### Activation

`activationEvents: ["workspaceContains:.minim/config.json"]`. No cost in unrelated windows. Tool invocation also triggers activation.

## Hooks after the change

| Event | Status | Reason |
|---|---|---|
| `PreToolUse` | unchanged | Only mechanism that can intercept a read. No extension equivalent. |
| `PostToolUse` | unchanged | Only source of per-tool token data. No extension equivalent. |
| `SessionStart` | unchanged | Reaches the model. Diagnostics reach the human. Both, not either. |
| `UserPromptSubmit` | unchanged | `#remember` capture from the prompt. |
| `Stop` | demoted to fallback | Still scrapes `MINIM-NOTE:`, still writes the session metric. |
| `PreCompact` | demoted to fallback | Still scrapes and snapshots. |

`.github/hooks/minim.json` is untouched — six entries pointing at `.minim/runtime/bin/minim.js`.

Overlap between `minim_remember` and transcript scraping needs no new logic: `appendFacts` already dedupes against existing file content.

### Tier 0 template change

The managed block in `.github/copilot-instructions.md` gains instructions to call `#minimMemory` when planning and the remember tool for durable facts, keeping `MINIM-NOTE:` as the documented fallback for when tools are unavailable.

The block is currently ~250 tokens against a 1500 cap, so there is room. This edit invalidates the prompt-cache prefix, which is why it happens once at install time and never mid-session.

## Error handling

- Every hook invocation exits 0 and writes valid JSON, minimum `{"continue":true}`. Unchanged from v0.1.0. minim never uses exit 2.
- LM tools return *results*, not throws, for expected conditions: no memory file yet, empty query, no workspace folder, read-only filesystem. A thrown error reaches the model as a tool failure and trains it to stop calling the tool.
- Activation wraps in try/catch reporting to an output channel. A broken extension must not break the window.
- `MINIM_DEBUG=1` payload dumping in `hookrun` is retained — it is how spec C will capture real payloads.

## Testing

All 37 existing tests port directly; they are already pure-function tests against `mkdtempSync` temp directories.

New coverage:

- `searchMemory`: matching behavior, `limit`, the 800-token cap, and the `truncated` count.
- Typed hook decoder: snake_case fields, camelCase fallback, missing optional fields.
- `install()` vendoring compiled `dist` rather than `src`.

Extension tests stay cheap by keeping logic in `core`. Searching, capping, and root resolution are all plain functions with `node:test` coverage. The `LanguageModelTool` classes are thin adapters, so one `@vscode/test-electron` smoke test covers registration and invocation wiring.

## CI

GitHub Actions: `npm ci`, `tsc --noEmit`, `node --test` on Node 24, compiled-`dist` smoke test on Node 20, `esbuild` bundle, `vsce package`, upload the VSIX as a build artifact.

## Verification criteria

1. `npm test` green — 37 ported plus new.
2. `tsc --noEmit` clean under `strict`.
3. From a vendored install: `node .minim/runtime/bin/minim.js hook PreToolUse < payload.json` returns `{"continue":true}`.
4. VSIX installs; `#minimMemory` appears in the agent-mode tool list; results respect the token cap.
5. An agent calling `minim_remember` appends a dated line to `.minim/memory/decisions.md`.
6. Status bar shows the Tier 0+1 total; an over-budget file appears in the Problems panel.
7. A `MINIM_DEBUG=1` dump from a real Copilot session confirms the documented field names. This is what finally validates the hook layer end to end.

## Risks

| Risk | Mitigation |
|---|---|
| Agent hooks are Preview; format may drift | `MINIM_DEBUG=1` dumps, camelCase tolerance, typed decoder that localizes breakage to one file |
| `transcript_path` documented as unstable | Demoted to fallback. Primary write path is now the `minim_remember` tool. Full fallback design is spec C. |
| Model ignores the LM tools | Tier 0 instructs their use; `MINIM-NOTE:` scraping still catches facts. Whether the model actually calls them is measurable in spec D. |
| `decisions.md` grows unbounded, making `minim_memory` expensive | 800-token cap ships in this spec. Tier 2 budget enforcement is spec C. |
| `erasableSyntaxOnly` blocks a needed TS feature | Only affects enums, namespaces, parameter properties — none currently used, all avoidable |
| Savings remain unproven | Stated plainly. VSIX-only distribution until spec D produces baseline numbers. |
