// Static consistency checks between the VS Code manifest and the source.
// A mismatch between contributes.languageModelTools[].name and the first
// argument to vscode.lm.registerTool fails SILENTLY at runtime, so it cannot be
// caught by anything except an extension-host run or a check like this one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

interface Manifest {
  main: string;
  engines: { vscode: string };
  activationEvents: string[];
  contributes: {
    languageModelTools?: Array<{
      name: string;
      displayName: string;
      modelDescription: string;
      toolReferenceName?: string;
      inputSchema: { type: string; properties: Record<string, unknown>; required?: string[] };
    }>;
    commands?: Array<{ command: string; title: string }>;
  };
}

const read = (rel: string): string =>
  fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const manifest = JSON.parse(read('../package.json')) as Manifest;
const activationSource = read('../src/extension.ts');

function registeredToolNames(): string[] {
  return [...activationSource.matchAll(/registerTool\(\s*'([^']+)'/g)].map((m) => m[1]);
}

function registeredCommandIds(): string[] {
  const commandsSource = fs.existsSync(fileURLToPath(new URL('../src/commands.ts', import.meta.url)))
    ? read('../src/commands.ts')
    : '';
  return [...commandsSource.matchAll(/wrap\(\s*'([^']+)'/g)].map((m) => m[1]);
}

test('every contributed tool is registered in activation, and vice versa', () => {
  const contributed = (manifest.contributes.languageModelTools ?? []).map((t) => t.name).sort();
  assert.deepEqual(registeredToolNames().sort(), contributed);
});

test('contributed tools declare their required inputs', () => {
  for (const tool of manifest.contributes.languageModelTools ?? []) {
    assert.equal(tool.inputSchema.type, 'object', `${tool.name} inputSchema is not an object`);
    assert.ok(tool.inputSchema.required?.length, `${tool.name} declares no required input`);
    for (const req of tool.inputSchema.required ?? []) {
      assert.ok(tool.inputSchema.properties[req], `${tool.name} requires "${req}" but does not define it`);
    }
    assert.ok(tool.modelDescription.length > 40, `${tool.name} modelDescription is too thin to guide the model`);
  }
});

test('every contributed command is registered in activation, and vice versa', () => {
  const contributed = (manifest.contributes.commands ?? []).map((c) => c.command).sort();
  assert.deepEqual(registeredCommandIds().sort(), contributed);
});

test('manifest main points at the CJS bundle the build emits', () => {
  assert.equal(manifest.main, './dist/extension.cjs');
  assert.match(read('../package.json'), /--outfile=dist\/extension\.cjs/);
});

test('engine floor matches the release that introduced agent hooks', () => {
  assert.equal(manifest.engines.vscode, '^1.109.0');
});

test('activation is scoped to minim-enabled workspaces', () => {
  assert.deepEqual(manifest.activationEvents, ['workspaceContains:.minim/config.json']);
});
