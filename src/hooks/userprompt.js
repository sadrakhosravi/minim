import { appendFacts } from '../memory.js';
import { field } from '../hookio.js';

export async function handle(input) {
  const prompt = field(input, 'prompt') || '';
  const idx = prompt.indexOf('#remember');
  if (idx === -1) return undefined;
  const fact = prompt.slice(idx + '#remember'.length).trim();
  if (!fact) return undefined;
  const root = field(input, 'cwd') || process.cwd();
  const date = (field(input, 'timestamp') || new Date().toISOString()).slice(0, 10);
  appendFacts(root, [fact], date);
  return { systemMessage: 'minim remember: saved.' };
}
