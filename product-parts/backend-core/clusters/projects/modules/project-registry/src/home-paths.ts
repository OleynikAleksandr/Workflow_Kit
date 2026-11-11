import type { Dirent, Stats } from 'node:fs';
import { mkdir, readdir, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { ProjectError, fsError } from './errors.ts';

/** File system calls the registry uses; injectable so tests can simulate EPERM (macOS TCC). */
export interface RegistryFs {
  realpath(target: string): Promise<string>;
  stat(target: string): Promise<Stats>;
  readdir(target: string): Promise<Dirent[]>;
  mkdir(target: string, options: { recursive: boolean }): Promise<unknown>;
  /** Removes a folder with its contents (deleteFolder of an archived project). */
  rm(target: string): Promise<void>;
}

/** Default file system calls (node:fs/promises). */
export const nodeFs: RegistryFs = {
  realpath: (target) => realpath(target),
  stat: (target) => stat(target),
  readdir: (target) => readdir(target, { withFileTypes: true }),
  mkdir: (target, options) => mkdir(target, options),
  // Retries cover a folder Windows still keeps busy for a moment (EBUSY, EPERM) after its watchers closed.
  rm: (target) => rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
};

/** Where projects may live: the home folder and other local drives (see roots.ts), checked by realpath. */
export interface HomeScope {
  homedir: string;
  /** Selects case-insensitive comparison on Windows and the drive scan of allowedRoots. */
  platform: NodeJS.Platform;
  fs?: RegistryFs;
  /** Environment for SystemDrive (Windows) and USER (Linux /media/<user>); process.env by default. */
  env?: NodeJS.ProcessEnv;
  /** User name for /media/<user> on Linux; taken from env or the home folder by default. */
  username?: string;
}

function pathApi(platform: NodeJS.Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}

function comparable(value: string, platform: NodeJS.Platform): string {
  const normalized = pathApi(platform).normalize(value).normalize('NFC');
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/** True when two real paths name the same folder (case-insensitive on Windows). */
export function samePath(a: string, b: string, platform: NodeJS.Platform): boolean {
  return comparable(a, platform) === comparable(b, platform);
}

/**
 * True when child is inside parent (or equal to it with allowEqual). Both must already
 * be real paths; the comparison is textual and case-insensitive on Windows.
 */
export function isInside(child: string, parent: string, platform: NodeJS.Platform, allowEqual = false): boolean {
  const p = pathApi(platform);
  const c = comparable(child, platform);
  const base = comparable(parent, platform);
  if (c === base) return allowEqual;
  const prefix = base.endsWith(p.sep) ? base : base + p.sep;
  return c.startsWith(prefix);
}

/** Real path of the home folder. */
export async function realHome(scope: HomeScope): Promise<string> {
  const fs = scope.fs ?? nodeFs;
  try {
    return await fs.realpath(scope.homedir);
  } catch (error) {
    throw fsError(error, scope.homedir, scope.platform);
  }
}

/** Fails with "not-directory" unless the real path is a directory. */
export async function requireDirectory(real: string, scope: HomeScope): Promise<void> {
  const fs = scope.fs ?? nodeFs;
  let info: Stats;
  try {
    info = await fs.stat(real);
  } catch (error) {
    throw fsError(error, real, scope.platform);
  }
  if (!info.isDirectory()) throw new ProjectError('not-directory', `Это не папка: ${real}`);
}
