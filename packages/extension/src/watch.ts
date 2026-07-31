import * as vscode from 'vscode';

/**
 * Refresh triggers for the status bar and diagnostics. Also warns once per
 * session when the Tier 0 file is edited: it is the prompt-cache prefix, so
 * changing it mid-session forces a full-price reprocess on the next request.
 */
export function watchInstructionFiles(
  context: vscode.ExtensionContext,
  onChange: () => void
): void {
  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/.github/{copilot-instructions.md,instructions/*.instructions.md}'
  );
  context.subscriptions.push(watcher);
  watcher.onDidChange(onChange, undefined, context.subscriptions);
  watcher.onDidCreate(onChange, undefined, context.subscriptions);
  watcher.onDidDelete(onChange, undefined, context.subscriptions);

  let warned = false;
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!doc.uri.fsPath.endsWith('copilot-instructions.md')) return;
      onChange();
      if (warned) return;
      warned = true;
      void vscode.window.showInformationMessage(
        'minim: copilot-instructions.md is the prompt-cache prefix. Editing it mid-session makes the next request reprocess the whole prefix at full price.'
      );
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(onChange),
    vscode.workspace.onDidChangeWorkspaceFolders(onChange)
  );
}
