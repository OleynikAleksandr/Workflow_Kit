// Copies of foreign config files taken before Kit writes into them (D7): <backups>/<name>-<hash>/,
// the newest BACKUPS_KEPT copies per file are kept.
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

/** Copies kept per backed-up file (spec section 6). */
export const BACKUPS_KEPT = 10;

/** Options of backupFile; the clock is injectable for tests. */
export interface BackupOptions {
  /** DataDirs.backupsDir. */
  backupsDir: string;
  /** Copies kept for this file (default 10). */
  keep?: number;
  now?: () => Date;
}

/** Directory holding the copies of one file: its base name plus a hash of its absolute path. */
export function backupDirFor(backupsDir: string, file: string): string {
  const absolute = path.resolve(file);
  const hash = createHash('sha256').update(absolute).digest('hex').slice(0, 10);
  const base = path.basename(absolute).replace(/[^A-Za-z0-9._-]/g, '_') || 'file';
  return path.join(backupsDir, `${base}-${hash}`);
}

/**
 * Copies file into its backup directory (mode 0600, directories 0700) and prunes old copies.
 * Returns the path of the copy, or null when the file does not exist (nothing to back up).
 */
export async function backupFile(file: string, options: BackupOptions): Promise<string | null> {
  const dir = backupDirFor(options.backupsDir, file);
  const stamp = (options.now ?? (() => new Date()))().toISOString().replace(/[:.]/g, '-');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  let target = path.join(dir, `${stamp}${path.extname(file)}`);
  for (let n = 1; ; n += 1) {
    try {
      await copyFile(file, target, 1 /* COPYFILE_EXCL */);
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return null;
      if (code !== 'EEXIST' || n > 100) throw error;
      target = path.join(dir, `${stamp}-${n}${path.extname(file)}`);
    }
  }
  if (process.platform !== 'win32') await chmod(target, 0o600);
  const keep = Math.max(1, options.keep ?? BACKUPS_KEPT);
  const copies = (await readdir(dir)).sort();
  for (const old of copies.slice(0, Math.max(0, copies.length - keep))) {
    await rm(path.join(dir, old), { force: true });
  }
  return target;
}
