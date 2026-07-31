---
applyTo: "src/**"
---

<!-- Tier 1 memory: loaded ONLY when the agent touches files matching applyTo. -->
<!-- Keep under 800 tokens (run: minim budget). Put subsystem facts here, not style rules. -->

Example subsystem notes (replace with your own):
- Service layer throws `AppError`; controllers never throw raw.
- All DB access goes through `src/db/repo.js` — no inline SQL elsewhere.
