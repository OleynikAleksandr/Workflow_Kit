// Runs Kit commands as `node <bundle> <command> …` in the project folder and reads the JSON
// envelope Kit prints ({ command, ok, result } or { ok: false, code, message, nextAction }).
// inspect and install run with the app's bundle (the project may have no Kit yet); every other
// command runs with the project's own bundle, so a project keeps the Kit version it installed.
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { CommandRunner } from '#process-supervisor';
import type { KitProposal, KitStatus } from '#plan-view';

/** Codes the runner adds to Kit's own error codes. */
export type KitRunnerCode = 'KIT_NO_BUNDLE' | 'KIT_NOT_INSTALLED' | 'KIT_SPAWN' | 'KIT_TIMEOUT' | 'KIT_OUTPUT';

export interface KitSuccess<T> {
  ok: true;
  command: string;
  result: T;
}

/** A Kit error envelope or a runner failure; never thrown by the runner. */
export interface KitFailure {
  ok: false;
  code: string;
  message: string;
  nextAction: string | null;
  details: unknown;
}

export type KitOutcome<T> = KitSuccess<T> | KitFailure;

/** Result of `inspect`. */
export interface KitInspect {
  action: string;
  state: string;
  version: string | null;
  path: string;
  git: { repository: boolean; head: string | null; identity: { name: string; email: string } | null };
  transactionPending: boolean;
  damaged: unknown[];
}

/** Result of `install`. */
export interface KitInstall {
  version: string;
  previousState: string;
  written: string[];
  commit: { sha: string; role: string } | null;
  migrationRequired: boolean;
}

export interface KitRunnerOptions {
  runCommand: CommandRunner;
  /** Path of the app's verified bundle (kit-bundle); a rejection becomes KIT_NO_BUNDLE. */
  appBundle: () => Promise<string>;
  /** Node executable (default: the running one). */
  nodePath?: string;
  env?: Readonly<Record<string, string | undefined>>;
  /** Default timeout of a command (default 60 s). */
  timeoutMs?: number;
}

export interface RunKitOptions {
  timeoutMs?: number;
}

export interface KitRunner {
  /** The project's own bundle path. */
  projectBundle(root: string): string;
  /** True when the project's bundle exists (Kit installed). */
  installed(root: string): boolean;
  /** Any command with the project's bundle. */
  run<T>(root: string, args: readonly string[], options?: RunKitOptions): Promise<KitOutcome<T>>;
  inspect(root: string): Promise<KitOutcome<KitInspect>>;
  install(root: string, options?: { update?: boolean; name?: string }): Promise<KitOutcome<KitInstall>>;
  status(root: string): Promise<KitOutcome<KitStatus>>;
  proposal(root: string): Promise<KitOutcome<KitProposal | null>>;
}

export const KIT_TIMEOUT_MS = 60_000;
/** install writes and commits many files; it gets more time. */
export const KIT_INSTALL_TIMEOUT_MS = 180_000;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/** Kit's bundle inside a project. */
export function projectBundlePath(root: string): string {
  return path.join(root, '.harness', 'workflow', 'runtime', 'workflow.mjs');
}

function failure(code: string, message: string, details: unknown = {}, nextAction: string | null = null): KitFailure {
  return { ok: false, code, message, nextAction, details };
}

function tail(text: string): string {
  return text.trim().slice(-600);
}

/** Reads Kit's envelope from stdout. */
export function parseEnvelope<T>(stdout: string, stderr: string): KitOutcome<T> {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    return failure('KIT_OUTPUT', 'Kit вернул не JSON.', { stdout: tail(stdout), stderr: tail(stderr) });
  }
  if (!value || typeof value !== 'object') return failure('KIT_OUTPUT', 'Kit вернул неожиданный ответ.', { stdout: tail(stdout) });
  const envelope = value as Record<string, unknown>;
  if (envelope['ok'] === true) {
    return { ok: true, command: String(envelope['command'] ?? ''), result: (envelope['result'] ?? null) as T };
  }
  if (envelope['ok'] === false && typeof envelope['code'] === 'string') {
    return failure(
      envelope['code'],
      typeof envelope['message'] === 'string' ? envelope['message'] : envelope['code'],
      envelope['details'] ?? {},
      typeof envelope['nextAction'] === 'string' ? envelope['nextAction'] : null,
    );
  }
  return failure('KIT_OUTPUT', 'Kit вернул ответ без поля ok.', { stdout: tail(stdout) });
}

export function createKitRunner(options: KitRunnerOptions): KitRunner {
  const nodePath = options.nodePath ?? process.execPath;
  const defaultTimeout = options.timeoutMs ?? KIT_TIMEOUT_MS;

  async function exec<T>(bundle: string, cwd: string, args: readonly string[], timeoutMs: number): Promise<KitOutcome<T>> {
    const label = args[0] ?? '';
    const result = await options.runCommand(nodePath, [bundle, ...args], {
      cwd,
      env: options.env,
      timeoutMs,
      maxBytes: MAX_OUTPUT_BYTES,
    });
    if (result.startError) {
      return failure('KIT_SPAWN', `Не удалось запустить Kit (${result.startError}).`, { command: label, startError: result.startError });
    }
    if (result.timedOut) {
      return failure('KIT_TIMEOUT', `Kit не ответил за ${Math.round(timeoutMs / 1000)} с (${label}).`, { command: label });
    }
    return parseEnvelope<T>(result.stdout, result.stderr);
  }

  async function withAppBundle<T>(root: string, args: readonly string[], timeoutMs: number): Promise<KitOutcome<T>> {
    let bundle: string;
    try {
      bundle = await options.appBundle();
    } catch (error) {
      return failure('KIT_NO_BUNDLE', error instanceof Error ? error.message : String(error));
    }
    return exec<T>(bundle, root, args, timeoutMs);
  }

  const runner: KitRunner = {
    projectBundle: projectBundlePath,
    installed: (root) => existsSync(projectBundlePath(root)),
    async run<T>(root: string, args: readonly string[], runOptions: RunKitOptions = {}): Promise<KitOutcome<T>> {
      if (!runner.installed(root)) {
        return failure('KIT_NOT_INSTALLED', 'В проекте нет процесса Kit.', { root }, 'Установите процесс Kit в мастере проекта.');
      }
      return exec<T>(projectBundlePath(root), root, args, runOptions.timeoutMs ?? defaultTimeout);
    },
    inspect: (root) => withAppBundle<KitInspect>(root, ['inspect', root], defaultTimeout),
    install(root, installOptions = {}) {
      const args = ['install', root, '--host', 'harness'];
      if (installOptions.update) args.push('--update');
      if (installOptions.name) args.push('--name', installOptions.name);
      return withAppBundle<KitInstall>(root, args, Math.max(defaultTimeout, KIT_INSTALL_TIMEOUT_MS));
    },
    status: (root) => runner.run<KitStatus>(root, ['status']),
    proposal: (root) => runner.run<KitProposal | null>(root, ['scope:proposal']),
  };
  return runner;
}
