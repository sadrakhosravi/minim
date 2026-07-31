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
