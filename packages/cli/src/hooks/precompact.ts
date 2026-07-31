import fs from 'node:fs';
import path from 'node:path';
import { extractNotes } from '../../../core/src/extract.ts';
import { appendFacts } from '../../../core/src/memory.ts';
import { pick } from '../../../core/src/types.ts';
import type { HookOutput } from '../../../core/src/types.ts';

export async function handle(input: unknown): Promise<HookOutput | undefined> {
  const root = pick<string>(input, 'cwd') ?? process.cwd();
  const tp = pick<string>(input, 'transcript_path', 'transcriptPath');
  if (!tp || !fs.existsSync(tp)) return undefined;
  const text = fs.readFileSync(tp, 'utf8');
  const ts = pick<string>(input, 'timestamp') ?? new Date().toISOString();
  const session = pick<string>(input, 'session_id', 'sessionId') ?? 'session';
  const dir = path.join(root, '.minim', 'snapshots');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${session}-${Date.parse(ts)}.txt`), text);
  const n = appendFacts(root, extractNotes(text), ts.slice(0, 10));
  if (n === 0) return undefined;
  return { systemMessage: `minim: persisted ${n} fact(s) before compaction.` };
}
