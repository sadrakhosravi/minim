import fs from 'node:fs';
import { appendFacts, compactMemory, memPath } from '../memory.js';
import { loadConfig } from '../config.js';

export function run(args) {
  const root = process.cwd();
  const sub = args[0];
  if (sub === 'add') {
    const fact = args.slice(1).join(' ').trim();
    if (!fact) return console.error('usage: minim mem add <fact>');
    const n = appendFacts(root, [fact], new Date().toISOString().slice(0, 10));
    console.log(n ? 'saved.' : 'duplicate, skipped.');
  } else if (sub === 'list') {
    const p = memPath(root);
    console.log(fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '(no memory yet)');
  } else if (sub === 'compact') {
    const { memory } = loadConfig(root);
    const r = compactMemory(root, memory.maxAgeDays, new Date().toISOString().slice(0, 10));
    console.log(`kept ${r.kept}, archived ${r.archived} (older than ${memory.maxAgeDays}d).`);
  } else {
    console.error('usage: minim mem <add|list|compact>');
    process.exit(1);
  }
}
