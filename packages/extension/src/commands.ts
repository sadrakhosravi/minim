import * as vscode from 'vscode';
import path from 'node:path';
import fs from 'node:fs';
import { install } from '../../core/src/install.ts';
import { buildPack } from '../../core/src/pack.ts';
import { checkBudgets } from '../../core/src/budget.ts';
import { summarize } from '../../core/src/summarize.ts';
import { compactMemory, memPath } from '../../core/src/memory.ts';
import { loadConfig } from '../../core/src/config.ts';
import { currentRoot } from './workspace.ts';
import { log, logError } from './log.ts';

function requireRoot(): string | undefined {
  const root = currentRoot();
  if (!root) void vscode.window.showWarningMessage('minim: open a folder first.');
  return root;
}

async function runInit(context: vscode.ExtensionContext, refresh: () => void): Promise<void> {
  const root = requireRoot();
  if (!root) return;
  const assetsDir = path.join(context.extensionUri.fsPath, 'assets');
  const written = install(root, {
    templatesDir: path.join(assetsDir, 'templates'),
    runtimeDir: path.join(assetsDir, 'runtime'),
  });
  for (const line of written) log(line);
  refresh();
  void vscode.window.showInformationMessage(
    `minim: installed ${written.length} item(s). Commit .github/ and .minim/.`
  );
}

async function runPack(): Promise<void> {
  const root = requireRoot();
  if (!root) return;
  const task = await vscode.window.showInputBox({
    title: 'minim pack',
    prompt: 'Describe the task. Prior decisions matching these words are pulled in.',
    ignoreFocusOut: true,
  });
  if (!task) return;

  const picks = await vscode.window.showOpenDialog({
    canSelectMany: true,
    openLabel: 'Pack these files',
    defaultUri: vscode.Uri.file(root),
  });
  if (!picks || picks.length === 0) return;

  const { pack } = loadConfig(root);
  const files = picks.map((u) => path.relative(root, u.fsPath));
  const { md, tokens } = buildPack({ task, files, root, maxLinesPerFile: pack.maxLinesPerFile });

  if (tokens > pack.maxTokens) {
    const go = await vscode.window.showWarningMessage(
      `minim pack: ~${tokens} tokens exceeds the ${pack.maxTokens} cap.`,
      'Write anyway',
      'Cancel'
    );
    if (go !== 'Write anyway') return;
  }

  const dest = path.join(root, '.github', 'prompts', 'minim-pack.prompt.md');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, md);
  const doc = await vscode.workspace.openTextDocument(dest);
  await vscode.window.showTextDocument(doc);
  void vscode.window.showInformationMessage(`minim pack: ~${tokens} tokens written.`);
}

function runBudget(): void {
  const root = requireRoot();
  if (!root) return;
  const report = checkBudgets(root);
  if (report.length === 0) {
    log('budget: no instruction files found.');
  } else {
    for (const r of report) {
      log(`${r.over ? 'OVER ' : 'ok   '} ${r.tokens}/${r.cap} tok  ${r.path}`);
    }
  }
  void vscode.commands.executeCommand('workbench.action.output.toggleOutput');
}

function runStats(): void {
  const root = requireRoot();
  if (!root) return;
  const s = summarize(root);
  log(`sessions:            ${s.sessions}`);
  log(
    `transcript tokens:   ${s.totalTranscriptTokens} total, ${s.avgTranscriptTokens} avg/session (±15% estimate)`
  );
  log(`facts saved:         ${s.factsSaved}`);
  log('tool calls:');
  for (const [tool, n] of Object.entries(s.toolCalls).sort((a, b) => b[1] - a[1])) {
    log(`  ${String(n).padStart(5)}  ${tool}`);
  }
  void vscode.commands.executeCommand('workbench.action.output.toggleOutput');
}

async function runMemList(): Promise<void> {
  const root = requireRoot();
  if (!root) return;
  const p = memPath(root);
  if (!fs.existsSync(p)) {
    void vscode.window.showInformationMessage('minim: no memory recorded yet.');
    return;
  }
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(p));
}

function runMemCompact(): void {
  const root = requireRoot();
  if (!root) return;
  const { memory } = loadConfig(root);
  const today = new Date().toISOString().slice(0, 10);
  const r = compactMemory(root, memory.maxAgeDays, today);
  void vscode.window.showInformationMessage(
    `minim: kept ${r.kept}, archived ${r.archived} (older than ${memory.maxAgeDays}d).`
  );
}

export function registerCommands(context: vscode.ExtensionContext, refresh: () => void): void {
  // Every command is wrapped so a thrown error becomes an output-channel entry
  // and one error toast, never an unhandled rejection.
  const wrap = (id: string, fn: () => void | Promise<void>): vscode.Disposable =>
    vscode.commands.registerCommand(id, async () => {
      try {
        await fn();
      } catch (e) {
        logError(id, e);
        void vscode.window.showErrorMessage(`minim: ${id} failed. See the minim output channel.`);
      }
    });

  context.subscriptions.push(
    wrap('minim.init', () => runInit(context, refresh)),
    wrap('minim.pack', runPack),
    wrap('minim.budget', runBudget),
    wrap('minim.stats', runStats),
    wrap('minim.mem.list', runMemList),
    wrap('minim.mem.compact', runMemCompact)
  );
}
