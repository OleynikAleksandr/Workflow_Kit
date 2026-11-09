// The Kimi Code provider (spec M8): the program, the server of Kit, the status table, the
// workspace and the trust of a folder. Hooks and sessions are added by hooks.ts and sessions.ts.
import { readJsonFile } from '#data-store';
import { ProviderError, createTokenStore, providerSessionsFile } from '#provider-registry';
import type { Capabilities, Provider, ProviderAction, ProviderContext, ProviderStatus } from '#provider-registry';
import { KIMI_CODES, KimiError, describeKimiError } from './client.ts';
import type { KimiClient } from './client.ts';
import { kimiHome, kimiPaths } from './paths.ts';
import type { KimiPaths } from './paths.ts';
import { UNCHECKED_PROGRAM, readProgram, testedVersion } from './program.ts';
import type { ProgramState } from './program.ts';
import { createKimiServer } from './server.ts';
import type { KimiServer, KimiServerDeps } from './server.ts';
import { parseAuth, parseConfig, parseMeta } from './shapes.ts';
import { createKimiTrust } from './trust.ts';
import { createKimiWorkspaces } from './workspace.ts';
import type { KimiWorkspaces } from './workspace.ts';

export const PROVIDER_ID = 'kimi';
export const PROVIDER_TITLE = 'Kimi Code';
/** Action of the provider: restarts the server of Kit (starts it when it does not run). */
export const RESTART_ACTION = 'restart-kimi-server';
export const LOGIN_NOTE = 'нужен вход: `kimi login`';
export const MODEL_NOTE = 'в Kimi не выбрана модель';
export const UNTESTED_OS_NOTE = 'на этой ОС не проверялся';
export const ON_DEMAND_NOTE = 'сервер Kimi запускается по требованию';
const RECHECK_HINT = 'Исправьте и нажмите «Перепроверить».';

/** What the last questions to the server told. */
export interface KimiProbe {
  state: 'ready' | 'unavailable' | 'error';
  note: string | null;
}

/** Replacements for tests. */
export interface KimiDeps extends Pick<KimiServerDeps, 'fetch' | 'startWaitMs' | 'stopWaitMs' | 'pollMs' | 'freePort'> {
  /** Clock of the preview tokens. */
  tokenNow?: () => Date;
}

/** Shared state of the provider parts (hooks and sessions build on it). */
export interface KimiRuntime {
  context: ProviderContext;
  paths: KimiPaths;
  server: KimiServer;
  workspaces: KimiWorkspaces;
  program(): ProgramState;
  /** Client of a ready provider: starts the server when needed; throws a ProviderError otherwise. */
  requireReady(): Promise<KimiClient>;
  requireProgram(): void;
}

/** Asks the server what the status table needs: backend, login, model. */
export async function probeServer(client: KimiClient, version: string | null): Promise<KimiProbe> {
  try {
    const meta = parseMeta(await client.get('/api/v1/meta'));
    if (meta.backend !== 'v2') return { state: 'error', note: `сервер Kimi работает с backend ${meta.backend}, нужен v2` };
    if (!parseAuth(await client.get('/api/v1/auth')).modelsReady) return { state: 'unavailable', note: LOGIN_NOTE };
    if (!parseConfig(await client.get('/api/v1/config')).defaultModel) return { state: 'unavailable', note: MODEL_NOTE };
    return { state: 'ready', note: null };
  } catch (error) {
    if (error instanceof KimiError && error.code === KIMI_CODES.noProvider) return { state: 'unavailable', note: LOGIN_NOTE };
    return { state: 'error', note: describeKimiError(error, version) };
  }
}

