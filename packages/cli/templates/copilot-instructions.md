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
