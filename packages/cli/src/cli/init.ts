import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../../core/src/install.ts';

export function run(): void {
  // After bundling, import.meta.url is <pkg>/dist/minim.js, so the package root is one level up.
  const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const written = install(process.cwd(), {
    templatesDir: path.join(pkgRoot, 'templates'),
    runtimeDir: pkgRoot,
  });
  for (const line of written) console.log(line);
  console.log('\nminim init done. Commit .github/ and .minim/ (metrics/snapshots are gitignored).');
  console.log('If .vscode/settings.json existed, merge .minim/suggested-settings.json by hand.');
}
