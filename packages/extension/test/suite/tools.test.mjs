import assert from 'node:assert/strict';
import * as vscode from 'vscode';

const EXT_ID = 'sadrakhosravi.minim-vscode';

function textOf(result) {
  return result.content
    .filter((p) => p instanceof vscode.LanguageModelTextPart)
    .map((p) => p.value)
    .join('');
}

export const tests = [
  [
    'minim_memory is registered and visible in lm.tools',
    async () => {
      await vscode.extensions.getExtension(EXT_ID).activate();
      const tool = vscode.lm.tools.find((t) => t.name === 'minim_memory');
      assert.ok(tool, 'minim_memory not registered');
    },
  ],
  [
    'minim_memory returns text for a query with no matches',
    async () => {
      await vscode.extensions.getExtension(EXT_ID).activate();
      const result = await vscode.lm.invokeTool('minim_memory', {
        input: { query: 'nonexistent subject matter' },
        toolInvocationToken: undefined,
      });
      assert.ok(textOf(result).length > 0, 'tool returned no text');
    },
  ],
];
