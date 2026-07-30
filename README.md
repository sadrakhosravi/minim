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

    node /path/to/minim/bin/minim.js init

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
