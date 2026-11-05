import os from 'node:os';
import { createEventLog, createKeyedMutex, createOperations, ensureDataDirs, eventsFile, loadConfig, resolveDataDirs } from '#data-store';
import type { DataDirs, EventLog, KeyedMutex, Operations, WfkConfig } from '#data-store';
import { createHttpServer, createRouter, createStateRegistry, registerCoreRoutes } from '#http-server';
import type { HttpServerHandle, InterfaceMap, Router, StateRegistry } from '#http-server';
import { registerStructureRoutes } from '#kit-structure';
import { panelShellMount } from '#panel-shell';
import { providerCardsMount } from '#provider-cards';
import { createProcessSupervisor, processesFile, runCommand } from '#process-supervisor';
import type { CommandRunner, ProcessSupervisor } from '#process-supervisor';
import { createProvider as createClaudeProvider } from '#provider-claude';
import { createProvider as createCodexProvider } from '#provider-codex';
import { createProviderRegistry, registerProviderRoutes } from '#provider-registry';
import type { ProviderContext, ProviderFactory, ProviderRegistry } from '#provider-registry';
import { createProjectRegistry, projectsFile, registerProjectRoutes } from '#project-registry';
import type { ProjectRegistry } from '#project-registry';
import { getServiceStatus } from '#service-installer';
import { currentOsInput, detectOs, panelUrls, readPackageVersion } from './system-info.ts';
import type { DetectOsInput, OsInfo } from './system-info.ts';

/** Inputs of createApp; everything machine-specific is injectable for tests. */
export interface AppOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homedir?: string;
  getInterfaces?: () => InterfaceMap;
  osInput?: DetectOsInput;
  log?: (line: string) => void;
  /** Provider factories (default: Claude and Codex); tests pass fake providers. */
  providers?: ProviderFactory[];
  /** Runner of external programs given to providers (default: runCommand). */
  runCommand?: CommandRunner;
  /** Process supervisor given to providers (default: over <state>/processes.json). */
  supervisor?: ProcessSupervisor;
}

/** Providers registered by default, in panel order. */
export const DEFAULT_PROVIDERS: readonly ProviderFactory[] = [createClaudeProvider, createCodexProvider];

/** The assembled backend: data, routes, state sections and the HTTP server. */
export interface App {
  readonly dirs: DataDirs;
  readonly config: WfkConfig;
  readonly version: string;
  readonly os: OsInfo;
  /** Route registry; feature modules add their API routes here before start(). */
  readonly router: Router;
  /** /api/state sections; feature modules add their sections here before start(). */
  readonly state: StateRegistry;
  readonly server: HttpServerHandle;
  /** Backend event journal (events.jsonl, rotated at 5 MiB). */
  readonly events: EventLog;
  /** Keyed mutex for actions on projects and providers (D10). */
  readonly mutex: KeyedMutex;
  /** Project list (projects.json); later modules add remove guards here. */
  readonly projects: ProjectRegistry;
  /** Long actions (D10), shown in the "operations" section of /api/state. */
  readonly operations: Operations;
  /** Providers by id; routes and the "providers" section go through the contract only. */
  readonly providers: ProviderRegistry;
  /** Session and environment processes (D5, D9). */
  readonly supervisor: ProcessSupervisor;
  /** Starts listening on config.port; returns the bound port and the panel URLs. */
  start(): Promise<{ port: number; host: string; urls: string[] }>;
  stop(): Promise<void>;
}

/** Contents of the "system" section of /api/state. */
export interface SystemSection {
  version: string;
  os: OsInfo;
  node: string;
  hostname: string;
  pid: number;
  startedAt: string;
  port: number;
  dataDir: string;
  dataDirOverridden: boolean;
  dataDirs: { config: string; state: string; app: string; logs: string };
  addresses: string[];
  service: ReturnType<typeof getServiceStatus>;
}

/** Builds the backend: creates the data directories (0700), reads config and wires the modules. */
export async function createApp(options: AppOptions = {}): Promise<App> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const homedir = options.homedir ?? os.homedir();
  const getInterfaces = options.getInterfaces ?? (() => os.networkInterfaces());
  const dirs = resolveDataDirs({ platform, env, homedir });
  await ensureDataDirs(dirs, platform);
  const config = await loadConfig({ dirs, env, homedir });
  const version = await readPackageVersion();
  const osInfo = await detectOs(options.osInput ?? currentOsInput());
  const startedAt = new Date().toISOString();

  const router = createRouter();
  const state = createStateRegistry();
  const server = createHttpServer({ router, staticMounts: [panelShellMount(), providerCardsMount()], getInterfaces, log: options.log });
  const events = createEventLog({ file: eventsFile(dirs) });
  const mutex = createKeyedMutex();
  const homeScope = { homedir, platform };
  const projects = createProjectRegistry({
    ...homeScope,
    file: projectsFile(dirs),
    projectsRoot: config.projectsRoot,
    events,
    mutex,
  });

  registerCoreRoutes(router, state, () => ({ version, pid: process.pid, startedAt }));
  state.add('system', (): SystemSection => ({
    version,
    os: osInfo,
    node: process.version,
    hostname: os.hostname(),
    pid: process.pid,
    startedAt,
    port: server.port(),
    dataDir: dirs.configDir,
    dataDirOverridden: dirs.overridden,
    dataDirs: { config: dirs.configDir, state: dirs.stateDir, app: dirs.appDir, logs: dirs.logsDir },
    addresses: panelUrls(server.port(), getInterfaces()),
    service: getServiceStatus(platform, { env, homedir, serving: true }),
  }));
  registerProjectRoutes(router, state, projects, homeScope);
  registerStructureRoutes({ router, state, projects, platform, mutex, events });

  const operations = createOperations();
  const supervisor = options.supervisor ?? createProcessSupervisor({ file: processesFile(dirs.stateDir), platform });
  const providerContext: ProviderContext = {
    platform,
    env,
    homedir,
    dirs,
    config,
    events,
    supervisor,
    runCommand: options.runCommand ?? runCommand,
    now: () => new Date(),
    log: options.log ?? (() => undefined),
  };
  const providers = createProviderRegistry();
  for (const factory of options.providers ?? DEFAULT_PROVIDERS) providers.register(factory(providerContext));
  const providerRoutes = registerProviderRoutes({
    router,
    state,
    registry: providers,
    projects,
    operations,
    mutex,
    events,
    platform,
    onRefresh: async () => {
      await supervisor.reconcile();
    },
  });
  state.add('operations', () => operations.section());
  projects.addRemoveGuard((project) => providers.removeBlockers(project));

  return {
    dirs,
    config,
    version,
    os: osInfo,
    router,
    state,
    server,
    events,
    mutex,
    projects,
    operations,
    providers,
    supervisor,
    async start() {
      const bound = await server.listen(config.port);
      await events.append('service.started', { version, pid: process.pid, port: bound.port }).catch(() => undefined);
      // External programs run at start and on "Обновить" only (D11).
      providerRoutes.refresh();
      return { ...bound, urls: panelUrls(bound.port, getInterfaces()) };
    },
    stop: () => server.close(),
  };
}
