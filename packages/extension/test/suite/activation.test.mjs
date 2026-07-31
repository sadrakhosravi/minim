import assert from 'node:assert/strict';
import * as vscode from 'vscode';

export const tests = [
  [
    'extension is present and activates',
    async () => {
      const ext = vscode.extensions.getExtension('sadrakhosravi.minim-vscode');
      assert.ok(ext, 'extension not found by id');
      await ext.activate();
      assert.equal(ext.isActive, true);
    },
  ],
];
