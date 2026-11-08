// The ChatGPT app keeps its own catalog of threads (<CODEX_HOME>/sqlite/codex.db) and builds
// «Недавние» from it; thread/delete does not touch it (spec M3-autostart section 9, verified with
// the user on S002). After a thread is gone its rows are removed there too: a copy of the database
// first (the 5 newest are kept), a check afterwards. The app shows the change after a restart.
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

/** Tables of the app catalog that hold a thread. */
export const CATALOG_TABLES = ['local_thread_catalog', 'local_thread_catalog_scan_entries', 'thread_timeline_ledger'] as const;
/** Copies of codex.db kept in the backups folder. */
export const CATALOG_BACKUPS_KEPT = 5;

/** Path of the app catalog. */
export const appCatalogFile = (codexHome: string): string => path.join(codexHome, 'sqlite', 'codex.db');

type Db = import('node:sqlite').DatabaseSync;

function count(db: Db, ids: readonly string[]): number {
  const marks = ids.map(() => '?').join(', ');
  let total = 0;
  for (const table of CATALOG_TABLES) {
    try {
      const row = db.prepare(`SELECT count(*) AS n FROM ${table} WHERE thread_id IN (${marks})`).get(...ids) as { n?: number } | undefined;
      total += Number(row?.n ?? 0);
    } catch {
      // A table this version of the app does not have.
    }
  }
  return total;
}

async function pruneBackups(backupsDir: string): Promise<void> {
  const names = (await readdir(backupsDir).catch(() => [] as string[])).filter((n) => n.startsWith('codex.db-')).sort();
  for (const old of names.slice(0, Math.max(0, names.length - CATALOG_BACKUPS_KEPT))) await rm(path.join(backupsDir, old), { recursive: true, force: true });
}

/**
 * Removes the rows of the threads from the app catalog. Resolves to the number of rows removed (0
 * without the database or rows: nothing is written); throws when a row stays after the write.
 */
export async function forgetInAppCatalog(options: { codexHome: string; backupsDir: string; now: Date; threadIds: readonly string[] }): Promise<number> {
  const file = appCatalogFile(options.codexHome);
  if (options.threadIds.length === 0 || !(await stat(file).then(() => true, () => false))) return 0;
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    const before = count(db, options.threadIds);
    if (before === 0) return 0;
    const stamp = options.now.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '');
    const dir = path.join(options.backupsDir, `codex.db-${stamp}`);
    await mkdir(dir, { recursive: true });
    const copy = path.join(dir, 'codex.db');
    await rm(copy, { force: true });
    db.prepare('VACUUM INTO ?').run(copy);
    await pruneBackups(options.backupsDir);
    const marks = options.threadIds.map(() => '?').join(', ');
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const table of CATALOG_TABLES) {
        try {
          db.prepare(`DELETE FROM ${table} WHERE thread_id IN (${marks})`).run(...options.threadIds);
        } catch (error) {
          if (!/no such table/i.test(String(error))) throw error;
        }
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    const left = count(db, options.threadIds);
    if (left > 0) throw new Error(`в каталоге ChatGPT осталось записей: ${left}; копия: ${copy}`);
    return before;
  } finally {
    db.close();
  }
}
