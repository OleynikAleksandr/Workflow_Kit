// wfk hook session-start|stop|prompt|turn-end --client <provider id>. A client that is not a provider of
// the service (provider-list.ts) is refused: nothing is recorded, asked or printed. session-start reads the hook JSON
// from stdin and hands it to kit-structure; it never prints to stdout (Claude adds hook stdout to
// the session context) and gives up after HOOK_BUDGET_MS. stop and prompt ask the running service
// (hook-service.ts) and print its answer; turn-end only tells it that the turn ended and prints
// nothing. Every subcommand always exits with 0.
import { recordSessionStart } from '#kit-structure';
import { runServiceHook, runTurnEndHook } from './hook-service.ts';
import { PROVIDER_IDS } from './provider-list.ts';
import type { PostJson } from './hook-service.ts';

/** Whole time budget of the hook; the spec allows 2 s. */
export const HOOK_BUDGET_MS = 1500;
/** How long to wait for stdin to close. */
export const STDIN_TIMEOUT_MS = 1000;
/** Larger stdin is cut (the hook input is a small JSON object). */
const MAX_STDIN_BYTES = 256 * 1024;

/** Inputs of runHook; tests inject stdin, env and cwd. */
export interface HookDeps {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  homedir?: string;
  platform?: NodeJS.Platform;
  /** Posts to the service (stop, prompt, turn-end); tests pass a fake. */
  post?: PostJson;
  /** Provider ids accepted as --client (default: PROVIDER_IDS). */
  clients?: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  cwd: string;
  readStdin: (timeoutMs: number) => Promise<string>;
}

/** Reads the process stdin until it closes or the timeout passes; a terminal gives an empty string. */
export function readProcessStdin(timeoutMs: number): Promise<string> {
  const stdin = process.stdin;
  if (stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stdin.off('data', onData);
      stdin.off('end', finish);
      stdin.off('error', finish);
      stdin.destroy();
      resolve(Buffer.concat(chunks).toString('utf8'));
    };
    const onData = (chunk: Buffer | string): void => {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      if (size + buffer.length <= MAX_STDIN_BYTES) chunks.push(buffer);
      size += buffer.length;
    };
    const timer = setTimeout(finish, timeoutMs);
    stdin.on('data', onData);
    stdin.on('end', finish);
    stdin.on('error', finish);
  });
}

/** Value of --name <value> or --name=<value>. */
function option(args: readonly string[], name: string): string | undefined {
  for (const [index, arg] of args.entries()) {
    if (arg === name) return args[index + 1];
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
  }
  return undefined;
}

async function sessionStart(args: readonly string[], deps: HookDeps): Promise<void> {
  const stdin = await deps.readStdin(STDIN_TIMEOUT_MS);
  const result = await recordSessionStart({ client: option(args, '--client'), clients: deps.clients ?? PROVIDER_IDS, stdin, env: deps.env, cwd: deps.cwd });
  if (!result.recorded && deps.env['WFK_HOOK_DEBUG']) deps.stderr(`wfk hook: ${result.reason}\n`);
}

/** Runs a hook subcommand; unknown subcommands are ignored. Always resolves to exit code 0. */
export async function runHook(args: readonly string[], deps: HookDeps): Promise<number> {
  const [event, ...rest] = args;
  if (event === 'stop' || event === 'prompt' || event === 'turn-end') {
    const client = option(rest, '--client');
    if (!client || !(deps.clients ?? PROVIDER_IDS).includes(client)) {
      if (deps.env['WFK_HOOK_DEBUG']) deps.stderr(`wfk hook: unknown client: ${String(client)}\n`);
      return 0;
    }
    try {
      const stdin = await deps.readStdin(STDIN_TIMEOUT_MS);
      if (event === 'turn-end') await runTurnEndHook(client, { ...deps, stdin });
      else await runServiceHook(event, client, { ...deps, stdin });
    } catch (error) {
      if (deps.env['WFK_HOOK_DEBUG']) deps.stderr(`wfk hook: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    return 0;
  }
  if (event !== 'session-start') return 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      deps.stderr('wfk hook: время вышло, сессия не записана\n');
      resolve();
    }, HOOK_BUDGET_MS);
  });
  try {
    await Promise.race([sessionStart(rest, deps), budget]);
  } catch (error) {
    deps.stderr(`wfk hook: ${error instanceof Error ? error.message : String(error)}\n`);
  } finally {
    clearTimeout(timer);
  }
  return 0;
}
