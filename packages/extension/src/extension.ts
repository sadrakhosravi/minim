import * as vscode from 'vscode';
import { initLog, log, logError } from './log.ts';
import { MemoryTool } from './tools/memory.ts';
import { RememberTool } from './tools/remember.ts';

export function activate(context: vscode.ExtensionContext): void {
  initLog(context);
  try {
    // The registered name must match contributes.languageModelTools exactly,
    // or registration fails silently at runtime.
    context.subscriptions.push(vscode.lm.registerTool('minim_memory', new MemoryTool()));
    log('registered minim_memory');
    context.subscriptions.push(vscode.lm.registerTool('minim_remember', new RememberTool()));
    log('registered minim_remember');
    log('minim activated');
  } catch (e) {
    // A broken extension must never break the window.
    logError('activate', e);
  }
}

export function deactivate(): void {
  /* disposables are registered on context.subscriptions */
}
