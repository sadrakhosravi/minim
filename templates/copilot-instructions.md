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
