import assert from 'node:assert/strict';
import * as vscode from 'vscode';

const EXT_ID = 'sadrakhosravi.minim-vscode';

const EXPECTED = [
  'minim.init',
  'minim.pack',
  'minim.budget',
  'minim.stats',
  'minim.mem.list',
  'minim.mem.compact',
];

export const tests = [
  [
    'all six commands are registered',
    async () => {
      await vscode.extensions.getExtension(EXT_ID).activate();
      const all = await vscode.commands.getCommands(true);
      for (const id of EXPECTED) {
        assert.ok(all.includes(id), `${id} not registered`);
      }
    },
  ],
  [
    'minim.budget runs without throwing',
    async () => {
      await vscode.extensions.getExtension(EXT_ID).activate();
      await vscode.commands.executeCommand('minim.budget');
    },
  ],
  [
    'minim.stats runs without throwing',
    async () => {
      await vscode.extensions.getExtension(EXT_ID).activate();
      await vscode.commands.executeCommand('minim.stats');
    },
  ],
];
