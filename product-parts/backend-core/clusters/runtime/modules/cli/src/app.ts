import os from 'node:os';
import { ensureDataDirs, loadConfig, resolveDataDirs } from '#data-store';
import type { DataDirs, WfkConfig } from '#data-store';
import { createHttpServer, createRouter, createStateRegistry, registerCoreRoutes } from '#http-server';
import type { HttpServerHandle, InterfaceMap, Router, StateRegistry } from '#http-server';
import { panelShellMount } from '#panel-shell';
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
}

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
  const server = createHttpServer({ router, staticMounts: [panelShellMount()], getInterfaces, log: options.log });

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
    service: getServiceStatus(platform),
  }));

  return {
    dirs,
    config,
    version,
    os: osInfo,
    router,
    state,
    server,
    async start() {
      const bound = await server.listen(config.port);
      return { ...bound, urls: panelUrls(bound.port, getInterfaces()) };
    },
    stop: () => server.close(),
  };
}
