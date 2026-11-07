// The Codex provider (docs/planning/M1-providers.md, section 3): status of the CLI and of the
// Mac-wide daemon, its start as a special action, trust, the Kit hook and sessions.
import { ProviderError } from '#provider-registry';
import type { Capabilities, Project, ProjectProviderState, Provider, ProviderAction, ProviderContext, ProviderStatus } from '#provider-registry';
import { createCodexRuntime } from './runtime.ts';
import type { CodexDeps, CodexRuntime, DaemonState } from './runtime.ts';
import { createSessionParts } from './sessions.ts';
import { createTrustParts, requireCodex } from './trust.ts';

/** Registry id of the provider (also the hook journal client). */
export const PROVIDER_ID = 'codex';

/** Title shown by the panel. */
export const PROVIDER_TITLE = 'ChatGPT (Codex)';

/** Id of the special action that starts the daemon. */
export const DAEMON_START_ACTION = 'daemon-start';

/** Hint for an expired Codex login (R2: Kit only diagnoses it). */
export const LOGIN_HINT = 'Выполните codex login в Терминале, затем «Запустить демон».';

const WINDOWS_REASON = 'Windows: Codex в вехе 1 не поддерживается (Q2)';

/** Parses the JSON status line of `codex remote-control start --json`. */
export function parseRemoteControlStart(stdout: string): { status: string | null; serverName: string | null; error: string | null } {
  let status: string | null = null;
  let serverName: string | null = null;
  for (const line of stdout.split('\n')) {
    if (!line.includes('"mode"')) continue;
    try {
      const data = JSON.parse(line.trim()) as Record<string, unknown>;
      if (typeof data['status'] === 'string') status = data['status'];
      if (typeof data['serverName'] === 'string') serverName = data['serverName'];
    } catch {
      // Not the status line.
    }
  }
  const error = /(?:Error: |connection is errored)[^\n]*/.exec(stdout)?.[0] ?? null;
  return { status, serverName, error };
}

/** The daemon runs and its link to ChatGPT is being set up (or it has not said yet). */
function connecting(daemon: DaemonState): boolean {
  return daemon.running && !daemon.error && (daemon.remoteControl === null || daemon.remoteControl === 'connecting');
}

/** Text of a daemon that holds a login the ChatGPT app has refreshed meanwhile. */
export const STALE_LOGIN_REASON = 'Приложение ChatGPT обновило вход после запуска демона — «Перезапустить демон»';

/** Text of a daemon that runs and is still connecting: nothing to do but wait. */
export const CONNECTING_REASON = 'ChatGPT подключается к демону Codex — подождите несколько секунд';

/** The ChatGPT app holds remote control of this installation; the daemon serves the panel. */
export const APP_OWNER_REASON = 'удалённое управление держит приложение ChatGPT';

/** Remote control is up: through the daemon, or through the ChatGPT app (spec M3-autostart 4). */
function linked(daemon: DaemonState): boolean {
  return daemon.running && !daemon.error && (daemon.remoteControl === 'connected' || daemon.remoteOwner === 'app');
}

function loginProblem(daemon: DaemonState): boolean {
  return daemon.running && !daemon.staleLogin && daemon.remoteOwner !== 'app' && (daemon.remoteControl === 'errored' || (daemon.remoteControl !== 'connected' && daemon.tokenError !== null));
}

function buildStatus(rt: CodexRuntime, daemon: DaemonState): ProviderStatus {
  const program = rt.program;
  const details: Record<string, unknown> = {
    daemon: { running: daemon.running, pid: daemon.pid, remoteControl: daemon.remoteControl, serverName: daemon.serverName },
    codexHome: rt.paths.home,
  };
  const base = { implemented: true, installed: program.installed, version: program.version, path: program.path, checkedAt: program.checkedAt, details };
  if (rt.context.platform === 'win32') return { ...base, state: 'unavailable', label: 'Windows: недоступно', note: WINDOWS_REASON };
  if (program.installed === false) return { ...base, state: 'not-installed', label: 'не установлен', note: program.error ?? 'codex не найден' };
  if (daemon.running && daemon.staleLogin && daemon.remoteControl !== 'connected') {
    return { ...base, state: 'error', label: 'демон держит устаревший вход', note: STALE_LOGIN_REASON };
  }
  if (loginProblem(daemon)) {
    return { ...base, state: 'error', label: 'ошибка входа', note: `${daemon.tokenError ?? 'соединение с ChatGPT в ошибке'}. ${LOGIN_HINT}` };
  }
  if (!daemon.running) return { ...base, state: 'unavailable', label: 'демон не запущен', note: 'Сессии создаются через демон: «Запустить демон».' };
  if (daemon.error) return { ...base, state: 'error', label: 'демон не отвечает', note: daemon.error };
  if (linked(daemon)) {
    const label = daemon.remoteControl === 'connected' ? 'демон подключён' : 'через приложение ChatGPT';
    return { ...base, state: program.installed === null ? 'unknown' : 'ready', label, ...(program.error ? { note: program.error } : {}) };
  }
  if (connecting(daemon)) return { ...base, state: 'unavailable', label: 'подключается к ChatGPT', note: CONNECTING_REASON };
  return { ...base, state: 'unavailable', label: `связь с ChatGPT: ${daemon.remoteControl}`, note: 'Удалённое управление выключено; «Подключить к ChatGPT».' };
}

