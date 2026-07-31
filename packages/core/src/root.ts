import path from 'node:path';

function contains(folder: string, file: string): boolean {
  const rel = path.relative(folder, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Workspace-folder selection policy. Most specific containing folder wins,
 * then the first folder, then nothing. Kept free of `vscode` so it is testable
 * with plain node:test.
 */
export function resolveRoot(
  folders: readonly string[],
  activeFile?: string
): string | undefined {
  if (folders.length === 0) return undefined;
  if (activeFile) {
    const matches = folders.filter((f) => contains(f, activeFile));
    if (matches.length > 0) {
      return matches.reduce((best, f) => (f.length > best.length ? f : best));
    }
  }
  return folders[0];
}
