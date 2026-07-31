import { appendFacts } from '../../../core/src/memory.ts';
import { pick } from '../../../core/src/types.ts';
import type { HookOutput } from '../../../core/src/types.ts';

export async function handle(input: unknown): Promise<HookOutput | undefined> {
  const prompt = pick<string>(input, 'prompt') ?? '';
  const idx = prompt.indexOf('#remember');
  if (idx === -1) return undefined;
  const fact = prompt.slice(idx + '#remember'.length).trim();
  if (!fact) return undefined;
  const root = pick<string>(input, 'cwd') ?? process.cwd();
  const date = (pick<string>(input, 'timestamp') ?? new Date().toISOString()).slice(0, 10);
  appendFacts(root, [fact], date);
  return { systemMessage: 'minim remember: saved.' };
}
