// Keys of projects["<folder>"] in ~/.claude.json (spec M5 section 4.3). On Windows Claude Code writes
// the folder with forward slashes and does not normalise the drive letter case, so a Windows path
// (C:\… or C:/…) matches a key ignoring case and slash style. Other paths match exactly, as before.

const WINDOWS_PATH = /^[A-Za-z]:[\\/]/;

/** The comparison form of a folder: unchanged for POSIX paths, lower case with "/" for Windows ones. */
export function folderKey(folder: string): string {
  if (!WINDOWS_PATH.test(folder)) return folder;
  const slashed = folder.replace(/\\/g, '/');
  return (slashed.length > 3 ? slashed.replace(/\/+$/, '') : slashed).toLowerCase();
}

/** The key Kit writes for a new entry: as Claude Code writes it (forward slashes, upper-case drive). */
export function claudeFolderKey(folder: string): string {
  if (!WINDOWS_PATH.test(folder)) return folder;
  const slashed = folder.replace(/\\/g, '/');
  const trimmed = slashed.length > 3 ? slashed.replace(/\/+$/, '') : slashed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** The existing key that names the folder (exact first), or null. */
export function findFolderKey(keys: Iterable<string>, folder: string): string | null {
  const wanted = folderKey(folder);
  let match: string | null = null;
  for (const key of keys) {
    if (key === folder) return key;
    if (match === null && folderKey(key) === wanted) match = key;
  }
  return match;
}
