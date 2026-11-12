// Hook input of Claude and Codex (verified 2026-11-06 with Claude 2.1.318 and codex-cli 0.166.0):
// session_id (for Codex the thread id), turn_id (Codex only), transcript_path, cwd,
// hook_event_name, stop_hook_active (Stop), last_assistant_message (Stop), prompt (UserPromptSubmit);
// session_title (Claude 2.1.319 UserPromptSubmit: the session's current title).
// Kimi Code 2.5.2 (dialect 'kimi') sends the UserPromptSubmit prompt as an array of parts
// ([{ type: 'text', text }]) and takes { message } as the answer.
import type { HookDialect } from '#provider-registry';

/** Id of the provider whose hook calls (wfk hook --client <id>); the provider registry names them. */
export type AgentClient = string;

/**
 * The hook clients the service knows: the dialect of a client, undefined for an unknown one. The
 * service builds it from the provider registry (Provider.hookDialect, 'claude' when absent).
 */
export type HookDialects = (client: string) => HookDialect | undefined;

/** Shape of a client id; without a registry any such id is taken with the claude dialect. */
const CLIENT_ID = /^[a-z][a-z0-9-]{0,31}$/;
const anyClient: HookDialects = (client) => (CLIENT_ID.test(client) ? 'claude' : undefined);

/** The fields of a hook input the service uses. */
export interface HookInput {
  client: AgentClient;
  /** Format of the client's hook input and answers. */
  dialect: HookDialect;
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
  /**
   * The hook runs inside a process the panel started (wfk hook saw WFK_PANEL_SESSION=1). False for
   * a hook of the user's own app or terminal, and for a client that does not mark its processes.
   */
  panelProcess: boolean;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** The prompt of UserPromptSubmit: a string, or the text parts of an array joined by a newline. */
function promptText(value: unknown): string | null {
  if (!Array.isArray(value)) return text(value);
  const parts: string[] = [];
  for (const part of value as unknown[]) {
    if (typeof part === 'string') parts.push(part);
    else if (typeof part === 'object' && part !== null && typeof (part as { text?: unknown }).text === 'string') parts.push((part as { text: string }).text);
  }
  return text(parts.join('\n'));
}

/**
 * Reads a hook input object; null for a client the registry does not know (dialects) or an input
 * without a session id. panelProcess is the mark of the hook request: only true counts.
 */
export function parseHookInput(client: unknown, raw: unknown, projectDir?: unknown, dialects: HookDialects = anyClient, panelProcess?: unknown): HookInput | null {
  const dialect = typeof client === 'string' ? dialects(client) : undefined;
  if (typeof client !== 'string' || !dialect || typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const sessionId = text(input['session_id']);
  if (!sessionId) return null;
  return {
    client,
    dialect,
    sessionId,
    turnId: text(input['turn_id']),
    cwd: text(input['cwd']),
    projectDir: text(projectDir),
    transcriptPath: text(input['transcript_path']),
    stopHookActive: input['stop_hook_active'] === true,
    lastAssistantMessage: text(input['last_assistant_message']),
    prompt: promptText(input['prompt']),
    sessionTitle: text(input['session_title']),
    panelProcess: panelProcess === true,
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

/** UserPromptSubmit hook answer of the kimi dialect: the text is added to the turn's context. */
export function messageAnswer(text: string): { message: string } {
  return { message: text };
}

/** UserPromptSubmit hook answer with the text, in the client's dialect. */
export function promptAnswer(dialect: HookDialect, text: string): Record<string, unknown> {
  return dialect === 'kimi' ? messageAnswer(text) : contextAnswer(text);
}
