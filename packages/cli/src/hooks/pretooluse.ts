import { loadConfig } from '../../../core/src/config.ts';
import { pick } from '../../../core/src/types.ts';
import type { HookOutput } from '../../../core/src/types.ts';

export async function handle(input: unknown): Promise<HookOutput | undefined> {
  const root = pick<string>(input, 'cwd') ?? process.cwd();
  const { guard } = loadConfig(root);
  const toolInput = pick<unknown>(input, 'tool_input', 'toolInput');
  const haystack = JSON.stringify(toolInput ?? '');
  const hit = guard.denyPatterns.find((p) => haystack.includes(p));
  if (!hit) return undefined;
  return {
    hookSpecificOutput: {
      permissionDecision: guard.decision,
      permissionDecisionReason: `minim guard: "${hit}" is vendored/generated — reading it costs tokens for no signal. Override in .minim/config.json if intentional.`,
    },
  };
}
