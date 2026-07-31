// Heuristic token estimator: ~4 chars per token, ±15%. Good enough for budgets.
export function estimateTokens(text: string): number {
  if (typeof text !== 'string' || text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}
