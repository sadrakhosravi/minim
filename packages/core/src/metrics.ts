import fs from 'node:fs';
import path from 'node:path';

export interface MetricRecord {
  ts: string;
  [key: string]: unknown;
}

export function appendMetric(root: string, obj: MetricRecord): void {
  const dir = path.join(root, '.minim', 'metrics');
  fs.mkdirSync(dir, { recursive: true });
  const month = obj.ts.slice(0, 7);
  fs.appendFileSync(path.join(dir, `${month}.jsonl`), JSON.stringify(obj) + '\n');
}

export function readMetrics(root: string): MetricRecord[] {
  const dir = path.join(root, '.minim', 'metrics');
  if (!fs.existsSync(dir)) return [];
  const out: MetricRecord[] = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as MetricRecord);
      } catch {
        /* skip corrupt lines */
      }
    }
  }
  return out;
}
