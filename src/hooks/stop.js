import fs from 'node:fs';
import { extractNotes } from '../extract.js';
import { appendFacts } from '../memory.js';
import { field } from '../hookio.js';

export async function handle(input) {
  const root = field(input, 'cwd') || process.cwd();
  const tp = field(input, 'transcript_path', 'transcriptPath');
  if (!tp || !fs.existsSync(tp)) return undefined;
  const date = (field(input, 'timestamp') || new Date().toISOString()).slice(0, 10);
  const n = appendFacts(root, extractNotes(fs.readFileSync(tp, 'utf8')), date);
  if (n === 0) return undefined;
  return { systemMessage: `minim remember: ${n} fact(s) saved to .minim/memory/decisions.md` };
}
