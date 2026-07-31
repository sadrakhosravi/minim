import { checkBudgets } from '../../../core/src/budget.ts';
import { pick } from '../../../core/src/types.ts';
import type { HookOutput } from '../../../core/src/types.ts';

export async function handle(input: unknown): Promise<HookOutput | undefined> {
  const root = pick<string>(input, 'cwd') ?? process.cwd();
  const over = checkBudgets(root).filter((r) => r.over);
  if (over.length === 0) return undefined;
  const list = over.map((r) => `${r.path} (${r.tokens}/${r.cap} tok)`).join(', ');
  return {
    systemMessage: `minim warn: instruction files over budget — every session pays for these: ${list}. Run "minim budget" and trim.`,
  };
}
