import * as vscode from 'vscode';
import { appendFacts } from '../../../core/src/memory.ts';
import { currentRoot } from '../workspace.ts';
import { logError } from '../log.ts';

interface RememberInput {
  fact: string;
}

function text(value: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(value)]);
}

export class RememberTool implements vscode.LanguageModelTool<RememberInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RememberInput>
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const root = currentRoot();
      if (!root) {
        return text('No workspace folder is open, so the decision could not be recorded.');
      }
      const fact = (options.input?.fact ?? '').trim();
      if (!fact) {
        return text('The fact was empty. Nothing was recorded.');
      }
      // Ambient date is allowed here: this is an adapter. appendFacts still
      // receives its date explicitly, keeping core free of ambient state.
      const today = new Date().toISOString().slice(0, 10);
      const written = appendFacts(root, [fact], today);
      return text(
        written > 0
          ? `Recorded in .minim/memory/decisions.md: ${fact}`
          : 'Already recorded — nothing written. Do not record this fact again.'
      );
    } catch (e) {
      logError('minim_remember', e);
      return text('The decision could not be written to disk. Continue without recording it.');
    }
  }

  // invocationMessage only, deliberately no confirmationMessages: a modal in
  // front of every recorded fact would train the model to stop calling this.
  // The write is one appended line inside the open workspace, and appendFacts
  // dedupes, so repeat calls are inert.
  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<RememberInput>
  ): vscode.PreparedToolInvocation {
    return { invocationMessage: `Recording decision: ${options.input?.fact ?? ''}` };
  }
}
