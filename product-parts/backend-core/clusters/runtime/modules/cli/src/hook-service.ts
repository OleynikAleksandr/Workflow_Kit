// wfk hook stop|prompt: hands the hook input to the running service (POST /api/hooks/<event> on
// the loopback address) and prints the service's answer for the agent. A missing or broken service
// means no output and exit 0, so the agent session is never disturbed. wfk hook turn-end only tells
// the service that the turn ended (a hook that cannot be held) and never prints anything.
import http from 'node:http';
import os from 'node:os';
import { loadConfig, resolveDataDirs } from '#data-store';

/** How long a Stop may wait for the service (the service holds it at most 9 minutes). */
export const STOP_REQUEST_MS = 9 * 60_000 + 30_000;
/** How long a UserPromptSubmit may wait. */
export const PROMPT_REQUEST_MS = 20_000;
/** How long a turn end notice may wait: the service answers at once. */
export const TURN_END_REQUEST_MS = 3000;

export type ServiceEvent = 'stop' | 'prompt';

/** Posts JSON to a loopback URL; resolves to the parsed answer or rejects. */
export type PostJson = (url: string, body: unknown, timeoutMs: number) => Promise<unknown>;

/** Posts JSON to a loopback URL; resolves to the status and the parsed answer (null when not JSON). */
export type RequestJson = (url: string, body: unknown, timeoutMs: number) => Promise<{ status: number; body: unknown }>;

export const postJson: PostJson = async (url, body, timeoutMs) => {
  const reply = await requestJson(url, body, timeoutMs);
  if (reply.status >= 300) throw new Error(`HTTP ${reply.status}`);
  return reply.body;
};

export const requestJson: RequestJson = (url, body, timeoutMs) =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    const payload = JSON.stringify(body);
    const req = http.request(
      target,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Origin: `${target.protocol}//${target.host}`,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            parsed = null;
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(payload);
  });

export interface ServiceHookDeps {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  env: Readonly<Record<string, string | undefined>>;
  homedir?: string;
  platform?: NodeJS.Platform;
  stdin: string;
  post?: PostJson;
}

/** The service URL from the data dirs and config (WFK_PORT, WFK_DATA_DIR). */
export async function serviceUrl(env: Readonly<Record<string, string | undefined>>, homedir: string, platform: NodeJS.Platform): Promise<string> {
  const dirs = resolveDataDirs({ platform, env, homedir });
  const config = await loadConfig({ dirs, env, homedir });
  return `http://127.0.0.1:${config.port}`;
}

/** Runs one service-backed hook; never throws. */
export async function runServiceHook(event: ServiceEvent, client: string | undefined, deps: ServiceHookDeps): Promise<void> {
  const debug = (text: string): void => {
    if (deps.env['WFK_HOOK_DEBUG']) deps.stderr(`wfk hook ${event}: ${text}\n`);
  };
  let input: unknown;
  try {
    input = deps.stdin.trim() === '' ? {} : JSON.parse(deps.stdin);
  } catch {
    debug('вход хука — не JSON');
    return;
  }
  try {
    const base = await serviceUrl(deps.env, deps.homedir ?? os.homedir(), deps.platform ?? process.platform);
    const reply = (await (deps.post ?? postJson)(
      `${base}/api/hooks/${event}`,
      { client, input, projectDir: deps.env['CLAUDE_PROJECT_DIR'] ?? null },
      event === 'stop' ? STOP_REQUEST_MS : PROMPT_REQUEST_MS,
    )) as { answer?: unknown } | null;
    const answer = reply?.answer;
    if (answer && typeof answer === 'object') deps.stdout(`${JSON.stringify(answer)}\n`);
  } catch (error) {
    debug(`служба недоступна (${error instanceof Error ? error.message : String(error)})`);
  }
}

/**
 * Tells the service that a turn ended: POST /api/hooks/turn-end { client, sessionId, cwd, event },
 * the event being hook_event_name of the input (Stop, StopFailure, Interrupt). Prints nothing and
 * never throws, also when the service is down.
 */
export async function runTurnEndHook(client: string, deps: ServiceHookDeps): Promise<void> {
  const debug = (text: string): void => {
    if (deps.env['WFK_HOOK_DEBUG']) deps.stderr(`wfk hook turn-end: ${text}\n`);
  };
  try {
    const input = JSON.parse(deps.stdin) as Record<string, unknown> | null;
    const sessionId = input?.['session_id'];
    const event = input?.['hook_event_name'];
    if (typeof sessionId !== 'string' || sessionId === '' || typeof event !== 'string') return debug('во входе хука нет session_id или hook_event_name');
    const cwd = typeof input?.['cwd'] === 'string' ? input['cwd'] : null;
    const base = await serviceUrl(deps.env, deps.homedir ?? os.homedir(), deps.platform ?? process.platform);
    await (deps.post ?? postJson)(`${base}/api/hooks/turn-end`, { client, sessionId, cwd, event }, TURN_END_REQUEST_MS);
  } catch (error) {
    debug(error instanceof SyntaxError ? 'вход хука — не JSON' : `служба недоступна (${error instanceof Error ? error.message : String(error)})`);
  }
}
