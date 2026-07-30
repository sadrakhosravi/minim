import { readMetrics } from '../metrics.js';

export function summarize(root) {
  const recs = readMetrics(root);
  const ends = recs.filter((r) => r.event === 'session_end');
  const tools = recs.filter((r) => r.event === 'tool');
  const totalTranscriptTokens = ends.reduce((a, r) => a + (r.transcriptTokens || 0), 0);
  const toolCalls = {};
  for (const t of tools) toolCalls[t.tool] = (toolCalls[t.tool] || 0) + 1;
  return {
    sessions: ends.length,
    totalTranscriptTokens,
    avgTranscriptTokens: ends.length ? Math.round(totalTranscriptTokens / ends.length) : 0,
    factsSaved: ends.reduce((a, r) => a + (r.factsSaved || 0), 0),
    toolCalls,
  };
}

export function run() {
  const s = summarize(process.cwd());
  console.log(`sessions:            ${s.sessions}`);
  console.log(`transcript tokens:   ${s.totalTranscriptTokens} total, ${s.avgTranscriptTokens} avg/session (±15% estimate)`);
  console.log(`facts saved:         ${s.factsSaved}`);
  console.log('tool calls:');
  for (const [tool, n] of Object.entries(s.toolCalls).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${tool}`);
  }
}
