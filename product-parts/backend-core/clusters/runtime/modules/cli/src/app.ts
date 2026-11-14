import { realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { configFile, createEventLog, createKeyedMutex, createOperations, ensureDataDirs, eventsFile, loadConfig, readJsonFile, resolveDataDirs, writeJsonAtomic } from '#data-store';
import type { DataDirs, EventLog, KeyedMutex, Operations, WfkConfig } from '#data-store';
import { createHttpServer, createRouter, createStateRegistry, registerCoreRoutes } from '#http-server';
import type { HttpServerHandle, InterfaceMap, Router, StateRegistry } from '#http-server';
import type { AgentChannel } from '#agent-channel';
import type { Autopilot } from '#autopilot';
import { kitBundleProvider } from '#kit-bundle';
import { createProjectSetup, registerSetupRoutes } from '#project-setup';
import type { ProjectSetup } from '#project-setup';
import type { SessionTitles } from '#session-titles';
import type { ReviewToggles } from '#plan-review';
import { wireSessions } from './session-wiring.ts';
import { nativeStatuslineCommand } from './native-statusline.ts';
import { resolveAutoCompactWindow } from './auto-compact-window.ts';
import { createKitRunner, createWorkflowState } from '#kit-runner';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { registerStructureRoutes } from '#kit-structure';
import { registerPublicationRoutes } from '#git-publish';
import { registerKitUpdateRoutes } from '#kit-update';
import { panelShellMount } from '#panel-shell';
import { projectWizardMount } from '#project-wizard';
import { sessionViewMount } from '#session-view';
import { sessionChatMount } from '#session-chat';
import { createProcessSupervisor, processesFile, runCommand } from '#process-supervisor';
import type { CommandRunner, ProcessSupervisor } from '#process-supervisor';
import { createProviderRegistry, registerProviderRoutes } from '#provider-registry';
import type { ProviderContext, ProviderFactory, ProviderRegistry } from '#provider-registry';
import { createProjectRegistry, isInside, projectsFile, registerProjectRoutes } from '#project-registry';
import type { ProjectRegistry } from '#project-registry';
import { PROGRAMS, getServiceStatus } from '#service-installer';
import { registerOpenLinkRoute } from './open-link.ts';
import { DEFAULT_PROVIDERS } from './provider-list.ts';
import { wireProviderLifecycle } from './provider-lifecycle.ts';
import { currentOsInput, detectOs, panelUrls, readPackageVersion } from './system-info.ts';
import type { DetectOsInput, OsInfo } from './system-info.ts';

/** realpath of a folder; for a missing one, realpath of its nearest existing parent plus the rest. */
async function realFolder(folder: string): Promise<string> {
  let base = path.resolve(folder);
  const rest: string[] = [];
  for (;;) {
    try {
      return path.join(await realpath(base), ...rest);
    } catch {
      const parent = path.dirname(base);
      if (parent === base) return path.resolve(folder);
      rest.unshift(path.basename(base));
      base = parent;
    }
  }
}

/** Inputs of createApp; everything machine-specific is injectable for tests. */
export interface AppOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homedir?: string;
  getInterfaces?: () => InterfaceMap;
  osInput?: DetectOsInput;
  log?: (line: string) => void;
  /** Provider factories (default: DEFAULT_PROVIDERS); tests pass fake providers. */
  providers?: ProviderFactory[];
  /** Runner of external programs given to providers (default: runCommand). */
  runCommand?: CommandRunner;
  /** Process supervisor given to providers (default: over <state>/processes.json). */
  supervisor?: ProcessSupervisor;
  /** Whether the Kimi Code app is installed, for POST /api/open-link (default: the check of the OS). */
  kimiApp?: () => Promise<boolean>;
  /** The start of the Kimi Code app with --workspace=<folder>, for POST /api/open-link (default: the command of the OS). */
  kimiCommand?: (folder: string) => Promise<{ command: string; args: string[] } | null>;
}

/** The assembled backend: data, routes, state sections and the HTTP server. */
export interface App {
  readonly dirs: DataDirs;
  readonly config: WfkConfig;
  readonly version: string;
  readonly os: OsInfo;
  /** Route registry and /api/state sections; feature modules add theirs here before start(). */
  readonly router: Router;
  readonly state: StateRegistry;
  readonly server: HttpServerHandle;
  /** Backend event journal (events.jsonl, rotated at 5 MiB) and the keyed mutex of actions (D10). */
  readonly events: EventLog;
  readonly mutex: KeyedMutex;
  /** Project list (projects.json); later modules add remove guards here. */
  readonly projects: ProjectRegistry;
  /** Long actions (D10), shown in the "operations" section of /api/state. */
  readonly operations: Operations;
  /** Providers by id; routes and the "providers" section go through the contract only. */
  readonly providers: ProviderRegistry;
  /** Session and environment processes (D5, D9). */
  readonly supervisor: ProcessSupervisor;
  /** Kit commands of projects (app bundle for inspect/install, project bundle otherwise). */
  readonly kit: KitRunner;
  /** Cached Kit state of projects: the "workflow" section of /api/state. */
  readonly workflow: WorkflowState;
  /** Channel to agents through the Stop and UserPromptSubmit hooks. */
  readonly channel: AgentChannel;
  /** Autopilot of sessions and the plan actions of the panel. */
  readonly autopilot: Autopilot;
  /** Per-session "Ревью плана" toggles (stored only in milestone 2). */
  readonly review: ReviewToggles;
  /** Session names: manual, agent topic, plan objective, provider name. */
  readonly titles: SessionTitles;
  /** The project wizard: preview and the one-consent apply. */
  readonly setup: ProjectSetup;
  /** Starts listening on config.port; returns the bound port and the panel URLs. */
  start(): Promise<{ port: number; host: string; urls: string[] }>;
  stop(): Promise<void>;
  /** Resolves on POST /api/system/shutdown (wfk serve then stops, as on SIGTERM). */
  readonly shutdownRequested: Promise<void>;
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
  /** The service status and the names of every program the installer looks for (found or not). */
  service: ReturnType<typeof getServiceStatus> & { programNames: string[] };
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
  const server = createHttpServer({ router, staticMounts: [panelShellMount(), projectWizardMount(), sessionViewMount(), sessionChatMount()], getInterfaces, log: options.log });
  const events = createEventLog({ file: eventsFile(dirs) });
  const mutex = createKeyedMutex();
  const homeScope = { homedir, platform };
  const projects = createProjectRegistry({
    ...homeScope,
    file: projectsFile(dirs),
    projectsRoot: config.projectsRoot,
    events,
    mutex,
    saveRoot: async (root) => {
      const file = configFile(dirs);
      const current = await readJsonFile(file).catch(() => undefined);
      const base = typeof current === 'object' && current !== null && !Array.isArray(current) ? (current as Record<string, unknown>) : {};
      await writeJsonAtomic(file, { ...base, projectsRoot: root });
    },
  });

