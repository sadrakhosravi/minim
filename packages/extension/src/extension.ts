import * as vscode from 'vscode';
import { initLog, log, logError } from './log.ts';
import { MemoryTool } from './tools/memory.ts';
import { RememberTool } from './tools/remember.ts';
import { createStatusBar } from './statusbar.ts';
import { createDiagnostics } from './diagnostics.ts';
import { watchInstructionFiles } from './watch.ts';
import { registerCommands } from './commands.ts';

export function activate(context: vscode.ExtensionContext): void {
  initLog(context);
  try {
    // The registered name must match contributes.languageModelTools exactly,
    // or registration fails silently at runtime.
    context.subscriptions.push(vscode.lm.registerTool('minim_memory', new MemoryTool()));
    log('registered minim_memory');
    context.subscriptions.push(vscode.lm.registerTool('minim_remember', new RememberTool()));
    log('registered minim_remember');

    const refreshStatus = createStatusBar(context);
    const refreshDiagnostics = createDiagnostics(context);
    const refresh = (): void => {
      refreshStatus();
      refreshDiagnostics();
    };
    watchInstructionFiles(context, refresh);
    refresh();
    registerCommands(context, refresh);

    log('minim activated');
  } catch (e) {
    // A broken extension must never break the window.
    logError('activate', e);
  }
}

export function deactivate(): void {
  /* disposables are registered on context.subscriptions */
}
