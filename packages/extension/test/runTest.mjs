import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const here = path.dirname(fileURLToPath(import.meta.url));

// The tools resolve their root from the open workspace folder, so the harness
// must open one. Without it currentRoot() is undefined and every write-path
// assertion fails on "No workspace folder is open" — which is correct product
// behavior, not a bug. .minim/config.json also matches the activation event.
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'minim-fixture-'));
fs.mkdirSync(path.join(fixture, '.minim'), { recursive: true });
fs.writeFileSync(
  path.join(fixture, '.minim', 'config.json'),
  JSON.stringify({ guard: { decision: 'ask' } }, null, 2) + '\n'
);

try {
  await runTests({
    extensionDevelopmentPath: path.resolve(here, '..'),
    extensionTestsPath: path.resolve(here, 'suite', 'index.mjs'),
    launchArgs: [fixture, '--disable-extensions', '--disable-gpu'],
  });
} catch {
  console.error('extension tests failed');
  process.exit(1);
}
