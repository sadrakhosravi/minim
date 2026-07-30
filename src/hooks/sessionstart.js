import { checkBudgets } from '../budget.js';
import { field } from '../hookio.js';

export async function handle(input) {
  const root = field(input, 'cwd') || process.cwd();
  const over = checkBudgets(root).filter((r) => r.over);
  if (over.length === 0) return undefined;
  const list = over.map((r) => `${r.path} (${r.tokens}/${r.cap} tok)`).join(', ');
  return {
    systemMessage: `minim warn: instruction files over budget — every session pays for these: ${list}. Run "minim budget" and trim.`,
  };
}
