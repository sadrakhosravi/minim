import fs from 'node:fs';
import path from 'node:path';

export function appendMetric(root, obj) {
  const dir = path.join(root, '.minim', 'metrics');
  fs.mkdirSync(dir, { recursive: true });
  const month = (obj.ts || new Date().toISOString()).slice(0, 7);
  fs.appendFileSync(path.join(dir, `${month}.jsonl`), JSON.stringify(obj) + '\n');
}

export function readMetrics(root) {
  const dir = path.join(root, '.minim', 'metrics');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        /* skip corrupt lines */
      }
    }
  }
  return out;
}
