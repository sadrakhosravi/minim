import { checkBudgets } from '../budget.js';

export function run() {
  const report = checkBudgets(process.cwd());
  if (report.length === 0) {
    console.log('minim budget: no instruction files found.');
    return;
  }
  for (const r of report) {
    console.log(`${r.over ? 'OVER ' : 'ok   '} ${r.tokens}/${r.cap} tok  ${r.path}`);
  }
  process.exitCode = report.some((r) => r.over) ? 1 : 0;
}
