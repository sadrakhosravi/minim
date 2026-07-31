// Hook payload shapes as documented by VS Code. Top-level fields are snake_case;
// camelCase tolerance is retained because the format is Preview-stage and VS Code
// rewrites Copilot CLI event names when importing their configs.
export interface HookInputBase {
  timestamp: string;
  hook_event_name: string;
  cwd?: string;
  session_id?: string;
  /** Documented as NOT a stable API. Treated as a fallback source only. */
  transcript_path?: string;
}

export interface PreToolUseInput extends HookInputBase {
  tool_name?: string;
  tool_input?: unknown;
}

export interface PostToolUseInput extends PreToolUseInput {
  tool_output?: unknown;
}

export interface UserPromptSubmitInput extends HookInputBase {
  prompt?: string;
}

export type PermissionDecision = 'allow' | 'ask' | 'deny';

export interface HookOutput {
  continue?: boolean;
  stopReason?: string;
  systemMessage?: string;
  hookSpecificOutput?: {
    permissionDecision?: PermissionDecision;
    permissionDecisionReason?: string;
  };
}

/** First defined key wins. Payloads are untrusted JSON, so the input is `unknown`. */
export function pick<T>(input: unknown, ...names: string[]): T | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const rec = input as Record<string, unknown>;
  for (const n of names) {
    if (rec[n] !== undefined) return rec[n] as T;
  }
  return undefined;
}
