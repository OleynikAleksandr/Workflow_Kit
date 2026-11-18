// M44 3.2: after `wfk hook session-start` recorded the session, it asks the running service for
// the autopilot line (POST /api/hooks/session-start) within what is left of the hook budget and
// prints the answer — the context of the new session in the client's dialect. A service that is
// down or late gives AUTOPILOT_UNKNOWN_LINE, so the agent never guesses the mode.
import os from 'node:os';
import { sessionStartAnswer } from '#agent-channel';
import { AUTOPILOT_UNKNOWN_LINE } from './autopilot-line.ts';
import { panelProcess, postJson, serviceUrl } from './hook-service.ts';
import type { PostJson } from './hook-service.ts';

/** Time kept for printing after the request; a shorter request is not started. */
export const SESSION_START_RESERVE_MS = 100;

export interface SessionStartLineDeps {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  env: Readonly<Record<string, string | undefined>>;
  homedir?: string;
  platform?: NodeJS.Platform;
  stdin: string;
  post?: PostJson;
  now?: () => number;
}

/**
 * The dialect of the fallback answer, when the service (which knows the dialects of its
 * providers) does not answer: Kimi Code takes `{ message }`, the others `additionalContext`.
 */
export function fallbackDialect(client: string): 'kimi' | 'claude' {
  return client === 'kimi' ? 'kimi' : 'claude';
}

/** Asks the service and prints one JSON answer line; never throws. */
export async function printSessionStartLine(client: string, deps: SessionStartLineDeps, deadline: number): Promise<void> {
  const print = (answer: unknown): void => deps.stdout(`${JSON.stringify(answer)}\n`);
  const fallback = (why: string): void => {
    if (deps.env['WFK_HOOK_DEBUG']) deps.stderr(`wfk hook session-start: ${why}\n`);
    print(sessionStartAnswer(fallbackDialect(client), AUTOPILOT_UNKNOWN_LINE));
  };
  try {
    const input = deps.stdin.trim() === '' ? {} : JSON.parse(deps.stdin);
    const base = await serviceUrl(deps.env, deps.homedir ?? os.homedir(), deps.platform ?? process.platform);
    const left = deadline - (deps.now ?? Date.now)() - SESSION_START_RESERVE_MS;
    if (left <= 0) return fallback('no time left in the hook budget');
    const reply = (await (deps.post ?? postJson)(
      `${base}/api/hooks/session-start`,
      { client, input, projectDir: deps.env['CLAUDE_PROJECT_DIR'] ?? null, panelProcess: panelProcess(deps.env) },
      left,
    )) as { answer?: unknown } | null;
    if (reply?.answer && typeof reply.answer === 'object') return print(reply.answer);
    fallback('the service answered without a line');
  } catch (error) {
    fallback(`service not reachable (${error instanceof Error ? error.message : String(error)})`);
  }
}
