import { realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { configFile, createEventLog, createKeyedMutex, createOperations, ensureDataDirs, eventsFile, loadConfig, readJsonFile, resolveDataDirs, writeJsonAtomic } from '#data-store';
import type { DataDirs, EventLog, KeyedMutex, Operations, WfkConfig } from '#data-store';
import { createHttpServer, createRouter, createStateRegistry, registerCoreRoutes } from '#http-server';
import type { HttpServerHandle, InterfaceMap, Router, StateRegistry } from '#http-server';
import { createAgentChannel, registerChannelRoutes } from '#agent-channel';
import type { AgentChannel } from '#agent-channel';
import { createAutopilot, registerAutopilotRoutes } from '#autopilot';
import type { Autopilot } from '#autopilot';
import { kitBundleProvider } from '#kit-bundle';
import { createReviewToggles, registerReviewRoutes } from '#plan-review';
import { createProjectSetup, registerSetupRoutes } from '#project-setup';
import type { ProjectSetup } from '#project-setup';
import { createSessionTitles, registerTitleRoutes } from '#session-titles';
import type { SessionTitles } from '#session-titles';
import type { ReviewToggles } from '#plan-review';
import { createKitRunner, createWorkflowState } from '#kit-runner';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { registerStructureRoutes } from '#kit-structure';
import { panelShellMount } from '#panel-shell';
import { providerCardsMount } from '#provider-cards';
import { createProcessSupervisor, processesFile, runCommand } from '#process-supervisor';
import type { CommandRunner, ProcessSupervisor } from '#process-supervisor';
import { createProvider as createClaudeProvider } from '#provider-claude';
import { createProvider as createCodexProvider } from '#provider-codex';
import { createProviderRegistry, registerProviderRoutes } from '#provider-registry';
import type { ProviderContext, ProviderFactory, ProviderRegistry } from '#provider-registry';
import { createProjectRegistry, isInside, projectsFile, registerProjectRoutes } from '#project-registry';
import type { ProjectRegistry } from '#project-registry';
import { getServiceStatus } from '#service-installer';
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
    saveRoot: async (root) => {
      const file = configFile(dirs);
      const current = await readJsonFile(file).catch(() => undefined);
      const base = typeof current === 'object' && current !== null && !Array.isArray(current) ? (current as Record<string, unknown>) : {};
      await writeJsonAtomic(file, { ...base, projectsRoot: root });
    },
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
  });
  state.add('workflow', () => workflow.section());

  // The deepest registered project that contains a folder (paths compared after realpath).
  const resolveFolderProject = async (folder: string): Promise<{ id: string } | undefined> => {
    const real = await realFolder(folder);
    const found = (await projects.list())
      .filter((project) => isInside(real, project.path, platform, true) || isInside(folder, project.path, platform, true))
      .sort((a, b) => b.path.length - a.path.length)[0];
    return found ? { id: found.id } : undefined;
  };
  const channel = createAgentChannel({
    resolveProject: resolveFolderProject,
    log: options.log,
  });
  const autopilot = createAutopilot({
    runner: kit,
    workflow,
    channel,
    projectPath: async (id) => (await projects.get(id))?.path,
    log: options.log,
  });
  channel.setDecider((context) => autopilot.decide(context));
  // The prompt hook tells the autopilot who started the turn: the user typing, or panel messages.
  const observedChannel: AgentChannel = {
    ...channel,
    async prompt(input) {
      const reply = await channel.prompt(input);
      const key = `${input.client}:${input.sessionId}`;
      autopilot.onPrompt(key, reply.answer !== null);
      titles.onTurn(key);
      return reply;
    },
  };
  registerChannelRoutes({ router, state, channel: observedChannel });
  registerAutopilotRoutes({ router, state, autopilot, mutex });

  const review = createReviewToggles({
    listProjects: async () => (await projects.list()).map((project) => ({ id: project.id, path: project.path })),
    pathChosen: (id) => Boolean(workflow.get(id)?.execution),
  });
  registerReviewRoutes({ router, state, toggles: review });

  const titles = createSessionTitles({
    listProjects: async () => (await projects.list()).map((project) => ({ id: project.id, path: project.path })),
    resolveProject: resolveFolderProject,
    sessions: () => channel.list(),
    scope: (id) => {
      const view = workflow.get(id);
      return view?.scope ? { objective: view.scope.objective, ownerSession: view.execution?.ownerSession ?? null } : null;
    },
    rename: async (id, key, name) => {
      const project = await projects.get(id);
      const provider = providers.get(key.slice(0, key.indexOf(':')));
      if (!project || !provider?.renameSession) return { synced: false, note: 'Имя хранится только в Workflow Kit' };
      return provider.renameSession(project, key.slice(key.indexOf(':') + 1), name);
    },
    log: options.log,
  });
  registerTitleRoutes({ router, state, titles });

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
    async start() {
      const bound = await server.listen(config.port);
      await events.append('service.started', { version, pid: process.pid, port: bound.port }).catch(() => undefined);
      // External programs run at start and on "Обновить" only (D11).
      providerRoutes.refresh();
      void workflow.start();
      await review.load().catch(() => undefined);
      await titles.load().catch(() => undefined);
      return { ...bound, urls: panelUrls(bound.port, getInterfaces()) };
    },
    async stop() {
      workflow.stop();
      channel.close();
      await server.close();
    },
  };
}
