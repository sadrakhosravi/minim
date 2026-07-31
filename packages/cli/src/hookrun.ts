import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pick } from '../../core/src/types.ts';
import type { HookOutput } from '../../core/src/types.ts';
import { readStdinJson, respond } from './hookio.ts';
import { handle as sessionStart } from './hooks/sessionstart.ts';
import { handle as userPromptSubmit } from './hooks/userprompt.ts';
import { handle as preToolUse } from './hooks/pretooluse.ts';
import { handle as postToolUse } from './hooks/posttooluse.ts';
import { handle as stop } from './hooks/stop.ts';
import { handle as preCompact } from './hooks/precompact.ts';

export type HookHandler = (input: unknown) => Promise<HookOutput | undefined>;

// Static imports rather than v0.1.0's lazy `() => import(...)`: everything lands
// in one bundled file, so lazy loading buys nothing. scripts/bench-hook.mjs
// verifies cold start did not regress.
// SubagentStart and SubagentStop are the two remaining documented events; they
// stay unwired and belong to the deferred hook-hardening spec.
export const handlers: Partial<Record<string, HookHandler>> = {
  SessionStart: sessionStart,
  UserPromptSubmit: userPromptSubmit,
  PreToolUse: preToolUse,
  PostToolUse: postToolUse,
  PreCompact: preCompact,
  Stop: stop,
};

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
