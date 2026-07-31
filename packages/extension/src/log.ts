import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function initLog(context: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel('minim');
  context.subscriptions.push(channel);
}

export function log(message: string): void {
  channel?.appendLine(message);
}

export function logError(scope: string, e: unknown): void {
  const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
  channel?.appendLine(`[${scope}] ${msg}`);
}
