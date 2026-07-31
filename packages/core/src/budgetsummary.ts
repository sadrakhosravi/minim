import path from 'node:path';
import type { BudgetEntry } from './budget.ts';

export interface BudgetSummary {
  tokens: number;
  cap: number;
  over: boolean;
  overFiles: string[];
}

export function summarizeBudget(entries: BudgetEntry[]): BudgetSummary {
  return {
    tokens: entries.reduce((a, e) => a + e.tokens, 0),
    cap: entries.reduce((a, e) => a + e.cap, 0),
    over: entries.some((e) => e.over),
    overFiles: entries.filter((e) => e.over).map((e) => path.basename(e.path)),
  };
}

export function formatTokens(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`;
}
