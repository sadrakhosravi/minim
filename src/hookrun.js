import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStdinJson, respond, field } from './hookio.js';

// Handler modules register here as tasks land. Each exports handle(input) -> object|undefined.
export const handlers = {
  SessionStart: () => import('./hooks/sessionstart.js'),
  UserPromptSubmit: () => import('./hooks/userprompt.js'),
  Stop: () => import('./hooks/stop.js'),
  PreCompact: () => import('./hooks/precompact.js'),
  PreToolUse: () => import('./hooks/pretooluse.js'),
  PostToolUse: () => import('./hooks/posttooluse.js'),
};

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
