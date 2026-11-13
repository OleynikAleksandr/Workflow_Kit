// Shared state of the Codex provider: program path and version (read on refresh, D11), the daemon
// probe with a short cache, connections to the app-server (stdio) and to the daemon (WebSocket).
import { access, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { cleanEnv } from '#process-supervisor';
import { createTokenStore } from '#provider-registry';
import type { ProviderContext, TokenStore } from '#provider-registry';
import { cachedText, heldByApp, codexPaths, lastRemoteWarning, pidAlive, readDaemonPid, readTail, tokenErrorLine } from './codex-files.ts';
import type { CodexPaths } from './codex-files.ts';
import { createRpcSession, initializeSession } from './rpc.ts';
import type { InitializeResult, RpcSession, RpcTransport } from './rpc.ts';
import { spawnAppServer } from './stdio.ts';
import type { SharedAccessDeps } from './shared-access.ts';
import type { AppServerOpener } from './stdio.ts';
import { connectProxyWebSocket } from './proxy.ts';
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
  /** Wait for the first message's turn of a new session (default 180 s). */
  firstTurnWaitMs?: number;
  /** How long createSession waits for the daemon to unload the thread (default 90 s). */
  releaseWaitMs?: number;
  /** Interval of the thread/loaded/list polls while waiting (default 2 s). */
  releasePollMs?: number;
  /** Hand-over of remote control to the ChatGPT app: pause and sleep (tests make them instant). */
  handover?: { waitMs?: number; sleep?: (ms: number) => Promise<void> };
  /** Shared access (spec M12): port probe, login shell, user, app presence (tests make them fake). */
  sharedAccess?: SharedAccessDeps;
  /** One confirmed interruption and native state polling. */
  interruptWaitMs?: number;
  interruptPollMs?: number;
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
  /**
   * The login was refreshed (auth.json, for example by the ChatGPT app) after the daemon started
   * and the daemon reports 401: it holds the old token and needs a restart, not `codex login`.
   */
  staleLogin: boolean;
  /**
   * 'app': the daemon is not connected because another app-server of this installation (the
   * ChatGPT app) holds remote control (409 "Remote app server already online" in Codex's log).
   */
  remoteOwner: 'app' | null;
  /**
   * The daemon started less than SETTLE_MS ago and reports `errored` without a login error: the
   * ChatGPT app probably holds remote control and Codex has not logged the 409 yet (spec M7).
   */
  settling: boolean;
  error: string | null;
  checkedAt: string;
}

/** How long after its start an `errored` daemon without a login error is still settling. */
export const SETTLE_MS = 60_000;

/** Pure rule of DaemonState.settling. */
export function isSettling(state: Pick<DaemonState, 'remoteControl' | 'tokenError' | 'remoteOwner'>, startMs: number | null, nowMs: number): boolean {
  return state.remoteControl === 'errored' && state.tokenError === null && state.remoteOwner !== 'app' && startMs !== null && nowMs - startMs < SETTLE_MS;
}

/** Version and path of the CLI, read by refresh(). */
export interface ProgramState {
  path: string | null;
  version: string | null;
  installed: boolean | null;
  error: string | null;
  /** Why this Codex cannot be used here although it is installed (Windows: older than MIN_WINDOWS_CODEX). */
  unsupported: string | null;
  checkedAt: string | null;
}

/** Default reuse time of a daemon probe. */
export const DAEMON_TTL_MS = 15_000;
const PROBE_TIMEOUT_MS = 4000;
/** How long a probe waits for remoteControl/status/changed after initialize. */
export const STATUS_WAIT_MS = 3000;

/** Oldest Codex on Windows: hidden daemon console windows were fixed in 0.158–0.160 (spec M5 section 5). */
export const MIN_WINDOWS_CODEX = '0.160.0';

