// Injectable runner of external programs (`claude --version`, `codex app-server`, `ps`): no shell,
// a timeout, bounded output. Providers receive it through their context; tests pass fakes.
import { spawn } from 'node:child_process';

/** Options of one external program call. */
export interface RunOptions {
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
  /** Text written to stdin (stdin is closed afterwards). */
  input?: string;
  /** Kill the program after this many ms (default 15 s). */
  timeoutMs?: number;
  /** Longest stdout/stderr kept, in bytes (default 1 MiB each). */
  maxBytes?: number;
}

/** Outcome of a call; never thrown, so callers decide what a failure means. */
export interface RunResult {
  /** Exit code; null when the program did not start, timed out or was killed by a signal. */
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** errno code when the program could not be started (for example ENOENT). */
  startError: string | null;
}

/** Runs a program with arguments (never through a shell). */
export type CommandRunner = (command: string, args: readonly string[], options?: RunOptions) => Promise<RunResult>;

/** Default timeout of runCommand. */
export const COMMAND_TIMEOUT_MS = 15_000;

function definedEnv(env: Readonly<Record<string, string | undefined>> | undefined): NodeJS.ProcessEnv | undefined {
  if (!env) return undefined;
  const result: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) if (value !== undefined) result[key] = value;
  return result;
}

/** The real CommandRunner based on child_process.spawn. */
export const runCommand: CommandRunner = (command, args, options = {}) =>
  new Promise((resolve) => {
    const maxBytes = options.maxBytes ?? 1024 * 1024;
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outSize = 0;
    let errSize = 0;
    let timedOut = false;
    let settled = false;
    const finish = (result: Omit<RunResult, 'stdout' | 'stderr' | 'timedOut'>): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ...result,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        timedOut,
      });
    };
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: definedEnv(options.env),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs ?? COMMAND_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      if (outSize < maxBytes) out.push(chunk.subarray(0, maxBytes - outSize));
      outSize += chunk.length;
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (errSize < maxBytes) err.push(chunk.subarray(0, maxBytes - errSize));
      errSize += chunk.length;
    });
    child.on('error', (error: NodeJS.ErrnoException) => finish({ code: null, signal: null, startError: error.code ?? error.message }));
    child.on('close', (code, signal) => finish({ code: timedOut ? null : code, signal, startError: null }));
    child.stdin.on('error', () => undefined);
    child.stdin.end(options.input ?? '');
  });
