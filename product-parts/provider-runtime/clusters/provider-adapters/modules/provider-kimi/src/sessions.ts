// Kimi sessions of a project (spec M8, sections 2.4 and 2.5): creation, the name, the archive
// mirrored to Kimi, the deletion with its retries and the turn state. The list is in
// session-list.ts, the last answer and the delivery of a message in messages.ts.
import { ProviderError, readHookSessions } from '#provider-registry';
import type { Project, RenameResult, SessionInfo } from '#provider-registry';
import { KIMI_CODES, KimiError, describeKimiError, shapeError } from './client.ts';
import type { KimiClient } from './client.ts';
import { defaultLiveness, liveSessionLocks } from './locks.ts';
import type { Liveness } from './locks.ts';
import { createKimiMessages } from './messages.ts';
import type { KimiMessageDeps } from './messages.ts';
import { inFolder } from './paths.ts';
import type { KimiRuntime } from './provider.ts';
import { resumeNote } from './app-link.ts';
import { createKimiSessionList, createSessionNotes, enumerateSessions, folderRoots, sessionLinks } from './session-list.ts';
import { DELETE_KEEP_MS, SESSION_ID, createKimiStore } from './session-store.ts';
import type { DeleteIntent } from './session-store.ts';
import { parseBatch, parseSession } from './shapes.ts';

export const ARCHIVE_STALE_NOTE = 'архив Kimi не обновлён';
export const FOREIGN_RENAME_NOTE = 'сессию держит другой сервер Kimi: имя будет передано позже';
/** Ids of one POST /api/v2/sessions:archive | :restore. */
export const BATCH_SIZE = 100;

/** The session methods of the provider. */
export interface KimiSessions {
  listSessions(project: Project): Promise<SessionInfo[]>;
  createSession(project: Project, opts: { title: string; firstMessage?: string; detached?: boolean }): Promise<SessionInfo>;
  renameSession(project: Project, sessionId: string, name: string): Promise<RenameResult>;
  sessionIdle(project: Project, sessionId: string): Promise<boolean>;
  lastAnswer(project: Project, sessionId: string): Promise<string | null>;
  sendMessage(project: Project, sessionId: string, text: string, delivery: { id: string }): Promise<boolean>;
  forgetProjects(keep: ReadonlySet<string>): Promise<number>;
  deleteSessions(project: Project): Promise<string[]>;
  retryDeletes(): Promise<string[]>;
  archiveSessions(project: Project, sessionId: string | null): Promise<string[]>;
  restoreSessions(project: Project, sessionId: string | null): Promise<string[]>;
}

/** Replacements for tests. */
export interface KimiSessionDeps extends KimiMessageDeps {
  liveness?: Liveness;
}

