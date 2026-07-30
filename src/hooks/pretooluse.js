import { loadConfig } from '../config.js';
import { field } from '../hookio.js';

export async function handle(input) {
  const root = field(input, 'cwd') || process.cwd();
  const { guard } = loadConfig(root);
  const toolInput = field(input, 'tool_input', 'toolInput');
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
