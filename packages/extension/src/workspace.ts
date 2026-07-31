import * as vscode from 'vscode';
import { resolveRoot } from '../../core/src/root.ts';

/** Workspace folder the tools and commands act on. Policy lives in core. */
export function currentRoot(): string | undefined {
  const folders = (vscode.workspace.workspaceFolders ?? [])
    .filter((f) => f.uri.scheme === 'file')
    .map((f) => f.uri.fsPath);
  const active = vscode.window.activeTextEditor?.document.uri;
  const activeFile = active?.scheme === 'file' ? active.fsPath : undefined;
  return resolveRoot(folders, activeFile);
}