/** Compares dotted versions numerically (0.160.1 > 0.160.0). */
export function compareVersions(a: string, b: string): number {
  const left = a.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Windows install places of codex.exe besides PATH (spec M5 section 5): the standalone installer and
 * winget, the managed package, and the exe of the npm platform package next to the codex.cmd shim.
 * Node cannot spawn a .cmd without a shell (EINVAL), so only codex.exe is ever used.
 */
export function windowsCodexCandidates(env: Readonly<Record<string, string | undefined>>, homedir: string, arch: string = process.arch): string[] {
  const p = path.win32;
  const local = env['LOCALAPPDATA'] || p.join(homedir, 'AppData', 'Local');
  const triple = arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
  const npmPackage = (dir: string): string =>
    p.join(dir, 'node_modules', '@openai', 'codex', 'node_modules', '@openai', `codex-win32-${arch}`, 'vendor', triple, 'bin', 'codex.exe');
  const dirs = (env['PATH'] ?? env['Path'] ?? '').split(';').filter(Boolean);
  return [
    p.join(local, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe'),
    p.join(homedir, '.codex', 'packages', 'standalone', 'current', 'bin', 'codex.exe'),
    ...dirs.map(npmPackage),
  ];
}

/** Finds an executable by name in PATH (absolute names are checked as is); Windows: only .exe. */
export async function findProgram(
  name: string,
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
  extra: readonly string[] = [],
): Promise<string | null> {
  const windows = platform === 'win32';
  const exe = windows && !name.toLowerCase().endsWith('.exe') ? `${name}.exe` : name;
  const candidates = path.isAbsolute(name)
    ? [exe]
    : [...(env['PATH'] ?? (windows ? env['Path'] : undefined) ?? '').split(windows ? ';' : ':').filter(Boolean).map((dir) => path.join(dir, exe)), ...extra];
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
  /** Last observed daemon state, without file IO or RPC. */
  cachedDaemon(): DaemonState | null;
  /** Runs fn on a fresh, initialized `codex app-server` session in cwd and closes it. */
  withAppServer<T>(cwd: string, fn: (session: RpcSession) => Promise<T>): Promise<T>;
  /** Runs fn on an initialized connection to the daemon and closes it. */
  withDaemon<T>(fn: (session: RpcSession, init: InitializeResult) => Promise<T>, timeoutMs?: number): Promise<T>;
}

/** Creates the runtime. */
export function createCodexRuntime(context: ProviderContext, deps: CodexDeps = {}): CodexRuntime {
  const paths = codexPaths(context.homedir, context.env);
  const openAppServer = deps.openAppServer ?? spawnAppServer;
  const openDaemon: DaemonOpener =
    deps.openDaemon ??
    (context.platform === 'win32'
      ? (socket, options) => connectProxyWebSocket({ command: runtime.command(), env: runtime.childEnv(), socketPath: socket }, options)
      : (socket, options) => connectUnixWebSocket(socket, options));
  const isAlive = deps.isAlive ?? pidAlive;
  const ttl = deps.daemonTtlMs ?? DAEMON_TTL_MS;
  let probe: { state: DaemonState; at: number } | null = null;
  // The last status a daemon process reported; refresh() drops the cache but not this.
  let lastKnown: { pid: number; remoteControl: string; serverName: string | null } | null = null;
  let inflight: Promise<DaemonState> | null = null;
  let observed: DaemonState | null = null;
  const remember = (state: DaemonState): DaemonState => { observed = state; return state; };

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
    program: { path: null, version: null, installed: null, error: null, unsupported: null, checkedAt: null },
    command() {
      return runtime.program.path ?? context.config.programs['codex'] ?? 'codex';
    },
    childEnv() {
      return cleanEnv(context.env, { platform: context.platform, extra: { CODEX_HOME: paths.home } });
    },
    async refreshProgram() {
      const configured = context.config.programs['codex'];
      const extra = context.platform === 'win32' ? windowsCodexCandidates(context.env, context.homedir) : [];
      const found = (configured ? await findProgram(configured, context.env, context.platform) : null) ??
        (await findProgram('codex', context.env, context.platform, extra));
      const checkedAt = context.now().toISOString();
      if (!found) {
        runtime.program = { path: null, version: null, installed: false, error: 'codex не найден в PATH службы', unsupported: null, checkedAt };
        return runtime.program;
      }
      const result = await context.runCommand(found, ['--version'], { env: runtime.childEnv(), timeoutMs: 10_000 });
      const version = /(\d+\.\d+\.\d+[\w.-]*)/.exec(result.stdout)?.[1] ?? (result.stdout.trim() || null);
      const error = result.code === 0 ? null : `codex --version: ${result.startError ?? (result.stderr.trim().slice(0, 200) || `код ${result.code}`)}`;
      const unsupported =
        context.platform === 'win32' && version && /^\d/.test(version) && compareVersions(version, MIN_WINDOWS_CODEX) < 0
          ? `Codex ${version} старее ${MIN_WINDOWS_CODEX}: на Windows нужна новее версия — обновите Codex`
          : null;
      runtime.program = { path: found, version, installed: true, error, unsupported, checkedAt };
      return runtime.program;
    },
    async daemon(force = false) {
      const pidFile = await readDaemonPid(paths.daemonPid);
      const pid = pidFile && isAlive(pidFile.pid) ? pidFile.pid : null;
      const now = Date.now();
      if (!pid) {
        probe = null;
        return remember({ running: false, pid: null, remoteControl: null, serverName: null, userAgent: null, tokenError: null, staleLogin: false, remoteOwner: null, settling: false, error: null, checkedAt: context.now().toISOString() });
      }
      if (!force && probe && probe.state.pid === pid && now - probe.at < ttl) return remember(probe.state);
      const known = lastKnown && lastKnown.pid === pid ? lastKnown : null;
      inflight ??= (async (): Promise<DaemonState> => {
        const state: DaemonState = { running: true, pid, remoteControl: null, serverName: null, userAgent: null, tokenError: null, staleLogin: false, remoteOwner: null, settling: false, error: null, checkedAt: context.now().toISOString() };
        try {
          await runtime.withDaemon(async (session, init) => {
            state.userAgent = typeof init.userAgent === 'string' ? init.userAgent : null;
            const rc = (await session.waitForNotification('remoteControl/status/changed', STATUS_WAIT_MS)) as Record<string, unknown> | undefined;
            if (rc && typeof rc['status'] === 'string') state.remoteControl = rc['status'];
            if (rc && typeof rc['serverName'] === 'string') state.serverName = rc['serverName'];
          }, PROBE_TIMEOUT_MS);
        } catch (error) {
          state.error = (error as Error).message;
        }
        // No status in time: the daemon did not say anything new, keep what this process said before
        // (an unknown status must not read as "not connected").
        if (state.remoteControl === null && !state.error && known?.remoteControl) {
          state.remoteControl = known.remoteControl;
          state.serverName ??= known.serverName;
        }
        if (state.remoteControl !== null) lastKnown = { pid, remoteControl: state.remoteControl, serverName: state.serverName };
        if (state.remoteControl !== 'connected') {
          state.tokenError = tokenErrorLine(await readTail(paths.daemonStderr, 64 * 1024));
          if (heldByApp(await lastRemoteWarning(paths.home, pid))) state.remoteOwner = 'app';
        }
        if (state.tokenError && pidFile?.startMs) {
          const authAt = await stat(paths.auth).then((info) => info.mtimeMs).catch(() => null);
          state.staleLogin = authAt !== null && authAt > pidFile.startMs;
        }
        state.settling = isSettling(state, pidFile?.startMs ?? null, context.now().getTime());
        probe = { state, at: Date.now() };
        return remember(state);
      })().finally(() => {
        inflight = null;
      });
      return inflight;
    },
    cachedDaemon: () => observed ? { ...observed } : null,
    forgetDaemon() {
      probe = null;
      observed = null;
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
