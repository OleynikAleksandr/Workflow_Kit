// Shared types of the service-installer module.
import type { CommandRunner } from '#process-supervisor';
import type { InstallerFs } from './fs.ts';

/** Autostart mechanism used on a platform (spec section 9). */
export type AutostartMechanism = 'launchagent' | 'systemd-user' | 'xdg-autostart' | 'hkcu-run';

/** A file or registry entry managed by the installer and whether it is in place. */
export interface ManagedItem {
  path: string;
  present: boolean;
}

/** Service status shown in the "System" card; read from files only (D11). */
export interface ServiceStatus {
  /** False only for the context-less legacy call (the caller did not pass its machine context). */
  implemented: boolean;
  /** app/current.json is present and valid. */
  installed: boolean;
  /** The backend answers (true when the backend itself builds the status). */
  running: boolean;
  /** The autostart entry is registered. */
  autostart: boolean;
  mechanism: AutostartMechanism;
  /** Human-readable note for the panel. */
  note: string;
  /** "development" when WFK_DATA_DIR overrides the data directory: no launcher, icon or autostart. */
  instance?: 'default' | 'development';
  /** Installed version from app/current.json. */
  version?: string | null;
  installedAt?: string | null;
  /** Installed copy of the application (app/<version>). */
  appPath?: string | null;
  /** True when this code runs from the installed copy, false when from a clone. */
  fromInstalledCopy?: boolean;
  /** Autostart file or registry value. */
  autostartEntry?: string;
  launcher?: ManagedItem;
  icon?: ManagedItem;
  /** Absolute program paths saved by install (D12): the found programs of PROGRAMS. */
  programs?: Record<string, string>;
  /** PATH of the login shell saved by install (D12). */
  loginPath?: string | null;
}

/** Commands routed here by the cli module. */
export type ServiceCommand = 'install' | 'uninstall' | 'start' | 'stop' | 'status' | 'open' | 'doctor';

/** Outcome of a service command; the cli prints message and exits with exitCode. */
export interface ServiceCommandResult {
  ok: boolean;
  exitCode: number;
  message: string;
}

/** Answer of GET /api/health of a running backend. */
export interface HealthInfo {
  ok: true;
  version: string;
  pid: number;
  startedAt?: string;
}

/** Asks a backend on 127.0.0.1:<port> for /api/health; null when nothing answers. */
export type HealthProbe = (port: number) => Promise<HealthInfo | null>;

/** State of the shared access to the ChatGPT chats as the service reports it (spec M12). */
export interface SharedAccessInfo {
  state: string;
  label: string;
  reason: string | null;
  /** What to do or, on Windows (M13), what the checks found; null when nothing. */
  hint?: string | null;
}

/** Asks a backend on 127.0.0.1:<port> for the shared access of ChatGPT; null when it cannot. */
export type SharedAccessProbe = (port: number) => Promise<SharedAccessInfo | null>;

/** Starts a program in the background, detached from the caller, output appended to logFile. */
export type DetachedSpawner = (
  command: string,
  args: readonly string[],
  options: { env: Record<string, string>; logFile?: string; cwd?: string },
) => Promise<void>;

/** Machine context of the caller; everything defaults to the current process. */
export interface ServiceContext {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homedir?: string;
  /** Set by the backend when it builds its own status: the service is running. */
  serving?: boolean;
}

/** Context plus injectable effects; tests pass fakes for all of them. */
export interface ServiceDeps extends ServiceContext {
  fs?: InstallerFs;
  run?: CommandRunner;
  spawnDetached?: DetachedSpawner;
  health?: HealthProbe;
  sharedAccess?: SharedAccessProbe;
  /** Sends a signal to a pid reported by /api/health (fallback stop). */
  kill?: (pid: number, signal: NodeJS.Signals) => void;
  /** POST /api/system/shutdown of the service on a port; true when it accepted (Windows stop). */
  requestShutdown?: (port: number) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** User id for launchctl gui/<uid>. */
  uid?: number;
  /** Root of the code being installed (default: the root this module runs from). */
  sourceRoot?: string;
  /** Absolute node binary (default: process.execPath). */
  nodePath?: string;
  /** How long to wait for /api/health after a start (default 20 s). */
  readyTimeoutMs?: number;
  /** How long to wait for the backend to go away after a stop (default 10 s). */
  stopTimeoutMs?: number;
}

/** ServiceDeps with every field resolved. */
export interface ResolvedDeps {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  homedir: string;
  serving: boolean;
  fs: InstallerFs;
  run: CommandRunner;
  spawnDetached: DetachedSpawner;
  health: HealthProbe;
  sharedAccess: SharedAccessProbe;
  kill: (pid: number, signal: NodeJS.Signals) => void;
  requestShutdown: (port: number) => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  uid: number;
  sourceRoot: string;
  nodePath: string;
  readyTimeoutMs: number;
  stopTimeoutMs: number;
}
