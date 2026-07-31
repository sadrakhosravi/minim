import * as vscode from 'vscode';
import { checkBudgets } from '../../core/src/budget.ts';
import { formatTokens, summarizeBudget } from '../../core/src/budgetsummary.ts';
import { currentRoot } from './workspace.ts';
import { logError } from './log.ts';

export function createStatusBar(context: vscode.ExtensionContext): () => void {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'minim.budget';
  context.subscriptions.push(item);

  return function refresh(): void {
    try {
      const root = currentRoot();
      if (!root) {
        item.hide();
        return;
      }
      const s = summarizeBudget(checkBudgets(root));
      if (s.cap === 0) {
        item.hide();
        return;
      }
      // Deliberately the fixed per-request cost, not live session spend: no
      // extension API observes Copilot's tool calls, so that number would be a lie.
      item.text = `$(book) minim ${formatTokens(s.tokens)}/${formatTokens(s.cap)}`;
      item.tooltip = s.over
        ? `Instruction files over budget: ${s.overFiles.join(', ')}. Every request pays this.`
        : 'Instruction-file tokens paid on every request. Click for the full report.';
      item.backgroundColor = s.over
        ? new vscode.ThemeColor('statusBarItem.warningBackground')
        : undefined;
      item.show();
    } catch (e) {
      logError('statusbar', e);
      item.hide();
    }
  };
}
