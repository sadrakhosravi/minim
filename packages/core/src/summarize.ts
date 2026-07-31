import { readMetrics } from './metrics.ts';

export interface Summary {
  sessions: number;
  totalTranscriptTokens: number;
  avgTranscriptTokens: number;
  factsSaved: number;
  toolCalls: Record<string, number>;
}

export function summarize(root: string): Summary {
  const recs = readMetrics(root);
  const ends = recs.filter((r) => r.event === 'session_end');
  const tools = recs.filter((r) => r.event === 'tool');
  const totalTranscriptTokens = ends.reduce(
    (a, r) => a + ((r.transcriptTokens as number) || 0),
    0
  );
  const toolCalls: Record<string, number> = {};
  for (const t of tools) {
    const name = (t.tool as string) || 'unknown';
    toolCalls[name] = (toolCalls[name] || 0) + 1;
  }
  return {
    sessions: ends.length,
    totalTranscriptTokens,
    avgTranscriptTokens: ends.length ? Math.round(totalTranscriptTokens / ends.length) : 0,
    factsSaved: ends.reduce((a, r) => a + ((r.factsSaved as number) || 0), 0),
    toolCalls,
  };
}
