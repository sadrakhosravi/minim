import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const here = path.dirname(fileURLToPath(import.meta.url));

try {
  await runTests({
    extensionDevelopmentPath: path.resolve(here, '..'),
    extensionTestsPath: path.resolve(here, 'suite', 'index.mjs'),
    launchArgs: ['--disable-extensions', '--disable-gpu'],
  });
} catch {
  console.error('extension tests failed');
  process.exit(1);
}
