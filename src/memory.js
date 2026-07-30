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

export function compactMemory(root, maxAgeDays, todayIso) {
  const p = memPath(root);
  if (!fs.existsSync(p)) return { kept: 0, archived: 0 };
  const cutoff = new Date(todayIso).getTime() - maxAgeDays * 86400000;
  const keep = [];
  const old = [];
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(/^- \[(\d{4}-\d{2}-\d{2})\]/);
    if (m && new Date(m[1]).getTime() < cutoff) old.push(line);
    else keep.push(line);
  }
  if (old.length) {
    const ap = path.join(root, '.minim', 'archive', `${todayIso.slice(0, 7)}.md`);
    fs.mkdirSync(path.dirname(ap), { recursive: true });
    fs.appendFileSync(ap, old.join('\n') + '\n');
    fs.writeFileSync(p, keep.length ? keep.join('\n') + '\n' : '');
  }
  return { kept: keep.length, archived: old.length };
}
