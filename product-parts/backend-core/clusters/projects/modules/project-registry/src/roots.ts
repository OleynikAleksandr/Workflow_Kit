import path from 'node:path';
import { ProjectError, fsError } from './errors.ts';
import { isInside, nodeFs, realHome, samePath } from './home-paths.ts';
import type { HomeScope } from './home-paths.ts';

/** A folder tree the picker and the projects may use: the home folder or a local drive. */
export interface AllowedRoot {
  /** Label for the picker: "Домой", "D:\", a volume name. */
  name: string;
  /** Real path of the root. */
  path: string;
  kind: 'home' | 'drive';
}

/** What a resolved path may be besides a folder strictly inside a root. */
export interface RootRules {
  /** The home folder itself is accepted (folder listing). */
  allowHome?: boolean;
  /** The root of another drive itself is accepted (listing, the projects folder). */
  allowDrive?: boolean;
}

/** A drive that does not answer within this time (a sleeping floppy, a lost network share) is skipped. */
export const DRIVE_PROBE_TIMEOUT_MS = 1500;

/** Roots are reused for this long, so one listing does not wait twice for a drive that does not answer. */
export const ROOTS_CACHE_MS = 5000;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const cache = new WeakMap<HomeScope, { at: number; roots: Promise<AllowedRoot[]> }>();

function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

async function isDir(target: string, scope: HomeScope): Promise<boolean> {
  const info = await within((scope.fs ?? nodeFs).stat(target), DRIVE_PROBE_TIMEOUT_MS);
  return info?.isDirectory() ?? false;
}

/** Windows: drive roots A:\…Z:\ that answer stat, except the system drive (only home is used there). */
async function windowsDrives(scope: HomeScope): Promise<AllowedRoot[]> {
  const env = scope.env ?? process.env;
  const system = (env['SystemDrive'] ?? 'C:').slice(0, 1).toUpperCase();
  const letters = [...LETTERS].filter((letter) => letter !== system);
  const found = await Promise.all(letters.map(async (letter) => ((await isDir(`${letter}:\\`, scope)) ? letter : undefined)));
  return found.filter((letter): letter is string => letter !== undefined).map((letter) => ({ name: `${letter}:\\`, path: `${letter}:\\`, kind: 'drive' }));
}

/** Hidden mount points (".timemachine") and macOS service volumes ("com.apple.TimeMachine.localsnapshots"). */
function serviceMount(name: string, platform: NodeJS.Platform): boolean {
  return name.startsWith('.') || (platform === 'darwin' && name.startsWith('com.apple.'));
}

/** Folders one level below a mount base (/Volumes, /mnt, /media/<user>); links to "/" are skipped. */
async function mountsBelow(base: string, scope: HomeScope): Promise<AllowedRoot[]> {
  const fs = scope.fs ?? nodeFs;
  const entries = await within(fs.readdir(base), DRIVE_PROBE_TIMEOUT_MS);
  if (!entries) return [];
  const roots: AllowedRoot[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (serviceMount(entry.name, scope.platform)) continue;
    const full = path.posix.join(base, entry.name);
    const real = await within(fs.realpath(full), DRIVE_PROBE_TIMEOUT_MS);
    if (!real || real === '/' || !(await isDir(real, scope))) continue;
    roots.push({ name: entry.name, path: real, kind: 'drive' });
  }
  return roots;
}

function userName(scope: HomeScope): string {
  const env = scope.env ?? process.env;
  return scope.username ?? env['USER'] ?? env['LOGNAME'] ?? path.posix.basename(scope.homedir);
}

/**
 * The home folder first, then the other local drives: Windows drive letters (not the
 * system drive), macOS /Volumes/* (not the boot volume), Linux /media/<user>/*,
 * /run/media/<user>/* and /mnt/*. Runs no programs; a drive that does not answer is left out.
 */
export function allowedRoots(scope: HomeScope): Promise<AllowedRoot[]> {
  const hit = cache.get(scope);
  if (hit && Date.now() - hit.at < ROOTS_CACHE_MS) return hit.roots;
  const roots = scanRoots(scope);
  cache.set(scope, { at: Date.now(), roots });
  roots.catch(() => cache.delete(scope));
  return roots;
}

async function scanRoots(scope: HomeScope): Promise<AllowedRoot[]> {
  const home = await realHome(scope);
  let drives: AllowedRoot[] = [];
  if (scope.platform === 'win32') {
    drives = await windowsDrives(scope);
  } else if (scope.platform === 'darwin') {
    drives = await mountsBelow('/Volumes', scope);
  } else if (scope.platform === 'linux') {
    const user = userName(scope);
    const bases = [`/media/${user}`, `/run/media/${user}`, '/mnt'];
    drives = (await Promise.all(bases.map((base) => mountsBelow(base, scope)))).flat();
  }
  const roots: AllowedRoot[] = [{ name: 'Домой', path: home, kind: 'home' }];
  for (const drive of drives) {
    if (roots.some((root) => samePath(root.path, drive.path, scope.platform))) continue;
    roots.push(drive);
  }
  return roots;
}

/** The root that holds a real path (the root itself counts), or undefined. */
export function rootOf(real: string, roots: AllowedRoot[], platform: NodeJS.Platform): AllowedRoot | undefined {
  const exact = roots.find((root) => samePath(real, root.path, platform));
  return exact ?? roots.find((root) => isInside(real, root.path, platform));
}

/**
 * Resolves an absolute path to its real path and checks that it lies inside the home
 * folder or another local drive (see allowedRoots). ".." segments and symbolic links are
 * resolved first, so leaving the roots through either fails with "outside-roots".
 */
export async function resolveInsideRoots(input: unknown, scope: HomeScope, rules: RootRules = {}): Promise<string> {
  const fs = scope.fs ?? nodeFs;
  if (typeof input !== 'string' || input.trim() === '' || input.includes('\0')) {
    throw new ProjectError('invalid-path', 'Укажите путь к папке');
  }
  if (!pathApi(scope.platform).isAbsolute(input)) throw new ProjectError('invalid-path', `Нужен абсолютный путь: ${input}`);
  const roots = await allowedRoots(scope);
  let real: string;
  try {
    real = await fs.realpath(input);
  } catch (error) {
    throw fsError(error, input, scope.platform);
  }
  const root = rootOf(real, roots, scope.platform);
  if (!root) {
    throw new ProjectError('outside-roots', `Папка вне домашней папки и других дисков: ${real}`, { realPath: real });
  }
  if (samePath(real, root.path, scope.platform)) {
    if (root.kind === 'home' && !rules.allowHome) {
      throw new ProjectError('invalid-path', 'Выберите папку внутри домашней, а не саму домашнюю папку');
    }
    if (root.kind === 'drive' && !rules.allowDrive) {
      throw new ProjectError('invalid-path', `Выберите папку на диске, а не сам диск: ${real}`);
    }
  }
  return real;
}

/** True when a real path is strictly inside one of the roots (a project folder may be there). */
export async function insideRoots(real: string, scope: HomeScope): Promise<boolean> {
  const roots = await allowedRoots(scope);
  return roots.some((root) => isInside(real, root.path, scope.platform));
}

function pathApi(platform: NodeJS.Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}
