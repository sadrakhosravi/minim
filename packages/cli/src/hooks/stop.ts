import fs from 'node:fs';
import { extractNotes } from '../../../core/src/extract.ts';
import { appendFacts } from '../../../core/src/memory.ts';
import { appendMetric } from '../../../core/src/metrics.ts';
import { estimateTokens } from '../../../core/src/tokens.ts';
import { pick } from '../../../core/src/types.ts';
import type { HookOutput } from '../../../core/src/types.ts';

export async function handle(input: unknown): Promise<HookOutput | undefined> {
  const root = pick<string>(input, 'cwd') ?? process.cwd();
  const tp = pick<string>(input, 'transcript_path', 'transcriptPath');
  if (!tp || !fs.existsSync(tp)) return undefined;
  const text = fs.readFileSync(tp, 'utf8');
  const ts = pick<string>(input, 'timestamp') ?? new Date().toISOString();
  const n = appendFacts(root, extractNotes(text), ts.slice(0, 10));
  appendMetric(root, {
    ts,
    session: pick<string>(input, 'session_id', 'sessionId') ?? 'unknown',
    event: 'session_end',
    transcriptTokens: estimateTokens(text),
    factsSaved: n,
  });
  if (n === 0) return undefined;
  return { systemMessage: `minim remember: ${n} fact(s) saved to .minim/memory/decisions.md` };
}
