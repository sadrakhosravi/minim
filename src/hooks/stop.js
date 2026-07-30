import fs from 'node:fs';
import { extractNotes } from '../extract.js';
import { appendFacts } from '../memory.js';
import { appendMetric } from '../metrics.js';
import { estimateTokens } from '../tokens.js';
import { field } from '../hookio.js';

export async function handle(input) {
  const root = field(input, 'cwd') || process.cwd();
  const tp = field(input, 'transcript_path', 'transcriptPath');
  if (!tp || !fs.existsSync(tp)) return undefined;
  const text = fs.readFileSync(tp, 'utf8');
  const ts = field(input, 'timestamp') || new Date().toISOString();
  const n = appendFacts(root, extractNotes(text), ts.slice(0, 10));
  appendMetric(root, {
    ts,
    session: field(input, 'session_id', 'sessionId') || 'unknown',
    event: 'session_end',
    transcriptTokens: estimateTokens(text),
    factsSaved: n,
  });
  if (n === 0) return undefined;
  return { systemMessage: `minim remember: ${n} fact(s) saved to .minim/memory/decisions.md` };
}
