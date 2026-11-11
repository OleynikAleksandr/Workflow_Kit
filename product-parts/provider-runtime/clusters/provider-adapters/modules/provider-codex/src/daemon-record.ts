// Which daemon Kit started and with which PATH (spec M17 2.3): a daemon outlives the service and
// keeps the environment of its start, so agents may not find wfk after an update of Kit.
import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from '#data-store';

/** File of the record in the state directory of Kit. */
export const DAEMON_RECORD_FILE = 'codex-daemon.json';

/** Note of a running daemon that Kit did not start with the current PATH. */
export const STALE_ENV_REASON = 'Демон Codex запущен с прежним окружением: агенты могут не находить wfk. Перезапустите демон, когда чаты ChatGPT не работают.';

/** Confirmation of the restart: turns that run now break off. */
export const STALE_ENV_CONFIRM = 'Перезапустить демон Codex (codex remote-control stop, затем start)? Ходы ChatGPT, которые идут сейчас, прервутся.';

export interface DaemonRecord {
  pid: number;
  /** PATH the daemon was started with. */
  path: string;
}

/** PATH of an environment; Windows spells the key "Path". */
export function pathOf(env: Readonly<Record<string, string | undefined>>): string {
  const key = Object.keys(env).find((name) => name.toUpperCase() === 'PATH');
  return key ? (env[key] ?? '') : '';
}

/** The record, or null when there is none or it is broken. */
export async function readDaemonRecord(stateDir: string): Promise<DaemonRecord | null> {
  const value = (await readJsonFile(path.join(stateDir, DAEMON_RECORD_FILE)).catch(() => undefined)) as Partial<DaemonRecord> | undefined;
  return value && typeof value.pid === 'number' && typeof value.path === 'string' ? { pid: value.pid, path: value.path } : null;
}

export async function writeDaemonRecord(stateDir: string, record: DaemonRecord): Promise<void> {
  await writeJsonAtomic(path.join(stateDir, DAEMON_RECORD_FILE), record);
}

/**
 * The running daemon is not the one Kit started with this PATH. No record — not stale: Kit does
 * not know the daemon and leaves it alone.
 */
export function staleDaemonEnv(record: DaemonRecord | null, pid: number | null, currentPath: string): boolean {
  return record !== null && pid !== null && (record.pid !== pid || record.path !== currentPath);
}
