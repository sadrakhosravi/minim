import fs from 'node:fs';
import path from 'node:path';

export function memPath(root) {
  return path.join(root, '.minim', 'memory', 'decisions.md');
}

export function appendFacts(root, facts, dateIso) {
  if (!facts || facts.length === 0) return 0;
  const p = memPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const existing = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const fresh = facts.filter((f) => f.trim() && !existing.includes(f.trim()));
  if (fresh.length) {
    fs.appendFileSync(p, fresh.map((f) => `- [${dateIso}] ${f.trim()}\n`).join(''));
  }
  return fresh.length;
}
