// Panel records of the Claude provider: <state>/sessions/claude.json (spec section 6, D9). A
// record links a Remote Control session or a folder environment to its supervisor record
// (processes.json: pid, start time, command line, boot id); liveness always comes from there.
import { stat } from 'node:fs/promises';
import { createKeyedMutex, readJsonFile, writeJsonAtomic } from '#data-store';

/** A session started or resumed from the panel. */
export interface SessionRecord {
  /** Local session id (transcript name); null until the hook journal names it. */
  localId: string | null;
  /** session_<X>: the Remote Control id behind the links. */
  remoteId: string;
  title: string;
  projectId: string;
  projectPath: string;
  /** panel: created by "Создать сессию"; hook: a journal session resumed from the panel. */
  origin: 'panel' | 'hook';
  createdAt: string;
  /** Start of the current (or last) process. */
  startedAt: string;
  /** Supervisor record id of the expect process; null after a stop. */
  processId: string | null;
  claudePid: number | null;
  logFile: string;
  debugFile: string;
  controlHostId?: string;
  stoppedAt: string | null;
  /**
   * Put into the archive in Workflow Kit with its project or alone: the process was stopped and
   * nothing brings it back until a restore. Missing in records of earlier versions.
   */
  archived?: 'project' | 'session' | null;
}

/** The Remote Control environment of a project folder (one per project). */
export interface EnvironmentRecord {
  projectId: string;
  projectPath: string;
  name: string;
  /** Supervisor record id; null after a stop. */
  processId: string | null;
  claudePid: number | null;
  /** Id from "environment=<id>" on the screen, when claude printed one. */
  environmentId: string | null;
  startedAt: string;
  stoppedAt: string | null;
  logFile: string;
  debugFile: string;
  controlHostId?: string;
}

/** Contents of sessions/claude.json. */
export interface ClaudeRecords {
  version: 1;
  sessions: SessionRecord[];
  environments: EnvironmentRecord[];
}

/** Stopped session records kept in the file. */
export const STOPPED_SESSIONS_KEPT = 200;

/** Store of the records; reads are cached by mtime and size, writes are atomic and serialized. */
export interface RecordStore {
  readonly file: string;
  read(): Promise<ClaudeRecords>;
  update<T>(change: (records: ClaudeRecords) => T | Promise<T>): Promise<T>;
}

function emptyRecords(): ClaudeRecords {
  return { version: 1, sessions: [], environments: [] };
}

function normalize(value: unknown): ClaudeRecords {
  if (typeof value !== 'object' || value === null) return emptyRecords();
  const data = value as Partial<ClaudeRecords>;
  return {
    version: 1,
    sessions: Array.isArray(data.sessions) ? data.sessions.filter((s) => typeof s?.remoteId === 'string') : [],
    environments: Array.isArray(data.environments) ? data.environments.filter((e) => typeof e?.projectId === 'string') : [],
  };
}

function prune(records: ClaudeRecords): void {
  const stopped = records.sessions.filter((s) => s.processId === null);
  if (stopped.length <= STOPPED_SESSIONS_KEPT) return;
  const drop = new Set(stopped.sort((a, b) => a.startedAt.localeCompare(b.startedAt)).slice(0, stopped.length - STOPPED_SESSIONS_KEPT));
  records.sessions = records.sessions.filter((s) => !drop.has(s));
}

/**
 * Drops the session and environment records of projects not in keep (a removed project takes its
 * records with it). Resolves to the number of records dropped; the file is written only on change.
 */
export async function forgetProjects(store: RecordStore, keep: ReadonlySet<string>): Promise<number> {
  const current = await store.read();
  const stale = current.sessions.filter((s) => !keep.has(s.projectId)).length + current.environments.filter((e) => !keep.has(e.projectId)).length;
  if (stale === 0) return 0;
  return store.update((records) => {
    const before = records.sessions.length + records.environments.length;
    records.sessions = records.sessions.filter((s) => keep.has(s.projectId));
    records.environments = records.environments.filter((e) => keep.has(e.projectId));
    return before - records.sessions.length - records.environments.length;
  });
}

/** Creates the store over file (providerSessionsFile(dirs, 'claude')). */
export function createRecordStore(file: string): RecordStore {
  const lock = createKeyedMutex();
  let cached: { mtimeMs: number; size: number; records: ClaudeRecords } | undefined;

  async function load(): Promise<ClaudeRecords> {
    let info;
    try {
      info = await stat(file);
    } catch {
      return emptyRecords();
    }
    if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return structuredClone(cached.records);
    const records = normalize(await readJsonFile(file));
    cached = { mtimeMs: info.mtimeMs, size: info.size, records };
    return structuredClone(records);
  }

  return {
    file,
    read: load,
    update: (change) =>
      lock.run('file', async () => {
        const records = await load();
        const result = await change(records);
        prune(records);
        await writeJsonAtomic(file, records);
        cached = undefined;
        return result;
      }),
  };
}
