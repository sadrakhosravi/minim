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