/** The provider with its runtime; tests and the later parts of the module use the runtime. */
export function createKimiRuntime(context: ProviderContext, deps: KimiDeps = {}): { runtime: KimiRuntime; provider: Provider } {
  const { platform } = context;
  const paths = kimiPaths(kimiHome(context.env, context.homedir, platform), platform);
  const tokens = createTokenStore(deps.tokenNow ? { now: deps.tokenNow } : {});
  const workspaces = createKimiWorkspaces(platform);
  let program: ProgramState = UNCHECKED_PROGRAM;
  let probe: KimiProbe | null = null;
  let serverError: string | null = null;
  const server = createKimiServer({ ...deps, context, paths, program: () => (program.installed ? program.path : null) });

  const usable = (): boolean => program.installed === true && !program.unsupported && !program.error;

  const notes = (...first: Array<string | null>): string | undefined => {
    const all = first.filter((item): item is string => Boolean(item));
    if (program.version && !testedVersion(program.version)) all.push(`версия ${program.version} не проверялась с Workflow Kit`);
    if (platform !== 'darwin') all.push(UNTESTED_OS_NOTE);
    return all.length > 0 ? all.join('; ') : undefined;
  };

  const buildStatus = (): ProviderStatus => {
    const base = { implemented: true, installed: program.installed, version: program.version, path: program.path, checkedAt: program.checkedAt, details: { kimiHome: paths.home } };
    const withNote = (status: Omit<ProviderStatus, keyof typeof base | 'note'>, ...first: Array<string | null>): ProviderStatus => {
      const note = notes(...first);
      return { ...base, ...status, ...(note ? { note } : {}) };
    };
    if (program.installed === null) return withNote({ state: 'unknown', label: 'не проверялся' });
    if (program.installed === false) return withNote({ state: 'not-installed', label: 'Kimi Code не найден' }, program.error === 'Kimi Code не найден' ? null : program.error);
    if (program.unsupported) return withNote({ state: 'unavailable', label: program.unsupported });
    if (program.error) return withNote({ state: 'error', label: 'версия не определена' }, program.error);
    if (serverError) return withNote({ state: 'error', label: 'сервер Kimi не запустился' }, serverError);
    if (!probe) return withNote({ state: 'ready', label: 'готов' }, ON_DEMAND_NOTE);
    if (probe.state === 'ready') return withNote({ state: 'ready', label: 'готов' });
    return withNote({ state: probe.state, label: probe.note ?? 'не готов' });
  };

  const notReady = (): string | null => {
    const status = buildStatus();
    return status.state === 'ready' ? null : status.label;
  };

  const requireProgram = (): void => {
    if (program.installed === false) throw new ProviderError('not-installed', 'Kimi Code не найден', { hint: 'Установите Kimi Code и нажмите «Перепроверить».' });
    if (program.unsupported) throw new ProviderError('unsupported-version', program.unsupported, { hint: 'Обновите Kimi Code и нажмите «Перепроверить».' });
    if (program.error) throw new ProviderError('kimi-program', program.error, { hint: RECHECK_HINT });
  };

  const ensureServer = async (): Promise<KimiClient> => {
    try {
      const client = await server.ensure();
      serverError = null;
      return client;
    } catch (error) {
      serverError = error instanceof Error ? error.message : String(error);
      probe = null;
      throw error;
    }
  };

  const requireReady = async (): Promise<KimiClient> => {
    // A program installed or fixed since the last check is noticed without "Перепроверить".
    if (program.installed !== true || program.error || program.unsupported) program = await readProgram(context, paths);
    requireProgram();
    const client = await ensureServer();
    if (probe?.state !== 'ready') probe = await probeServer(client, program.version);
    if (probe.state !== 'ready') throw new ProviderError('kimi-not-ready', `Kimi не готов: ${probe.note}`, { hint: RECHECK_HINT });
    return client;
  };

  // The server is wanted when Kit keeps sessions of Kimi (sessions.ts writes the file).
  const hasSessions = async (): Promise<boolean> => {
    const data = await readJsonFile(providerSessionsFile(context.dirs, PROVIDER_ID)).catch(() => undefined);
    const sessions = typeof data === 'object' && data !== null ? (data as Record<string, unknown>)['sessions'] : undefined;
    return Array.isArray(sessions) && sessions.length > 0;
  };

  // Brings the server up when it is wanted and asks it again; never throws.
  const check = async (start: boolean): Promise<'started' | 'failed' | 'idle'> => {
    let client = await server.current();
    let started = false;
    if (!client && start) {
      try {
        client = await ensureServer();
        started = true;
      } catch {
        return 'failed';
      }
    }
    if (client) serverError = null;
    probe = client ? await probeServer(client, program.version) : null;
    return started ? 'started' : 'idle';
  };

  const trust = createKimiTrust({ platform, paths, tokens, workspaces, current: () => server.current(), requireReady, requireProgram, notReady, version: () => program.version, log: context.log });
  const pending = 'подключается следующей задачей плана';

  const provider: Provider = {
    id: PROVIDER_ID,
    title: PROVIDER_TITLE,
    label: 'Kimi',
    mark: 'K',
    hookDialect: 'kimi',
    async capabilities(): Promise<Capabilities> {
      const missing = program.installed === false ? 'Kimi Code не найден' : (program.unsupported ?? program.error);
      const cap = (reason: string | null) => (reason ? { available: false, reason } : { available: true });
      return {
        trust: cap(missing),
        hooks: cap(missing ?? pending),
        sessions: { available: true },
        createSession: cap(missing ?? pending),
        orchestration: cap('у Kimi нет оркестрации Workflow Kit'),
        reviewer: cap('Kimi не делает перекрёстное ревью'),
      };
    },
    async status() {
      return buildStatus();
    },
    async refresh() {
      program = await readProgram(context, paths);
      if (usable()) await check(await hasSessions());
      else probe = null;
      return buildStatus();
    },
    async autostart() {
      if (program.installed === null) program = await readProgram(context, paths);
      if (!usable() || !(await hasSessions())) return null;
      const result = await check(true);
      return result === 'failed' ? `server not started: ${serverError}` : result === 'started' ? 'server started' : null;
    },
    async maintain() {
      if (!usable()) return null;
      const result = await check(server.used || (await hasSessions()));
      return result === 'failed' ? `server not started: ${serverError}` : result === 'started' ? 'server started again' : null;
    },
    trust: (project) => trust.trust(project),
    previewTrust: (project) => trust.previewTrust(project),
    grantTrust: (project, token) => trust.grantTrust(project, token),
    async hooks() {
      return { kitHook: null, hooks: [], complete: null, note: `хук Kimi ${pending}` };
    },
    async listSessions() {
      return [];
    },
    async createSession() {
      throw new ProviderError('not-implemented', `Сессии Kimi: ${pending}`, { status: 501 });
    },
    async actions(project): Promise<ProviderAction[]> {
      if (project !== null) return [];
      const running = (await server.current()) !== null;
      const missing = program.installed === false ? 'Kimi Code не найден' : (program.unsupported ?? program.error);
      return [
        {
          id: RESTART_ACTION,
          title: running ? 'Перезапустить сервер Kimi' : 'Запустить сервер Kimi',
          scope: 'provider',
          enabled: !missing,
          ...(missing ? { reason: missing } : {}),
          ...(running ? { confirm: 'Сервер Kimi будет перезапущен: ходы сессий Kimi, идущие сейчас, прервутся.' } : {}),
        },
      ];
    },
    async runAction(id, project) {
      if (id !== RESTART_ACTION || project !== null) throw new ProviderError('unknown-action', `Неизвестное действие Kimi: ${id}`, { status: 404 });
      if (program.installed === null) program = await readProgram(context, paths);
      requireProgram();
      await server.stop();
      probe = await probeServer(await ensureServer(), program.version);
      return buildStatus();
    },
  };

  return { runtime: { context, paths, server, workspaces, program: () => program, requireReady, requireProgram }, provider };
}

/** Creates the Kimi provider; deps replace the waits and the transport in tests. */
export function createKimiProvider(context: ProviderContext, deps: KimiDeps = {}): Provider {
  return createKimiRuntime(context, deps).provider;
}
