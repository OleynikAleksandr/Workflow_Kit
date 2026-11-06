// Hook input of Claude and Codex (verified 2026-11-06 with Claude 2.1.318 and codex-cli 0.166.0):
// session_id (for Codex the thread id), turn_id (Codex only), transcript_path, cwd,
// hook_event_name, stop_hook_active (Stop), last_assistant_message (Stop), prompt (UserPromptSubmit);
// session_title (Claude 2.1.319 UserPromptSubmit: the session's current title).

export type AgentClient = 'claude' | 'codex';
export const AGENT_CLIENTS: readonly AgentClient[] = ['claude', 'codex'];

/** The fields of a hook input the service uses. */
export interface HookInput {
  client: AgentClient;
  sessionId: string;
  turnId: string | null;
  cwd: string | null;
  /** $CLAUDE_PROJECT_DIR of the hook process, when set. */
  projectDir: string | null;
  transcriptPath: string | null;
  stopHookActive: boolean;
  lastAssistantMessage: string | null;
  prompt: string | null;
  /** Current title of the session in the app (Claude only), when it has one. */
  sessionTitle: string | null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export function isAgentClient(value: unknown): value is AgentClient {
  return value === 'claude' || value === 'codex';
}

/** Reads a hook input object; null without a client or a session id. */
export function parseHookInput(client: unknown, raw: unknown, projectDir?: unknown): HookInput | null {
  if (!isAgentClient(client) || typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const sessionId = text(input['session_id']);
  if (!sessionId) return null;
  return {
    client,
    sessionId,
    turnId: text(input['turn_id']),
    cwd: text(input['cwd']),
    projectDir: text(projectDir),
    transcriptPath: text(input['transcript_path']),
    stopHookActive: input['stop_hook_active'] === true,
    lastAssistantMessage: text(input['last_assistant_message']),
    prompt: text(input['prompt']),
    sessionTitle: text(input['session_title']),
  };
}

/** Key of a session in the channel: <client>:<session id>. */
export function sessionKey(client: AgentClient, sessionId: string): string {
  return `${client}:${sessionId}`;
}

/** Stop hook answer that makes the agent continue with the text as the next instruction. */
export function blockAnswer(reason: string): { decision: 'block'; reason: string } {
  return { decision: 'block', reason };
}

/** UserPromptSubmit hook answer that adds context to the turn. */
export function contextAnswer(text: string): { hookSpecificOutput: { hookEventName: 'UserPromptSubmit'; additionalContext: string } } {
  return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } };
}
