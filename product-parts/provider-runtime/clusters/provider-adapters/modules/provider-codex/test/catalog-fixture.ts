// A ChatGPT app catalog for the tests of the thread deletion (spec M3-autostart section 9).
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

/** A ChatGPT app catalog (<CODEX_HOME>/sqlite/codex.db) with one row per thread in each table. */
export async function appCatalog(codexHome: string, threads: readonly string[]): Promise<{ rows(): string[] }> {
  const { DatabaseSync } = await import('node:sqlite');
  const file = path.join(codexHome, 'sqlite', 'codex.db');
  await mkdir(path.dirname(file), { recursive: true });
  await rm(file, { force: true });
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE local_thread_catalog (host_id TEXT, thread_id TEXT, display_title TEXT); CREATE TABLE local_thread_catalog_scan_entries (host_id TEXT, thread_id TEXT, removed INTEGER); CREATE TABLE thread_timeline_ledger (host_id TEXT, thread_id TEXT, sequence INTEGER)');
  for (const id of threads) {
    db.prepare("INSERT INTO local_thread_catalog VALUES ('local', ?, 't')").run(id);
    db.prepare("INSERT INTO local_thread_catalog_scan_entries VALUES ('local', ?, 0)").run(id);
    db.prepare("INSERT INTO thread_timeline_ledger VALUES ('local', ?, 1)").run(id);
  }
  db.prepare("INSERT INTO local_thread_catalog VALUES ('local', 'other-thread', 'kept')").run();
  db.close();
  return {
    rows() {
      const read = new DatabaseSync(file, { readOnly: true });
      try {
        const all = (read.prepare("SELECT thread_id AS id FROM local_thread_catalog WHERE thread_id <> 'other-thread' UNION SELECT thread_id FROM local_thread_catalog_scan_entries UNION SELECT thread_id FROM thread_timeline_ledger").all() as Array<{ id: string }>).map((r) => r.id);
        return [...new Set(all)].sort();
      } finally {
        read.close();
      }
    },
  };
}
