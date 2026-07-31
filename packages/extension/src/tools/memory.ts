import * as vscode from 'vscode';
import { searchMemory } from '../../../core/src/search.ts';
import { renderSearchResult } from '../../../core/src/render.ts';
import { currentRoot } from '../workspace.ts';
import { logError } from '../log.ts';

interface MemoryInput {
  query: string;
}

function text(value: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(value)]);
}

export class MemoryTool implements vscode.LanguageModelTool<MemoryInput> {
  // Every failure path returns a result rather than throwing: a thrown error
  // reaches the model as a tool failure and teaches it to stop calling the tool.
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<MemoryInput>
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const root = currentRoot();
      if (!root) {
        return text('No workspace folder is open, so no project memory is available.');
      }
      const query = (options.input?.query ?? '').trim();
      if (!query) {
        return text('The query was empty. Call this tool again with keywords describing the task.');
      }
      return text(renderSearchResult(searchMemory(root, query), query));
    } catch (e) {
      logError('minim_memory', e);
      return text('Project memory could not be read. Continue without it.');
    }
  }

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<MemoryInput>
  ): vscode.PreparedToolInvocation {
    return { invocationMessage: `Searching project decisions for "${options.input?.query ?? ''}"` };
  }
}
