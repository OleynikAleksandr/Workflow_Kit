import { chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';

/** Platforms with their own data directory layout. */
export type DataPlatform = 'darwin' | 'linux' | 'win32';

/** Directories that hold Workflow Kit data on this machine. */
export interface DataDirs {
  /** Configuration and registries (config.json, projects.json). Shown as "data directory". */
  configDir: string;
  /** State and journals (events.jsonl, sessions/). */
  stateDir: string;
  /** Installed application versions (app/). */
  appDir: string;
  /** Service and session logs. */
  logsDir: string;
  /** Backups of other programs' config files. */
  backupsDir: string;
  /** True when WFK_DATA_DIR overrides the platform layout. */
  overridden: boolean;
}

/** Inputs of the directory resolution; injected for tests. */
export interface ResolveDirsInput {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  homedir: string;
}

const APP_NAME = 'Workflow Kit';
const XDG_NAME = 'workflow-kit';

/** Maps any Node platform to one of the supported layouts (BSDs use the Linux one). */
export function dataPlatform(platform: NodeJS.Platform): DataPlatform {
  if (platform === 'darwin' || platform === 'win32') return platform;
  return 'linux';
}

function pathApi(platform: DataPlatform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}

/** XDG variables count only when they hold an absolute path (XDG Base Directory spec). */
function xdgDir(value: string | undefined, fallback: string): string {
  return value && path.posix.isAbsolute(value) ? value : fallback;
}

/** Resolves the data directories for the platform; WFK_DATA_DIR puts everything in one place. */
export function resolveDataDirs(input: ResolveDirsInput): DataDirs {
  const platform = dataPlatform(input.platform);
  const p = pathApi(platform);
  const override = input.env['WFK_DATA_DIR']?.trim();
  let configDir: string;
  let stateDir: string;
  let appDir: string;
  if (override) {
    configDir = stateDir = appDir = p.resolve(override);
  } else if (platform === 'darwin') {
    configDir = stateDir = appDir = p.join(input.homedir, 'Library', 'Application Support', APP_NAME);
  } else if (platform === 'win32') {
    const local = input.env['LOCALAPPDATA'] || p.join(input.homedir, 'AppData', 'Local');
    configDir = stateDir = appDir = p.join(local, APP_NAME);
  } else {
    const home = input.homedir;
    configDir = p.join(xdgDir(input.env['XDG_CONFIG_HOME'], p.join(home, '.config')), XDG_NAME);
    stateDir = p.join(xdgDir(input.env['XDG_STATE_HOME'], p.join(home, '.local', 'state')), XDG_NAME);
    appDir = p.join(xdgDir(input.env['XDG_DATA_HOME'], p.join(home, '.local', 'share')), XDG_NAME);
  }
  return {
    configDir,
    stateDir,
    appDir,
    logsDir: p.join(stateDir, 'logs'),
    backupsDir: p.join(stateDir, 'backups'),
    overridden: Boolean(override),
  };
}

/** Unique directories of the layout, in creation order. */
export function listDataDirs(dirs: DataDirs): string[] {
  return [...new Set([dirs.configDir, dirs.stateDir, dirs.appDir, dirs.logsDir, dirs.backupsDir])];
}

/**
 * Creates the data directories with mode 0700. Parents created on the way keep the
 * default mode; the own directories are chmod-ed explicitly because mkdir obeys umask.
 */
export async function ensureDataDirs(dirs: DataDirs, platform: NodeJS.Platform = process.platform): Promise<void> {
  for (const dir of listDataDirs(dirs)) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    if (platform !== 'win32') await chmod(dir, 0o700);
  }
}
