import { summarize } from '../../../core/src/summarize.ts';

export function run(): void {
  const s = summarize(process.cwd());
  console.log(`sessions:            ${s.sessions}`);
  console.log(
    `transcript tokens:   ${s.totalTranscriptTokens} total, ${s.avgTranscriptTokens} avg/session (±15% estimate)`
  );
  console.log(`facts saved:         ${s.factsSaved}`);
  console.log('tool calls:');
  for (const [tool, n] of Object.entries(s.toolCalls).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${tool}`);
  }
}
