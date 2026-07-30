import { appendMetric } from '../metrics.js';
import { estimateTokens } from '../tokens.js';
import { field } from '../hookio.js';

export async function handle(input) {
  const root = field(input, 'cwd') || process.cwd();
  const toolOutput = field(input, 'tool_output', 'toolOutput');
  appendMetric(root, {
    ts: field(input, 'timestamp') || new Date().toISOString(),
    session: field(input, 'session_id', 'sessionId') || 'unknown',
    event: 'tool',
    tool: field(input, 'tool_name', 'toolName') || 'unknown',
    inTokens: estimateTokens(JSON.stringify(field(input, 'tool_input', 'toolInput') ?? '')),
    outTokens: estimateTokens(
      typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput ?? '')
    ),
  });
  return undefined;
}
