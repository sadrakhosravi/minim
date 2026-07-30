import fs from 'node:fs';
import path from 'node:path';
import { estimateTokens } from './tokens.js';
import { memPath } from './memory.js';

function relevantMemory(root, task) {
  const p = memPath(root);
  if (!fs.existsSync(p)) return [];
  const words = task.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  if (words.length === 0) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter((line) => {
      const l = line.toLowerCase();
      return line.trim() && words.some((w) => l.includes(w));
    });
}

export function buildPack({ task, files, root, maxLinesPerFile = 400 }) {
  const sections = [];
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
  const mem = relevantMemory(root, task);
  const md = [
    '---\nmode: agent\n---',
    `# Task\n\n${task}`,
    mem.length ? `# Prior decisions\n\n${mem.join('\n')}` : '',
    `# Files\n\n${sections.join('\n\n')}`,
    '# Rules\n\nWork only within the files above. Ask before reading anything else. Emit `MINIM-NOTE: <fact>` for any decision worth remembering.',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { md, tokens: estimateTokens(md) };
}