/** Creates the Codex provider; deps replace the transports and the clock of tokens in tests. */
export function createCodexProvider(context: ProviderContext, deps: CodexDeps = {}): Provider {
  const rt = createCodexRuntime(context, deps);
  const trustParts = createTrustParts(rt);
  const sessionParts = createSessionParts(rt, {
    ...(deps.serviceTurnWaitMs === undefined ? {} : { serviceTurnWaitMs: deps.serviceTurnWaitMs }),
    ...(deps.releaseWaitMs === undefined ? {} : { releaseWaitMs: deps.releaseWaitMs }),
    ...(deps.firstTurnWaitMs === undefined ? {} : { firstTurnWaitMs: deps.firstTurnWaitMs }),
    ...(deps.releasePollMs === undefined ? {} : { releasePollMs: deps.releasePollMs }),
  });

  const capabilities = async (): Promise<Capabilities> => {
    if (context.platform === 'win32') {
      return Object.fromEntries(['trust', 'hooks', 'sessions', 'createSession', 'daemon'].map((name) => [name, { available: false, reason: WINDOWS_REASON }]));
    }
    const missing = rt.program.installed === false ? 'codex не найден в PATH службы' : null;
    const daemon = await rt.daemon();
    let create: string | null = missing;
    if (!create && !daemon.running) create = 'демон Codex не запущен — «Запустить демон»';
    else if (!create && daemon.staleLogin && daemon.remoteControl !== 'connected') create = STALE_LOGIN_REASON;
    else if (!create && loginProblem(daemon)) create = `ошибка входа Codex — ${LOGIN_HINT}`;
    else if (!create && connecting(daemon)) create = CONNECTING_REASON;
    else if (!create && daemon.error) create = `демон Codex не отвечает: ${daemon.error}`;
    else if (!create && !linked(daemon)) create = 'демон Codex не подключён к ChatGPT — «Подключить к ChatGPT»';
    const cap = (reason: string | null) => (reason ? { available: false, reason } : { available: true });
    return { trust: cap(missing), hooks: cap(missing), sessions: { available: true }, createSession: cap(create), daemon: cap(missing) };
  };

  const actions = async (project: Project | null): Promise<ProviderAction[]> => {
    if (project !== null) return [];
    if (context.platform === 'win32') return [{ id: DAEMON_START_ACTION, title: 'Запустить демон', scope: 'provider', enabled: false, reason: WINDOWS_REASON }];
    const daemon = await rt.daemon();
    const action: ProviderAction = {
      id: DAEMON_START_ACTION,
      title: 'Запустить демон',
      scope: 'provider',
      enabled: true,
      confirm: 'Запустить фоновый app-server Codex с удалённым управлением (codex remote-control start) для всего Mac?',
    };
    if (rt.program.installed === false) return [{ ...action, enabled: false, reason: 'codex не найден' }];
    if (!daemon.running) return [action];
    // A running daemon: the action only makes sense when its link to ChatGPT is off or failed.
    if (daemon.remoteControl === 'connected') return [{ ...action, enabled: false, reason: 'демон работает и подключён к ChatGPT' }];
    if (linked(daemon)) return [{ ...action, enabled: false, reason: APP_OWNER_REASON }];
    if (daemon.staleLogin) {
      return [{ ...action, title: 'Перезапустить демон', confirm: 'Перезапустить демон Codex, чтобы он перечитал вход (codex remote-control stop, затем start)? Чаты, открытые через демон на iPad, переподключатся.' }];
    }
    if (connecting(daemon)) return [{ ...action, enabled: false, reason: CONNECTING_REASON }];
    return [{ ...action, title: 'Подключить к ChatGPT', confirm: 'Подключить работающий демон Codex к ChatGPT (codex remote-control start)?' }];
  };

  const startDaemon = async (): Promise<ProviderStatus> => {
    requireCodex(rt);
    // A daemon with a stale login keeps it until it restarts: stop it first.
    const before = await rt.daemon(true);
    if (before.running && before.staleLogin) {
      const stopped = await context.runCommand(rt.command(), ['remote-control', 'stop'], { cwd: context.homedir, env: rt.childEnv(), timeoutMs: 30_000 });
      rt.forgetDaemon();
      if (stopped.startError || stopped.code !== 0) {
        throw new ProviderError('daemon-stop-failed', `Демон Codex не остановился: ${stopped.startError ?? (stopped.stderr.trim().slice(0, 200) || `код ${stopped.code}`)}`, {
          hint: 'Выполните codex remote-control stop в Терминале, затем «Запустить демон».',
        });
      }
      context.log('codex: daemon stopped to reload a refreshed login');
    }
    const result = await context.runCommand(rt.command(), ['remote-control', 'start', '--json'], {
      cwd: context.homedir,
      env: rt.childEnv(),
      timeoutMs: 90_000,
    });
    rt.forgetDaemon();
    if (result.startError) throw new ProviderError('start-failed', `codex не запустился: ${result.startError}`, { hint: 'Проверьте путь к codex и нажмите «Перепроверить».' });
    const parsed = parseRemoteControlStart(`${result.stdout}\n${result.stderr}`);
    const daemon = await rt.daemon(true);
    if (parsed.status === 'connected' || linked(daemon)) {
      context.log('codex: daemon started');
      return buildStatus(rt, daemon);
    }
    if (parsed.error?.includes('errored') || parsed.status === 'errored' || loginProblem(daemon)) {
      throw new ProviderError('codex-login', 'Демон Codex запущен, но соединение с ChatGPT в ошибке (вероятно, истёк вход)', { hint: LOGIN_HINT });
    }
    throw new ProviderError('daemon-start-failed', `Демон Codex не подключился: ${parsed.error ?? parsed.status ?? (result.timedOut ? 'таймаут' : `код ${result.code}`)}`, {
      hint: 'Повторите «Запустить демон»; при повторе выполните codex remote-control start в Терминале.',
    });
  };

  // Start of the service (spec M3-autostart): the daemon comes up unless it already works or connects.
  const autostart = async (): Promise<string | null> => {
    if (context.platform === 'win32') return null;
    if ((await rt.refreshProgram()).installed === false) return null;
    const daemon = await rt.daemon(true);
    if (linked(daemon) || connecting(daemon)) return null;
    await startDaemon();
    return 'daemon started';
  };

  return {
    id: PROVIDER_ID,
    title: PROVIDER_TITLE,
    autostart,
    capabilities,
    async status() {
      return buildStatus(rt, await rt.daemon());
    },
    async refresh() {
      if (context.platform !== 'win32') await rt.refreshProgram();
      rt.forgetDaemon();
      trustParts.clearCache();
      return buildStatus(rt, await rt.daemon(true));
    },
    trust: (project) => trustParts.trust(project),
    previewTrust: (project) => trustParts.previewTrust(project),
    grantTrust: (project, token) => trustParts.grantTrust(project, token),
    hooks: (project) => trustParts.hooks(project),
    approveHooks: (project, expected) => trustParts.approveHooks(project, expected),
    listSessions: (project) => sessionParts.listSessions(project),
    forgetProjects: (keep) => sessionParts.forgetProjects(keep),
    async createSession(project, opts) {
      requireCodex(rt);
      return sessionParts.createSession(project, opts);
    },
    async renameSession(project, sessionId, name) {
      requireCodex(rt);
      return sessionParts.renameSession(project, sessionId, name);
    },
    actions,
    async runAction(id, project): Promise<ProviderStatus | ProjectProviderState> {
      if (id === DAEMON_START_ACTION && project === null) return startDaemon();
      throw new ProviderError('unknown-action', `Неизвестное действие Codex: ${id}`, { status: 404 });
    },
  };
}
