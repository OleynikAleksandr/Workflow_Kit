// Shared state of the Codex provider: program path and version (read on refresh, D11), the daemon
// probe with a short cache, connections to the app-server (stdio) and to the daemon (WebSocket).
import { access, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { cleanEnv } from '#process-supervisor';
import { createTokenStore } from '#provider-registry';
import type { ProviderContext, TokenStore } from '#provider-registry';
import { cachedText, codexPaths, pidAlive, readDaemonPid, readTail, tokenErrorLine } from './codex-files.ts';
import type { CodexPaths } from './codex-files.ts';
import { createRpcSession, initializeSession } from './rpc.ts';
import type { InitializeResult, RpcSession, RpcTransport } from './rpc.ts';
import { spawnAppServer } from './stdio.ts';
import type { AppServerOpener } from './stdio.ts';
import { connectUnixWebSocket } from './ws.ts';

/** Opens a transport to the daemon's control socket. */
export type DaemonOpener = (socketPath: string, options: { timeoutMs: number }) => Promise<RpcTransport>;

/** Injectable parts of the provider (tests pass fakes). */
export interface CodexDeps {
  openAppServer?: AppServerOpener;
  openDaemon?: DaemonOpener;
  isAlive?: (pid: number) => boolean;
  tokens?: TokenStore;
  /** How long a daemon probe is reused by status() (default 15 s). */
  daemonTtlMs?: number;
  /** How long createSession waits for turn/completed of the service turn (default 15 s). */
  serviceTurnWaitMs?: number;
}

/** What the last daemon probe found. */
export interface DaemonState {
  running: boolean;
  pid: number | null;
  /** remoteControl/status/changed: disabled | connecting | connected | errored; null when unknown. */
  remoteControl: string | null;
  serverName: string | null;
  userAgent: string | null;
  /** Newest "401 / token expired" line of daemon.stderr.log while the connection is not up. */
  tokenError: string | null;
  error: string | null;
  checkedAt: string;
}

/** Version and path of the CLI, read by refresh(). */
export interface ProgramState {
  path: string | null;
  version: string | null;
  installed: boolean | null;
  error: string | null;
  checkedAt: string | null;
}

/** Default reuse time of a daemon probe. */
export const DAEMON_TTL_MS = 15_000;
const PROBE_TIMEOUT_MS = 2000;

/** Finds an executable by name in PATH (absolute names are checked as is). */
export async function findProgram(name: string, env: Readonly<Record<string, string | undefined>>, platform: NodeJS.Platform): Promise<string | null> {
  const candidates = path.isAbsolute(name)
    ? [name]
    : (env['PATH'] ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean).flatMap((dir) =>
        platform === 'win32' ? ['.exe', '.cmd', ''].map((ext) => path.join(dir, name + ext)) : [path.join(dir, name)]);
  for (const candidate of candidates) {
    try {
      await access(candidate, platform === 'win32' ? constants.F_OK : constants.X_OK);
      return candidate;
    } catch {
      // Next candidate.
    }
  }
  return null;
}

/** The runtime shared by the provider's parts. */
export interface CodexRuntime {
  context: ProviderContext;
  paths: CodexPaths;
  tokens: TokenStore;
  readText: (file: string) => Promise<string | null>;
  program: ProgramState;
  /** Program to run: the found path, else the configured one, else "codex". */
  command(): string;
  /** Child environment: the service env without CLAUDE*, CODEX_HOME pinned to paths.home. */
  childEnv(): Record<string, string>;
  refreshProgram(): Promise<ProgramState>;
  /** Daemon state: the pid file on every call, the socket probe cached for daemonTtlMs. */
  daemon(force?: boolean): Promise<DaemonState>;
  forgetDaemon(): void;
  /** Runs fn on a fresh, initialized `codex app-server` session in cwd and closes it. */
  withAppServer<T>(cwd: string, fn: (session: RpcSession) => Promise<T>): Promise<T>;
  /** Runs fn on an initialized connection to the daemon and closes it. */
  withDaemon<T>(fn: (session: RpcSession, init: InitializeResult) => Promise<T>, timeoutMs?: number): Promise<T>;
}

/** Creates the runtime. */
export function createCodexRuntime(context: ProviderContext, deps: CodexDeps = {}): CodexRuntime {
  const paths = codexPaths(context.homedir, context.env);
  const openAppServer = deps.openAppServer ?? spawnAppServer;
  const openDaemon: DaemonOpener = deps.openDaemon ?? ((socket, options) => connectUnixWebSocket(socket, options));
  const isAlive = deps.isAlive ?? pidAlive;
  const ttl = deps.daemonTtlMs ?? DAEMON_TTL_MS;
  let probe: { state: DaemonState; at: number } | null = null;
  let inflight: Promise<DaemonState> | null = null;

  const socketPath = async (): Promise<string> => {
    // The socket is a symlink into a short /tmp path; connecting through the real path avoids the
    // 104-byte limit of unix socket names on macOS.
    try {
      return await realpath(paths.controlSocket);
    } catch {
      return paths.controlSocket;
    }
  };

  const runtime: CodexRuntime = {
    context,
    paths,
    tokens: deps.tokens ?? createTokenStore({ now: context.now }),
    readText: cachedText(),
    program: { path: null, version: null, installed: null, error: null, checkedAt: null },
    command() {
      return runtime.program.path ?? context.config.programs['codex'] ?? 'codex';
    },
    childEnv() {
      return cleanEnv(context.env, { platform: context.platform, extra: { CODEX_HOME: paths.home } });
    },
    async refreshProgram() {
      const configured = context.config.programs['codex'];
      const found = (configured ? await findProgram(configured, context.env, context.platform) : null) ??
        (await findProgram('codex', context.env, context.platform));
      const checkedAt = context.now().toISOString();
      if (!found) {
        runtime.program = { path: null, version: null, installed: false, error: 'codex не найден в PATH службы', checkedAt };
        return runtime.program;
      }
      const result = await context.runCommand(found, ['--version'], { env: runtime.childEnv(), timeoutMs: 10_000 });
      const version = /(\d+\.\d+\.\d+[\w.-]*)/.exec(result.stdout)?.[1] ?? (result.stdout.trim() || null);
      runtime.program = {
        path: found,
        version,
        installed: true,
        error: result.code === 0 ? null : `codex --version: ${result.startError ?? (result.stderr.trim().slice(0, 200) || `код ${result.code}`)}`,
        checkedAt,
      };
      return runtime.program;
    },
    async daemon(force = false) {
      const pidFile = await readDaemonPid(paths.daemonPid);
      const pid = pidFile && isAlive(pidFile.pid) ? pidFile.pid : null;
      const now = Date.now();
      if (!pid) {
        probe = null;
        return { running: false, pid: null, remoteControl: null, serverName: null, userAgent: null, tokenError: null, error: null, checkedAt: context.now().toISOString() };
      }
      if (!force && probe && probe.state.pid === pid && now - probe.at < ttl) return probe.state;
      inflight ??= (async (): Promise<DaemonState> => {
        const state: DaemonState = { running: true, pid, remoteControl: null, serverName: null, userAgent: null, tokenError: null, error: null, checkedAt: context.now().toISOString() };
        try {
          await runtime.withDaemon(async (session, init) => {
            state.userAgent = typeof init.userAgent === 'string' ? init.userAgent : null;
            const rc = (await session.waitForNotification('remoteControl/status/changed', 500)) as Record<string, unknown> | undefined;
            if (rc && typeof rc['status'] === 'string') state.remoteControl = rc['status'];
            if (rc && typeof rc['serverName'] === 'string') state.serverName = rc['serverName'];
          }, PROBE_TIMEOUT_MS);
        } catch (error) {
          state.error = (error as Error).message;
        }
        if (state.remoteControl !== 'connected') state.tokenError = tokenErrorLine(await readTail(paths.daemonStderr, 64 * 1024));
        probe = { state, at: Date.now() };
        return state;
      })().finally(() => {
        inflight = null;
      });
      return inflight;
    },
    forgetDaemon() {
      probe = null;
    },
    async withAppServer(cwd, fn) {
      const transport = await openAppServer({ command: runtime.command(), cwd, env: runtime.childEnv(), platform: context.platform });
      const session = createRpcSession(transport);
      try {
        await initializeSession(session);
        return await fn(session);
      } finally {
        session.close();
      }
    },
    async withDaemon(fn, timeoutMs) {
      const transport = await openDaemon(await socketPath(), { timeoutMs: timeoutMs ?? 5000 });
      const session = createRpcSession(transport, timeoutMs ? { timeoutMs } : {});
      try {
        const init = await initializeSession(session);
        return await fn(session, init);
      } finally {
        session.close();
      }
    },
  };
  return runtime;
}
