import fs from 'node:fs';
import path from 'node:path';
import { buildPack } from '../../../core/src/pack.ts';
import { loadConfig } from '../../../core/src/config.ts';

export function run(args: string[]): void {
  const root = process.cwd();
  const files: string[] = [];
  let task = '';
  let out = '';
  let force = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--task') task = args[++i] ?? '';
    else if (args[i] === '--out') out = args[++i] ?? '';
    else if (args[i] === '--force') force = true;
    else files.push(args[i]);
  }
  if (!task || files.length === 0) {
    console.error('usage: minim pack --task "<description>" [--out <file>] [--force] <file>...');
    process.exit(1);
  }
  const { pack } = loadConfig(root);
  const { md, tokens } = buildPack({ task, files, root, maxLinesPerFile: pack.maxLinesPerFile });
  if (tokens > pack.maxTokens && !force) {
    console.error(
      `minim pack: ${tokens} tokens exceeds cap ${pack.maxTokens}. Trim files or pass --force.`
    );
    process.exit(1);
  }
  const dest = out || path.join('.github', 'prompts', 'minim-pack.prompt.md');
  fs.mkdirSync(path.dirname(path.resolve(root, dest)), { recursive: true });
  fs.writeFileSync(path.resolve(root, dest), md);
  console.log(`wrote ${dest} (~${tokens} tokens). Run it from chat with "/" or attach it.`);
}
