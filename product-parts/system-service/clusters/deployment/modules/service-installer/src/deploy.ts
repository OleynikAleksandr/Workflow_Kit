// The installed copy: app/<version>, app/current.json (no symlinks) and program paths in config.json.
import { randomBytes } from 'node:crypto';
import { DEFAULT_PORT, parsePort } from '#data-store';
import { copyFilter, pathApi } from './fs.ts';
import type { InstallerFs } from './fs.ts';
import { entryOf, versionDir } from './layout.ts';
import type { ServiceLayout } from './layout.ts';
import type { AutostartMechanism } from './types.ts';

/** What gets copied from the source root into app/<version>. */
export const APP_PARTS: readonly string[] = ['bin', 'product-parts', 'package.json'];

/** Contents of app/current.json. */
export interface CurrentRecord {
  version: string;
  /** app/<version>. */
  appPath: string;
  /** app/<version>/bin/wfk.mjs. */
  entry: string;
  /** Absolute node the service runs. */
  node: string;
  installedAt: string;
  /** False for a development instance (WFK_DATA_DIR): no launcher, icon or autostart. */
  integrated: boolean;
  mechanism: AutostartMechanism | null;
  /** Autostart file or registry value; null when not registered. */
  autostartEntry: string | null;
  launcher: string | null;
  icon: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** Parses app/current.json; null when the text is missing or not a valid record. */
export function parseCurrent(text: string | undefined): CurrentRecord | null {
  if (text === undefined) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const version = str(raw['version']);
  const appPath = str(raw['appPath']);
  const entry = str(raw['entry']);
  const node = str(raw['node']);
  if (!version || !appPath || !entry || !node) return null;
  const mechanism = str(raw['mechanism']);
  return {
    version,
    appPath,
    entry,
    node,
    installedAt: str(raw['installedAt']) ?? '',
    integrated: raw['integrated'] !== false,
    mechanism: mechanism === 'launchagent' || mechanism === 'systemd-user' || mechanism === 'xdg-autostart' || mechanism === 'hkcu-run' ? mechanism : null,
    autostartEntry: str(raw['autostartEntry']),
    launcher: str(raw['launcher']),
    icon: str(raw['icon']),
  };
}

/** Reads app/current.json. */
export async function readCurrent(fs: InstallerFs, layout: ServiceLayout): Promise<CurrentRecord | null> {
  return parseCurrent(await fs.readText(layout.currentFile));
}

/** Writes app/current.json atomically (0600). */
export async function writeCurrent(fs: InstallerFs, layout: ServiceLayout, record: CurrentRecord): Promise<void> {
  await fs.writeText(layout.currentFile, `${JSON.stringify(record, null, 2)}\n`);
}

/** Version from package.json of a source root. */
export async function readSourceVersion(fs: InstallerFs, platform: NodeJS.Platform, root: string): Promise<string> {
  const text = await fs.readText(pathApi(platform).join(root, 'package.json'));
  if (text === undefined) throw new Error(`не найден package.json в ${root}`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`невалидный package.json в ${root}`);
  }
  const version = isRecord(raw) ? str(raw['version']) : null;
  if (!version || !/^[0-9A-Za-z.+-]+$/.test(version)) throw new Error(`в package.json нет корректной версии (${root})`);
  if (!(await fs.exists(entryOf(platform, root)))) throw new Error(`не найден bin/wfk.mjs в ${root}`);
  return version;
}

function samePath(platform: NodeJS.Platform, a: string, b: string): boolean {
  const p = pathApi(platform);
  const left = p.resolve(a);
  const right = p.resolve(b);
  return platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/**
 * Copies bin, product-parts and package.json into app/<version> through a temporary
 * directory and a rename; returns false when the source already is that directory.
 */
export async function copyApp(fs: InstallerFs, layout: ServiceLayout, sourceRoot: string, version: string): Promise<boolean> {
  const p = pathApi(layout.platform);
  const target = versionDir(layout, version);
  if (samePath(layout.platform, sourceRoot, target)) return false;
  const tmp = p.join(layout.appRoot, `.${version}.${randomBytes(4).toString('hex')}.tmp`);
  try {
    for (const part of APP_PARTS) {
      const from = p.join(sourceRoot, part);
      if (await fs.exists(from)) await fs.copyTree(from, p.join(tmp, part), copyFilter);
    }
    await fs.remove(target);
    await fs.rename(tmp, target);
  } catch (error) {
    await fs.remove(tmp);
    throw error;
  }
  return true;
}

/** Removes versions other than the kept ones and leftovers of interrupted copies. */
export async function pruneVersions(fs: InstallerFs, layout: ServiceLayout, keep: readonly string[]): Promise<string[]> {
  const p = pathApi(layout.platform);
  const removed: string[] = [];
  for (const name of await fs.list(layout.appRoot)) {
    if (name === 'current.json' || keep.includes(name)) continue;
    if (name.startsWith('.') && !name.endsWith('.tmp')) continue;
    await fs.remove(p.join(layout.appRoot, name));
    removed.push(name);
  }
  return removed;
}

/** Raw config.json; an invalid file is an error and is never overwritten. */
async function readConfigObject(fs: InstallerFs, layout: ServiceLayout): Promise<Record<string, unknown>> {
  const text = await fs.readText(layout.configFile);
  if (text === undefined) return {};
  try {
    const raw: unknown = JSON.parse(text);
    if (isRecord(raw)) return raw;
  } catch {
    // Reported below.
  }
  throw new Error(`${layout.configFile} содержит невалидный JSON; исправьте или удалите файл`);
}

/** Saves the program paths and the login PATH in config.json, keeping the other keys (D12). */
export async function saveProgramPaths(
  fs: InstallerFs,
  layout: ServiceLayout,
  programs: Record<string, string>,
  loginPath: string,
): Promise<void> {
  const config = await readConfigObject(fs, layout);
  await fs.writeText(layout.configFile, `${JSON.stringify({ ...config, programs, loginPath }, null, 2)}\n`);
}

/** Program paths and login PATH saved in config.json (sync, for the panel status). */
export function readProgramPathsSync(fs: InstallerFs, layout: ServiceLayout): { programs: Record<string, string>; loginPath: string | null } {
  const programs: Record<string, string> = {};
  let loginPath: string | null = null;
  try {
    const raw: unknown = JSON.parse(fs.readTextSync(layout.configFile) ?? '{}');
    if (isRecord(raw)) {
      if (isRecord(raw['programs'])) {
        for (const [name, value] of Object.entries(raw['programs'])) if (typeof value === 'string') programs[name] = value;
      }
      loginPath = str(raw['loginPath']);
    }
  } catch {
    // An invalid config shows no programs; the backend reports the config error itself.
  }
  return { programs, loginPath };
}

/** Port of the backend: WFK_PORT, then config.json, then 4747. */
export async function servicePort(fs: InstallerFs, layout: ServiceLayout, env: NodeJS.ProcessEnv): Promise<number> {
  const fromEnv = env['WFK_PORT']?.trim();
  if (fromEnv) return parsePort(fromEnv, 'WFK_PORT');
  const config = await readConfigObject(fs, layout);
  return config['port'] === undefined ? DEFAULT_PORT : parsePort(config['port'], 'config.json');
}
