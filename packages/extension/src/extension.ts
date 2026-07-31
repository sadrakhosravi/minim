import * as vscode from 'vscode';
import { initLog, log, logError } from './log.ts';

export function activate(context: vscode.ExtensionContext): void {
  initLog(context);
  try {
    log('minim activated');
  } catch (e) {
    // A broken extension must never break the window.
    logError('activate', e);
  }
}

export function deactivate(): void {
  /* disposables are registered on context.subscriptions */
}
