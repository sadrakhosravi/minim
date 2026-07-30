import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { estimateTokens } from './tokens.js';

export const TIER0_CAP = 1500;
export const TIER1_CAP = 800;

function checkFile(path, cap) {
  const tokens = estimateTokens(readFileSync(path, 'utf8'));
  return { path, tokens, cap, over: tokens > cap };
}

export function checkBudgets(root) {
  const report = [];
  const tier0 = join(root, '.github', 'copilot-instructions.md');
  if (existsSync(tier0)) report.push(checkFile(tier0, TIER0_CAP));
  const tier1Dir = join(root, '.github', 'instructions');
  if (existsSync(tier1Dir)) {
    for (const f of readdirSync(tier1Dir)) {
      if (f.endsWith('.instructions.md')) report.push(checkFile(join(tier1Dir, f), TIER1_CAP));
    }
  }
  return report;
}
