import { appendMetric } from '../../../core/src/metrics.ts';
import { estimateTokens } from '../../../core/src/tokens.ts';
import { pick } from '../../../core/src/types.ts';
import type { HookOutput } from '../../../core/src/types.ts';

export async function handle(input: unknown): Promise<HookOutput | undefined> {
  const root = pick<string>(input, 'cwd') ?? process.cwd();
  const toolOutput = pick<unknown>(input, 'tool_output', 'toolOutput');
  appendMetric(root, {
    ts: pick<string>(input, 'timestamp') ?? new Date().toISOString(),
    session: pick<string>(input, 'session_id', 'sessionId') ?? 'unknown',
    event: 'tool',
    tool: pick<string>(input, 'tool_name', 'toolName') ?? 'unknown',
    inTokens: estimateTokens(JSON.stringify(pick<unknown>(input, 'tool_input', 'toolInput') ?? '')),
    outTokens: estimateTokens(
      typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput ?? '')
    ),
  });
  return undefined;
}