  registerCoreRoutes(router, state, () => ({ version, pid: process.pid, startedAt }));
  const system = registerOpenLinkRoute({ router, runCommand: options.runCommand ?? runCommand, platform, env, log: options.log, projects, homedir, ...(options.kimiApp ? { kimiApp: options.kimiApp } : {}), ...(options.kimiCommand ? { kimiCommand: options.kimiCommand } : {}) });
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
    service: { ...getServiceStatus(platform, { env, homedir, serving: true }), programNames: [...PROGRAMS] },
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
    nativeStatuslineCommand,
    // Children get no CLAUDE* variables from the service, so only settings files apply here.
    autoCompactWindow: (modelId, cwd) => resolveAutoCompactWindow(modelId, { platform, env: {}, cwd, homedir }),
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
  const lifecycle = wireProviderLifecycle({ projects, providers, log: options.log });

  const kitBundle = kitBundleProvider({ appDir: dirs.appDir });
  const kit = createKitRunner({
    runCommand: options.runCommand ?? runCommand,
    appBundle: async () => (await kitBundle()).file,
    env,
  });
  const workflow = createWorkflowState({
    runner: kit,
    listProjects: async () => (await projects.list()).map((project) => ({ id: project.id, path: project.path })),
    log: options.log,
    onChange: (projectId) => {
      void publication.refresh(projectId).catch(() => undefined);
      void kitUpdate.refresh(projectId).catch(() => undefined);
    },
  });
  state.add('workflow', () => workflow.section());
  // Windows keeps a watched folder busy: the project's watchers are released before its folder is deleted.
  projects.addBeforeDeleteHook(async (project) => workflow.release(project.id));
  // GitHub publication is not a plan task: only with no open scope (spec publication-order).
  const publication = registerPublicationRoutes({ router, state, projects, scopeOpen: (id) => workflow.get(id)?.scope != null, log: options.log });
  // Kit version of each project and «Обновить Kit» (spec M22 section 2.6).
  const kitUpdate = registerKitUpdateRoutes({
    router,
    state,
    projects,
    kit,
    providers,
    log: options.log,
    onUpdated: (projectId) => void workflow.refresh(projectId).catch(() => undefined),
  });

  // The deepest registered project that contains a folder (paths compared after realpath).
  const resolveFolderProject = async (folder: string): Promise<{ id: string } | undefined> => {
    const real = await realFolder(folder);
    const found = (await projects.list())
      .filter((project) => isInside(real, project.path, platform, true) || isInside(folder, project.path, platform, true))
      .sort((a, b) => b.path.length - a.path.length)[0];
    return found ? { id: found.id } : undefined;
  };
  const { channel, autopilot, review, titles, crossReview } = wireSessions({
    router,
    state,
    mutex,
    projects,
    providers,
    workflow,
    kit,
    resolveFolderProject,
    sessionArchived: (id, key, archived) => lifecycle.sessionArchived(id, key, archived),
    log: options.log,
  });

  const setup = createProjectSetup({
    projects,
    providers,
    kit,
    workflow,
    operations,
    runCommand: options.runCommand ?? runCommand,
    env,
    homedir,
    platform,
    now: () => new Date(),
    log: options.log,
  });
  registerSetupRoutes({ router, state, setup });

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
    kit,
    workflow,
    channel,
    autopilot,
    review,
    titles,
    setup,
    shutdownRequested: system.shutdownRequested,
    async start() {
      const bound = await server.listen(config.port);
      await events.append('service.started', { version, pid: process.pid, port: bound.port }).catch(() => undefined);
      providerRoutes.refresh(); // External programs run at start and on "Обновить" only (D11).
      void workflow.start();
      await review.load().catch(() => undefined);
      await crossReview.load().catch(() => undefined);
      await titles.load().catch(() => undefined);
      return { ...bound, urls: panelUrls(bound.port, getInterfaces()) };
    },
    async stop() {
      workflow.stop(), publication.stop(), kitUpdate.stop(), channel.close(), lifecycle.stop();
      await server.close();
    },
  };
}
