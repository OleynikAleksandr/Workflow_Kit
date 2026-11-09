// File system operations of the installer behind an interface, so the same install flow is
// tested for macOS, Linux and Windows paths on an in-memory file system.
import { accessSync, constants, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from '#data-store';

/** Everything the installer does with files. */
export interface InstallerFs {
  /** Text of a file; undefined when it does not exist. */
  readText(file: string): Promise<string | undefined>;
  /** Atomic write; parent directories are created (0700 unless dirMode is given). */
  writeText(file: string, text: string, options?: { mode?: number; dirMode?: number }): Promise<void>;
  /** Removes a file or a directory tree; a missing path is fine. */
  remove(target: string): Promise<void>;
  exists(target: string): Promise<boolean>;
  /** Names inside a directory; [] when it does not exist. */
  list(dir: string): Promise<string[]>;
  /** Copies a directory tree; filter gets the source path of every entry. */
  copyTree(from: string, to: string, filter: (source: string) => boolean): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** Creates a directory and its parents (0700 by default). */
  ensureDir(dir: string, mode?: number): Promise<void>;
  /** Synchronous reads for the status of the panel (cheap, files only). */
  existsSync(target: string): boolean;
  readTextSync(file: string): string | undefined;
  /** A regular file the user may execute. */
  isExecutable(file: string): boolean;
  /** Path with every symlink resolved; null when it does not exist. */
  realpath(file: string): string | null;
}

/** The real file system. */
export const nodeFs: InstallerFs = {
  async readText(file) {
    try {
      return await readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  },
  writeText: (file, text, options) => writeFileAtomic(file, text, options),
  remove: (target) => rm(target, { recursive: true, force: true }),
  async exists(target) {
    try {
      await stat(target);
      return true;
    } catch {
      return false;
    }
  },
  async list(dir) {
    try {
      return await readdir(dir);
    } catch {
      return [];
    }
  },
  copyTree: (from, to, filter) => cp(from, to, { recursive: true, filter: (source) => filter(source) }),
  rename: (from, to) => rename(from, to),
  async ensureDir(dir, mode = 0o700) {
    await mkdir(dir, { recursive: true, mode });
  },
  existsSync: (target) => existsSync(target),
  readTextSync(file) {
    try {
      return readFileSync(file, 'utf8');
    } catch {
      return undefined;
    }
  },
  isExecutable(file) {
    try {
      if (!statSync(file).isFile()) return false;
      if (process.platform !== 'win32') accessSync(file, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
  realpath(file) {
    try {
      return realpathSync(file);
    } catch {
      return null;
    }
  },
};

/** Directories left out of the installed copy. */
export const COPY_EXCLUDED_DIRS: readonly string[] = ['test', 'node_modules', '.git'];

/** Filter for copyTree: skips test directories and editor or OS litter. */
export function copyFilter(source: string): boolean {
  const name = source.split(/[\\/]/).pop() ?? '';
  if (COPY_EXCLUDED_DIRS.includes(name)) return false;
  return name !== '.DS_Store';
}

/** Path functions of a platform (win32 paths keep working on a Unix test host). */
export function pathApi(platform: NodeJS.Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}
