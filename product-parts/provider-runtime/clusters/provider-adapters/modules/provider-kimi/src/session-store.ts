// What Kit keeps about Kimi sessions on disk (spec M8, section 2.4): the panel records and the
// sessions archived with a project in <state>/sessions/kimi.json, and the deletions that wait for
// the server in <state>/sessions/kimi-deletes.json. Writes are serialized.
import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from '#data-store';
import { providerSessionsFile } from '#provider-registry';
import type { ProviderContext } from '#provider-registry';

/** A session created from the panel. */
export interface KimiRecord {
  sessionId: string;
  projectId: string;
  projectPath: string;
  workspaceId: string;
  title: string;
  createdAt: string;
}

/**
 * A deletion of the sessions of a folder that is not finished: every session of the workspaces
 * of the folders created not later than `since`, and the known ids.
 */
export interface DeleteIntent {
  root: string;
  /** realpath of the folder when it differs from root (the folder is gone at a retry). */
  real?: string;
  since: string;
  sessionIds: string[];
}

/** A session id that is safe in a route. */
export const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** How long an unfinished deletion is tried again. */
export const DELETE_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

export interface KimiStore {
  records(): Promise<KimiRecord[]>;
  add(record: KimiRecord): Promise<void>;
  /** Changes the stored title of a session; nothing happens without its record. */
  retitle(sessionId: string, title: string): Promise<void>;
  /** Drops the records and archive lists of projects not in keep; resolves to the number of records dropped. */
  forget(keep: ReadonlySet<string>): Promise<number>;
  /** Sessions Kit archived in Kimi together with the project. */
  projectArchive(projectId: string): Promise<string[]>;
  setProjectArchive(projectId: string, ids: readonly string[]): Promise<void>;
  intents(): Promise<DeleteIntent[]>;
  saveIntents(list: readonly DeleteIntent[]): Promise<void>;
}

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

function asRecord(value: unknown): KimiRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const item = value as Record<string, unknown>;
  const { sessionId, projectId, projectPath, workspaceId, title, createdAt } = item;
  if (!isText(sessionId) || !SESSION_ID.test(sessionId) || !isText(projectId) || !isText(projectPath) || !isText(workspaceId) || !isText(createdAt)) return undefined;
  return { sessionId, projectId, projectPath, workspaceId, title: typeof title === 'string' ? title : '', createdAt };
}

function asIntent(value: unknown): DeleteIntent | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const item = value as Record<string, unknown>;
  if (!isText(item['root']) || !isText(item['since']) || Number.isNaN(Date.parse(item['since']))) return undefined;
  const ids = Array.isArray(item['sessionIds']) ? item['sessionIds'].filter((id): id is string => isText(id) && SESSION_ID.test(id)) : [];
  return { root: item['root'], ...(isText(item['real']) ? { real: item['real'] } : {}), since: item['since'], sessionIds: ids };
}

/** Creates the store over the state directory of the service. */
export function createKimiStore(context: Pick<ProviderContext, 'dirs'>): KimiStore {
  const file = providerSessionsFile(context.dirs, 'kimi');
  const deletesFile = path.join(path.dirname(file), 'kimi-deletes.json');
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = chain.then(task, task);
    chain = next.catch(() => undefined);
    return next;
  };

  const read = async (): Promise<{ sessions: KimiRecord[]; archives: Record<string, string[]> }> => {
    const data = await readJsonFile(file).catch(() => undefined);
    const root = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
    const sessions = (Array.isArray(root['sessions']) ? root['sessions'] : []).flatMap((item) => asRecord(item) ?? []);
    const archives: Record<string, string[]> = {};
    const stored = root['projectArchives'];
    if (typeof stored === 'object' && stored !== null && !Array.isArray(stored)) {
      for (const [projectId, ids] of Object.entries(stored)) {
        const list = Array.isArray(ids) ? ids.filter((id): id is string => isText(id) && SESSION_ID.test(id)) : [];
        if (list.length > 0) archives[projectId] = list;
      }
    }
    return { sessions, archives };
  };

  const write = (sessions: readonly KimiRecord[], archives: Record<string, string[]>): Promise<void> =>
    writeJsonAtomic(file, { version: 1, sessions, ...(Object.keys(archives).length > 0 ? { projectArchives: archives } : {}) });

  return {
    records: async () => (await read()).sessions,
    add: (record) =>
      serial(async () => {
        const { sessions, archives } = await read();
        await write([...sessions.filter((item) => item.sessionId !== record.sessionId), record], archives);
      }),
    retitle: (sessionId, title) =>
      serial(async () => {
        const { sessions, archives } = await read();
        if (!sessions.some((item) => item.sessionId === sessionId && item.title !== title)) return;
        await write(sessions.map((item) => (item.sessionId === sessionId ? { ...item, title } : item)), archives);
      }),
    forget: (keep) =>
      serial(async () => {
        const { sessions, archives } = await read();
        const kept = sessions.filter((item) => keep.has(item.projectId));
        const keptArchives = Object.fromEntries(Object.entries(archives).filter(([projectId]) => keep.has(projectId)));
        if (kept.length === sessions.length && Object.keys(keptArchives).length === Object.keys(archives).length) return 0;
        await write(kept, keptArchives);
        return sessions.length - kept.length;
      }),
    projectArchive: async (projectId) => (await read()).archives[projectId] ?? [],
    setProjectArchive: (projectId, ids) =>
      serial(async () => {
        const { sessions, archives } = await read();
        const { [projectId]: _old, ...rest } = archives;
        await write(sessions, ids.length > 0 ? { ...rest, [projectId]: [...new Set(ids)] } : rest);
      }),
    intents: async () => {
      const data = await readJsonFile(deletesFile).catch(() => undefined);
      const list = typeof data === 'object' && data !== null ? (data as Record<string, unknown>)['intents'] : undefined;
      return (Array.isArray(list) ? list : []).flatMap((item) => asIntent(item) ?? []);
    },
    saveIntents: (list) => serial(() => writeJsonAtomic(deletesFile, { version: 1, intents: list })),
  };
}
