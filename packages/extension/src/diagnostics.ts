import * as vscode from 'vscode';
import { checkBudgets } from '../../core/src/budget.ts';
import { currentRoot } from './workspace.ts';
import { logError } from './log.ts';

export function createDiagnostics(context: vscode.ExtensionContext): () => void {
  const collection = vscode.languages.createDiagnosticCollection('minim');
  context.subscriptions.push(collection);

  return function refresh(): void {
    try {
      collection.clear();
      const root = currentRoot();
      if (!root) return;
      for (const entry of checkBudgets(root)) {
        if (!entry.over) continue;
        const d = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 0),
          `minim: ${entry.tokens} tokens exceeds the ${entry.cap}-token budget. ` +
            'This cost is paid on every request in every session.',
          vscode.DiagnosticSeverity.Warning
        );
        d.source = 'minim';
        collection.set(vscode.Uri.file(entry.path), [d]);
      }
    } catch (e) {
      logError('diagnostics', e);
    }
  };
}
