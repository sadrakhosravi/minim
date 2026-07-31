import fs from 'node:fs';
import { memPath } from './memory.ts';
import { estimateTokens } from './tokens.ts';

export interface MemoryHit {
  date: string;
  fact: string;
  line: string;
}

export interface SearchOptions {
  limit?: number;
  maxTokens?: number;
}

export interface SearchResult {
  hits: MemoryHit[];
  truncated: number;
}

const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_TOKENS = 800;

function parseLine(line: string): MemoryHit {
  const m = line.match(/^- \[(\d{4}-\d{2}-\d{2})\] (.*)$/);
  if (m) return { date: m[1], fact: m[2].trim(), line };
  return { date: '', fact: line.replace(/^-\s*/, '').trim(), line };
}

export function searchMemory(
  root: string,
  query: string,
  opts: SearchOptions = {}
): SearchResult {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const p = memPath(root);
  if (!fs.existsSync(p)) return { hits: [], truncated: 0 };

  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  if (words.length === 0) return { hits: [], truncated: 0 };

  const matched = fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter((line) => {
      if (!line.trim()) return false;
      const l = line.toLowerCase();
      return words.some((w) => l.includes(w));
    });

  const hits: MemoryHit[] = [];
  let spent = 0;
  for (const line of matched) {
    if (hits.length >= limit) break;
    const cost = estimateTokens(line + '\n');
    // The length guard guarantees at least one hit when something matched: a cap
    // smaller than one line would otherwise read to the model as "no memory exists".
    if (hits.length > 0 && spent + cost > maxTokens) break;
    hits.push(parseLine(line));
    spent += cost;
  }
  return { hits, truncated: matched.length - hits.length };
}
