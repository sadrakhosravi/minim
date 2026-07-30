import fs from 'node:fs';
import path from 'node:path';
import { extractNotes } from '../extract.js';
import { appendFacts } from '../memory.js';
import { field } from '../hookio.js';

export async function handle(input) {
  const root = field(input, 'cwd') || process.cwd();
  const tp = field(input, 'transcript_path', 'transcriptPath');
  if (!tp || !fs.existsSync(tp)) return undefined;
  const text = fs.readFileSync(tp, 'utf8');
  const ts = field(input, 'timestamp') || new Date().toISOString();
  const session = field(input, 'session_id', 'sessionId') || 'session';
  const dir = path.join(root, '.minim', 'snapshots');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${session}-${Date.parse(ts)}.txt`), text);
  const n = appendFacts(root, extractNotes(text), ts.slice(0, 10));
  if (n === 0) return undefined;
  return { systemMessage: `minim: persisted ${n} fact(s) before compaction.` };
}
