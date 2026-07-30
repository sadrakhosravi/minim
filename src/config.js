import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = {
  guard: {
    denyPatterns: [
      'node_modules/',
      'dist/',
      'build/',
      '.min.js',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
    ],
    decision: 'ask',
  },
  memory: { maxAgeDays: 45 },
  pack: { maxTokens: 20000, maxLinesPerFile: 400 },
};

export function loadConfig(root) {
  const p = path.join(root, '.minim', 'config.json');
  let user = {};
  try {
    user = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    /* missing or malformed config falls back to defaults */
  }
  return {
    guard: { ...DEFAULTS.guard, ...user.guard },
    memory: { ...DEFAULTS.memory, ...user.memory },
    pack: { ...DEFAULTS.pack, ...user.pack },
  };
}
