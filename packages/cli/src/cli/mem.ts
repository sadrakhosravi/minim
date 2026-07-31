import fs from 'node:fs';
import { appendFacts, compactMemory, memPath } from '../../../core/src/memory.ts';
import { loadConfig } from '../../../core/src/config.ts';

export function run(args: string[]): void {
  const root = process.cwd();
  const sub = args[0];
  const today = new Date().toISOString().slice(0, 10);
  if (sub === 'add') {
    const fact = args.slice(1).join(' ').trim();
    if (!fact) {
      console.error('usage: minim mem add <fact>');
      process.exit(1);
    }
    console.log(appendFacts(root, [fact], today) ? 'saved.' : 'duplicate, skipped.');
  } else if (sub === 'list') {
    const p = memPath(root);
    console.log(fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '(no memory yet)');
  } else if (sub === 'compact') {
    const { memory } = loadConfig(root);
    const r = compactMemory(root, memory.maxAgeDays, today);
    console.log(`kept ${r.kept}, archived ${r.archived} (older than ${memory.maxAgeDays}d).`);
  } else {
    console.error('usage: minim mem <add|list|compact>');
    process.exit(1);
  }
}
