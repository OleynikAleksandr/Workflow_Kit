import type { Dirent } from 'node:fs';
import path from 'node:path';
import { fsError } from './errors.ts';
import { nodeFs, realHome, requireDirectory, samePath } from './home-paths.ts';
import type { HomeScope } from './home-paths.ts';
import { allowedRoots, resolveInsideRoots, rootOf } from './roots.ts';
import type { AllowedRoot } from './roots.ts';

/** Default maximum number of subfolders returned by one listing. */
export const FOLDER_LIST_LIMIT = 500;

/** One subfolder in a listing. */
export interface FolderEntry {
  name: string;
  /** Absolute path (inside the listed real folder). */
  path: string;
}

/** Answer of GET /api/folders. */
export interface FolderListing {
  /** Real path of the listed folder. */
  path: string;
  /** Parent folder, or null at a root (the picker never leaves the roots). */
  parent: string | null;
  /** Real path of the home folder. */
  home: string;
  /** The home folder and the other local drives the picker can switch to. */
  roots: AllowedRoot[];
  entries: FolderEntry[];
  /** True when there were more subfolders than the limit. */
  truncated: boolean;
}

/** Options of listFolders. */
export interface ListFoldersOptions {
  /** Include folders whose name starts with a dot. */
  showHidden?: boolean;
  limit?: number;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** A symbolic link counts as a folder when its target is one; broken links are skipped. */
async function isFolder(entry: Dirent, full: string, scope: HomeScope): Promise<boolean> {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    return (await (scope.fs ?? nodeFs).stat(full)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Lists the subfolders of a folder inside the home folder or another local drive (home
 * itself when no path is given). Permission errors (macOS TCC for ~/Documents and the like) become
 * "access-denied" with a hint.
 */
export async function listFolders(
  input: string | undefined,
  scope: HomeScope,
  options: ListFoldersOptions = {},
): Promise<FolderListing> {
  const fs = scope.fs ?? nodeFs;
  const home = await realHome(scope);
  const real = await resolveInsideRoots(input === undefined || input === '' ? scope.homedir : input, scope, { allowHome: true, allowDrive: true });
  const roots = await allowedRoots(scope);
  const root = rootOf(real, roots, scope.platform);
  await requireDirectory(real, scope);
  let dirents: Dirent[];
  try {
    dirents = await fs.readdir(real);
  } catch (error) {
    throw fsError(error, real, scope.platform);
  }
  const p = scope.platform === 'win32' ? path.win32 : path.posix;
  const entries: FolderEntry[] = [];
  for (const entry of dirents) {
    const name = entry.name;
    if (!options.showHidden && name.startsWith('.')) continue;
    const full = p.join(real, name);
    if (await isFolder(entry, full, scope)) entries.push({ name, path: full });
  }
  entries.sort((a, b) => collator.compare(a.name, b.name));
  const limit = options.limit ?? FOLDER_LIST_LIMIT;
  return {
    path: real,
    parent: root && samePath(real, root.path, scope.platform) ? null : p.dirname(real),
    home,
    roots,
    entries: entries.slice(0, limit),
    truncated: entries.length > limit,
  };
}
