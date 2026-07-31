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

`core` is private and never published on its own — both consumers bundle it, so
each published artifact is one self-contained JavaScript tree with zero runtime
dependencies.

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

Requires Node 24: tests run directly against TypeScript via native type
stripping, with no build step. Published artifacts target Node 20.

    npm ci
    npm test          # builds, then runs all tests
    npm run typecheck
    npm run bench     # hook cold-start guard, ~23ms baseline
    npm run test:ext -w minim-vscode   # extension host; needs a display

## Habits the tool can't do for you

- New chat per task; `/compact` on long sessions; `/fork` to branch context.
- Don't idle mid-session — prompt cache retention is minutes.
- Route easy tasks to cheap models; premium models for design and debugging only.
- Inline completions and next-edit suggestions are free — push routine edits there.
