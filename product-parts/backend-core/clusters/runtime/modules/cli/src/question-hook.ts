// wfk hook question --client claude (spec M33 section 2.3, variant A1): the PermissionRequest hook of
// AskUserQuestion. It makes a waiterId at its start and holds POST /api/hooks/question requests, each
// at most QUESTION_REQUEST_MS, asking again on { wait: true }. A decision of the service is printed
// as the hook answer. No service, a refusal or { release: true } — exit 0 without output: the native
// dialog goes on. A break after the service answered once is retried for QUESTION_RECOVERY_MS (a
// restart of the service), then the hook gives up silently. It never answers for other tools.
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { panelProcess, requestJson, serviceUrl } from './hook-service.ts';
import type { RequestJson } from './hook-service.ts';

/** Longest single request; the service answers { wait: true } before it. */
export const QUESTION_REQUEST_MS = 9 * 60_000;
/** How long a broken connection is retried after the service answered once. */
export const QUESTION_RECOVERY_MS = 2 * 60_000;
/** Pause between two retries of a broken connection. */
export const QUESTION_RETRY_PAUSE_MS = 2000;
/** The only tool the hook is for. */
export const QUESTION_TOOL = 'AskUserQuestion';

export interface QuestionHookDeps {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  env: Readonly<Record<string, string | undefined>>;
  homedir?: string;
  platform?: NodeJS.Platform;
  stdin: string;
  request?: RequestJson;
  /** Tests inject time, sleep and the waiter id. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  waiterId?: string;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Runs the question hook; never throws, prints at most one decision. */
export async function runQuestionHook(client: string, deps: QuestionHookDeps): Promise<void> {
  const debug = (text: string): void => {
    if (deps.env['WFK_HOOK_DEBUG']) deps.stderr(`wfk hook question: ${text}\n`);
  };
  let input: unknown;
  try {
    input = JSON.parse(deps.stdin);
  } catch {
    return debug('вход хука — не JSON');
  }
  if (!isObject(input) || input['tool_name'] !== QUESTION_TOOL) return debug('не вопрос AskUserQuestion');
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const request = deps.request ?? requestJson;
  const waiterId = deps.waiterId ?? randomUUID();
  let url: string;
  try {
    url = `${await serviceUrl(deps.env, deps.homedir ?? os.homedir(), deps.platform ?? process.platform)}/api/hooks/question`;
  } catch (error) {
    return debug(`служба недоступна (${error instanceof Error ? error.message : String(error)})`);
  }
  const body = { client, input, projectDir: deps.env['CLAUDE_PROJECT_DIR'] ?? null, panelProcess: panelProcess(deps.env), waiterId };
  let answered = false;
  let brokenSince: number | null = null;
  for (;;) {
    let reply: { status: number; body: unknown };
    try {
      reply = await request(url, body, QUESTION_REQUEST_MS);
    } catch (error) {
      if (!answered) return debug(`служба недоступна (${error instanceof Error ? error.message : String(error)})`);
      brokenSince ??= now();
      if (now() - brokenSince >= QUESTION_RECOVERY_MS) return debug('связь со службой не вернулась');
      await sleep(QUESTION_RETRY_PAUSE_MS);
      continue;
    }
    answered = true;
    brokenSince = null;
    if (reply.status !== 200 || !isObject(reply.body)) return debug(`служба отказала (HTTP ${reply.status})`);
    if (reply.body['wait'] === true) continue;
    const decision = reply.body['decision'];
    if (isObject(decision)) deps.stdout(`${JSON.stringify(decision)}\n`);
    return;
  }
}
