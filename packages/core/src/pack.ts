import fs from 'node:fs';
import path from 'node:path';
import { estimateTokens } from './tokens.ts';
import { searchMemory } from './search.ts';

export interface PackInput {
  task: string;
  files: string[];
  root: string;
  maxLinesPerFile?: number;
}

export interface PackOutput {
  md: string;
  tokens: number;
}

export function buildPack({ task, files, root, maxLinesPerFile = 400 }: PackInput): PackOutput {
  const sections: string[] = [];
  for (const f of files) {
    const text = fs.readFileSync(path.resolve(root, f), 'utf8');
    const lines = text.split('\n');
    const body =
      lines.length > maxLinesPerFile
        ? lines.slice(0, maxLinesPerFile).join('\n') +
          `\n... [truncated ${lines.length - maxLinesPerFile} lines]`
        : text;
    sections.push(`## ${f}\n\n\`\`\`\n${body}\n\`\`\``);
  }
  // Caps are the LM tool's concern. Pack reproduces v0.1.0 output exactly.
  const mem = searchMemory(root, task, { limit: Infinity, maxTokens: Infinity }).hits;
  const md = [
    '---\nmode: agent\n---',
    `# Task\n\n${task}`,
    mem.length ? `# Prior decisions\n\n${mem.map((h) => h.line).join('\n')}` : '',
    `# Files\n\n${sections.join('\n\n')}`,
    '# Rules\n\nWork only within the files above. Ask before reading anything else. Emit `MINIM-NOTE: <fact>` for any decision worth remembering.',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { md, tokens: estimateTokens(md) };
}