export function createKimiSessions(rt: KimiRuntime, deps: KimiSessionDeps = {}): KimiSessions {
  const { context } = rt;
  const { platform } = context;
  const liveness = deps.liveness ?? defaultLiveness();
  const store = createKimiStore(context);
  const notes = createSessionNotes();
  const list = createKimiSessionList(rt, store, liveness, notes, () => context.now().getTime());
  const messages = createKimiMessages(rt, notes, deps);
  const describe = (error: unknown): string => describeKimiError(error, rt.program().version);
  const report = (type: string, line: string, fields: Record<string, unknown>): void => {
    context.log(`kimi: ${line}`);
    void context.events.append(type, fields).catch(() => undefined);
  };

  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = chain.then(task, task);
    chain = next.catch(() => undefined);
    return next;
  };

  /** Archives or restores the sessions; a session Kimi does not have any more counts as done. */
  const batch = async (client: KimiClient, action: 'archive' | 'restore', ids: readonly string[]): Promise<{ done: string[]; refused: Map<string, string> }> => {
    const done: string[] = [];
    const refused = new Map<string, string>();
    for (let start = 0; start < ids.length; start += BATCH_SIZE) {
      const chunk = ids.slice(start, start + BATCH_SIZE);
      const results = new Map(parseBatch(await client.post(`/api/v2/sessions:${action}`, { ids: chunk })).map((item) => [item.id, item]));
      for (const id of chunk) {
        const result = results.get(id);
        if (result?.ok || result?.code === KIMI_CODES.noSession) done.push(id);
        else refused.set(id, result ? `Kimi: ${result.message ?? 'отказ'} (код ${result.code ?? '?'})` : 'Kimi не ответил про сессию');
      }
    }
    return { done, refused };
  };

  /** Mirrors the archive mark of one session; a refusal leaves a note and never rejects. */
  const mirrorOne = async (project: Project, sessionId: string, action: 'archive' | 'restore'): Promise<string[]> => {
    try {
      if (!SESSION_ID.test(sessionId)) throw new Error('неверный id сессии');
      const { refused } = await batch(await rt.requireServer(), action, [sessionId]);
      const reason = refused.get(sessionId);
      if (reason !== undefined) throw new Error(reason);
      notes.set(sessionId, 'archive', null);
    } catch (error) {
      notes.set(sessionId, 'archive', ARCHIVE_STALE_NOTE);
      report('kimi.archive.failed', `${action} of ${sessionId} was not mirrored: ${describe(error)}`, { project: project.id, sessionId, action, reason: describe(error) });
    }
    list.drop();
    return [];
  };

  /** Archive of the project: every session of its folder that is not archived in Kimi yet; Kit remembers which. */
  const archiveProject = async (project: Project): Promise<string[]> => {
    if (rt.program().installed !== true) return [];
    const records = await list.owned(project);
    // A server nobody needed is not started for a project without Kimi sessions.
    if (!(await rt.server.current()) && records.length === 0 && (await readHookSessions(project, 'kimi')).length === 0) return [];
    try {
      const client = await rt.requireServer();
      const found = await enumerateSessions(client, platform, await folderRoots(project.path), { workspaceIds: records.map((record) => record.workspaceId), pageLimit: Number.POSITIVE_INFINITY });
      const { done, refused } = await batch(client, 'archive', found.sessions.filter((session) => !session.archived).map((session) => session.id));
      if (done.length > 0) await store.setProjectArchive(project.id, [...(await store.projectArchive(project.id)), ...done]);
      for (const id of done) notes.set(id, 'archive', null);
      for (const id of refused.keys()) notes.set(id, 'archive', ARCHIVE_STALE_NOTE);
      if (refused.size > 0) report('kimi.archive.failed', `${refused.size} session(s) of ${project.id} were not archived in Kimi`, { project: project.id, action: 'archive', sessionIds: [...refused.keys()] });
    } catch (error) {
      for (const record of records) notes.set(record.sessionId, 'archive', ARCHIVE_STALE_NOTE);
      report('kimi.archive.failed', `the sessions of ${project.id} were not archived in Kimi: ${describe(error)}`, { project: project.id, action: 'archive', reason: describe(error) });
    }
    list.drop();
    return [];
  };

  /** Restore of the project: only the sessions Kit archived with it. */
  const restoreProject = async (project: Project): Promise<string[]> => {
    const ids = await store.projectArchive(project.id);
    if (ids.length === 0) return [];
    try {
      const { done, refused } = await batch(await rt.requireServer(), 'restore', ids);
      await store.setProjectArchive(project.id, [...refused.keys()]);
      for (const id of done) notes.set(id, 'archive', null);
      for (const id of refused.keys()) notes.set(id, 'archive', ARCHIVE_STALE_NOTE);
      if (refused.size > 0) report('kimi.archive.failed', `${refused.size} session(s) of ${project.id} were not restored in Kimi`, { project: project.id, action: 'restore', sessionIds: [...refused.keys()] });
    } catch (error) {
      for (const id of ids) notes.set(id, 'archive', ARCHIVE_STALE_NOTE);
      report('kimi.archive.failed', `the sessions of ${project.id} were not restored in Kimi: ${describe(error)}`, { project: project.id, action: 'restore', reason: describe(error) });
    }
    list.drop();
    return [];
  };

  /**
   * Deletes what the intent names: every session of the workspaces of its folders created not
   * later than `since`, and the known ids. left is null after a complete enumeration without a
   * refusal; otherwise the known ids that still wait.
   */
  const purge = async (client: KimiClient, intent: DeleteIntent): Promise<{ deleted: string[]; left: string[] | null }> => {
    const targets = new Set(intent.sessionIds);
    let complete = true;
    try {
      const found = await enumerateSessions(client, platform, intent.real ? [intent.root, intent.real] : [intent.root], { pageLimit: Number.POSITIVE_INFINITY });
      for (const session of found.sessions) if (Date.parse(session.createdAt) <= Date.parse(intent.since)) targets.add(session.id);
    } catch (error) {
      complete = false;
      context.log(`kimi: the sessions of ${intent.root} were not listed for deletion: ${describe(error)}`);
    }
    const deleted: string[] = [];
    const left: string[] = [];
    for (const id of targets) {
      try {
        await client.post(`/api/v1/sessions/${id}:delete`, {});
        deleted.push(id);
      } catch (error) {
        if (error instanceof KimiError && error.code === KIMI_CODES.noSession) continue;
        complete = false;
        if (intent.sessionIds.includes(id)) left.push(id);
        context.log(`kimi: session ${id} of ${intent.root} waits for deletion: ${describe(error)}`);
      }
    }
    if (deleted.length > 0) context.log(`kimi: deleted ${deleted.length} session(s) of ${intent.root}`);
    return { deleted, left: complete ? null : left };
  };

  return {
    listSessions: (project) => list.list(project),
    lastAnswer: (project, sessionId) => messages.lastAnswer(project, sessionId),
    sendMessage: (project, sessionId, text, delivery) => messages.sendMessage(project, sessionId, text, delivery),
    forgetProjects: (keep) => store.forget(keep),
    sessionIdle: async (_project, sessionId) => !(await liveSessionLocks(rt.paths.locks, liveness)).includes(sessionId),
    archiveSessions: (project, sessionId) => (sessionId === null ? archiveProject(project) : mirrorOne(project, sessionId, 'archive')),
    restoreSessions: (project, sessionId) => (sessionId === null ? restoreProject(project) : mirrorOne(project, sessionId, 'restore')),

    async createSession(project, opts) {
      const client = await rt.requireReady();
      let session;
      try {
        const workspace = await rt.workspaces.ensure(client, project.path);
        session = parseSession(await client.post('/api/v1/sessions', { workspace_id: workspace.id, title: opts.title, metadata: { cwd: workspace.root } }));
        if (!SESSION_ID.test(session.id)) throw shapeError('session.id');
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError('kimi-session', `Kimi не создал сессию: ${describe(error)}`, { hint: 'Нажмите «Перепроверить» и повторите.' });
      }
      const title = opts.title.trim() || session.title;
      await store.add({ sessionId: session.id, projectId: project.id, projectPath: project.path, workspaceId: session.workspaceId, title, createdAt: session.createdAt });
      list.drop();
      // A first message Kimi refuses does not undo the session: it stays in the list with a note.
      const started = opts.firstMessage ? await messages.sendMessage(project, session.id, opts.firstMessage, { id: `first-${session.id}` }) : false;
      const { links, resume } = await sessionLinks(rt, project);
      const info: SessionInfo = { provider: 'kimi', localId: session.id, title, createdAt: session.createdAt, origin: 'panel', state: started ? 'running' : 'stopped', links, cwd: project.path };
      const note = [...notes.get(session.id), ...(resume ? [resumeNote(session.id)] : [])].join('; ');
      if (note) info.note = note;
      return info;
    },

    async renameSession(_project, sessionId, name) {
      try {
        if (!SESSION_ID.test(sessionId)) throw new Error('неверный id сессии');
        const client = await rt.requireServer();
        await client.post(`/api/v1/sessions/${sessionId}/profile`, { title: name });
      } catch (error) {
        const foreign = error instanceof KimiError && error.code === KIMI_CODES.foreignSession;
        return { synced: false, note: foreign ? FOREIGN_RENAME_NOTE : `имя не передано в Kimi: ${describe(error)}` };
      }
      await store.retitle(sessionId, name);
      list.drop();
      return { synced: true };
    },

    deleteSessions: (project) =>
      serial(async () => {
        const since = context.now().toISOString();
        const roots = await folderRoots(project.path);
        const known = new Set((await list.owned(project)).map((record) => record.sessionId));
        for (const session of await readHookSessions(project, 'kimi').catch(() => [])) {
          if (SESSION_ID.test(session.sessionId) && (session.cwd === null || roots.some((root) => inFolder(session.cwd as string, root, platform)))) known.add(session.sessionId);
        }
        const [root, real] = roots;
        const intent: DeleteIntent = { root: root ?? project.path, ...(real ? { real } : {}), since, sessionIds: [...known] };
        let result: { deleted: string[]; left: string[] | null };
        try {
          result = await purge(await rt.requireServer(), intent);
        } catch (error) {
          // Without the program there is nothing Kit could delete, now or later.
          if (error instanceof ProviderError && error.code !== 'kimi-server') return [];
          context.log(`kimi: the sessions of ${intent.root} wait for deletion: ${describe(error)}`);
          result = { deleted: [], left: intent.sessionIds };
        }
        if (result.left !== null) {
          const waiting = await store.intents();
          const earlier = waiting.filter((item) => item.root === intent.root).flatMap((item) => item.sessionIds);
          await store.saveIntents([...waiting.filter((item) => item.root !== intent.root), { ...intent, sessionIds: [...new Set([...earlier, ...result.left])] }]);
        }
        list.drop();
        return result.deleted;
      }),

    retryDeletes: () =>
      serial(async () => {
        const waiting = await store.intents();
        if (waiting.length === 0) return [];
        const now = context.now().getTime();
        const live = waiting.filter((item) => now - Date.parse(item.since) <= DELETE_KEEP_MS);
        for (const item of waiting.filter((entry) => !live.includes(entry))) context.log(`kimi: the sessions of ${item.root} were not deleted in 7 days; no more attempts`);
        const deleted: string[] = [];
        const rest: DeleteIntent[] = [];
        let client: KimiClient | null = null;
        try {
          if (live.length > 0) client = await rt.requireServer();
        } catch (error) {
          context.log(`kimi: deletions wait: ${describe(error)}`);
        }
        for (const item of live) {
          const result = client ? await purge(client, item) : { deleted: [], left: item.sessionIds };
          deleted.push(...result.deleted);
          if (result.left !== null) rest.push({ ...item, sessionIds: result.left });
        }
        if (JSON.stringify(rest) !== JSON.stringify(waiting)) await store.saveIntents(rest);
        if (deleted.length > 0) list.drop();
        return deleted;
      }),
  };
}
