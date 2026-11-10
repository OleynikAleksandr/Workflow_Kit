// The Kimi sessions of a project (protocol, section 9). One ownership rule serves the three
// sources: the folder of a session (the workspace on the server, projectPath of a panel record,
// cwd of the hook journal) is the project folder or lies inside it. The sources are merged by id:
// server > panel record > hook journal. Reading the list never starts the server.
import { hookSessionInfo, readHookSessions } from '#provider-registry';
import type { Project, SessionInfo, SessionLinks } from '#provider-registry';
import { kimiProjectLink, resumeNote } from './app-link.ts';
import { describeKimiError, shapeError } from './client.ts';
import type { KimiClient } from './client.ts';
import { liveSessionLocks } from './locks.ts';
import type { Liveness } from './locks.ts';
import { inFolder } from './paths.ts';
import type { KimiRuntime } from './provider.ts';
import type { KimiRecord, KimiStore } from './session-store.ts';
import { parseSessionPage, parseWorkspaces } from './shapes.ts';
import type { KimiListedSession } from './shapes.ts';
import { realFolder } from './workspace.ts';

/** Pages of one workspace and archive state read for the list; a deletion reads them all. */
export const LIST_PAGE_LIMIT = 20;
export const LIST_PAGE_SIZE = 100;
/** How long an answer of the server serves the list. */
export const LIST_CACHE_MS = 5000;
export const PARTIAL_NOTE = 'показаны не все сессии Kimi';
export const ARCHIVED_NOTE = 'в архиве Kimi';
export const WAITING_NOTE = 'Kimi ждёт ответа пользователя';
export const GONE_NOTE = 'сессии нет в Kimi';
export const SERVER_DOWN = 'сервер Kimi не запущен';
export const unavailableNote = (reason: string): string => `Kimi недоступен: ${reason}`;

/** Notes of sessions kept in memory: they are gone when the service restarts. */
export interface SessionNotes {
  /** archive: the archive of Kimi was not updated; delivery: why a message was refused, or a waiting question. */
  set(sessionId: string, kind: 'archive' | 'delivery', text: string | null): void;
  get(sessionId: string): string[];
}

export function createSessionNotes(): SessionNotes {
  const notes = new Map<string, { archive?: string; delivery?: string }>();
  return {
    set(sessionId, kind, text) {
      const entry = { ...notes.get(sessionId) };
      if (text === null) delete entry[kind];
      else entry[kind] = text;
      if (entry.archive === undefined && entry.delivery === undefined) notes.delete(sessionId);
      else notes.set(sessionId, entry);
    },
    get(sessionId) {
      const entry = notes.get(sessionId);
      return [entry?.archive, entry?.delivery].filter((item): item is string => item !== undefined);
    },
  };
}

/** The folder and its realpath (one item when they are the same). */
export async function folderRoots(folder: string): Promise<string[]> {
  const real = await realFolder(folder);
  return real === folder ? [folder] : [folder, real];
}

/** Name of a session Kimi gave no title: the id without its prefix. */
export const shortTitle = (sessionId: string): string => `Сессия ${sessionId.replace(/^session_/, '').slice(0, 8)}`;

/** Sessions the server lists; complete is false when the page limit cut the reading. */
export interface Enumeration {
  sessions: KimiListedSession[];
  complete: boolean;
}

/**
 * Every session, active and archived, of the workspaces whose root is one of the folders or lies
 * inside one (and of the named workspaces the server knows). Rejects when a request fails.
 */
export async function enumerateSessions(
  client: KimiClient,
  platform: NodeJS.Platform,
  roots: readonly string[],
  options: { workspaceIds?: readonly string[]; pageLimit?: number } = {},
): Promise<Enumeration> {
  const workspaces = parseWorkspaces(await client.get('/api/v1/workspaces'));
  const named = new Set(options.workspaceIds ?? []);
  const ids = workspaces.filter((item) => named.has(item.id) || roots.some((root) => inFolder(item.root, root, platform))).map((item) => item.id);
  const limit = options.pageLimit ?? LIST_PAGE_LIMIT;
  const sessions = new Map<string, KimiListedSession>();
  let complete = true;
  for (const workspaceId of [...new Set(ids)].sort()) {
    for (const archived of ['false', 'true']) {
      const tokens = new Set<string>();
      let token: string | null = null;
      for (let page = 0; ; page += 1) {
        if (page >= limit) {
          complete = false;
          break;
        }
        const query: string = `workspace.id=${encodeURIComponent(workspaceId)}&meta.archived=${archived}&page_size=${LIST_PAGE_SIZE}${token ? `&page_token=${encodeURIComponent(token)}` : ''}`;
        const answer = parseSessionPage(await client.get(`/api/v2/sessions?${query}`));
        for (const item of answer.items) sessions.set(item.id, item);
        if (answer.next === null) break;
        if (tokens.has(answer.next)) throw shapeError('sessions.next_page_token repeats');
        tokens.add(answer.next);
        token = answer.next;
      }
    }
  }
  return { sessions: [...sessions.values()], complete };
}

/**
 * Links of the sessions of a project (spec 2.6): the project in the Kimi Code app when the app is
 * found, the Remote Control address when it is on. resume: the app is missing, sessions carry resumeNote.
 */
export async function sessionLinks(rt: KimiRuntime, project: Project): Promise<{ links: SessionLinks; resume: boolean }> {
  const app = rt.appFound();
  const mobile = await rt.remote.mobile();
  return { links: { ...(app ? { desktop: kimiProjectLink(project.path) } : {}), ...(mobile ? { mobile } : {}) }, resume: app === false };
}

export interface KimiSessionList {
  list(project: Project): Promise<SessionInfo[]>;
  /** The panel records whose folder belongs to the project. */
  owned(project: Project): Promise<KimiRecord[]>;
  /** Forgets the cached answers of the server (a session was created, renamed, archived or deleted). */
  drop(): void;
}

export function createKimiSessionList(rt: KimiRuntime, store: KimiStore, liveness: Liveness, notes: SessionNotes, now: () => number = Date.now): KimiSessionList {
  const { platform } = rt.context;
  const cache = new Map<string, { at: number; value: Enumeration }>();

  const owned = async (project: Project, roots?: readonly string[]): Promise<KimiRecord[]> => {
    const folders = roots ?? (await folderRoots(project.path));
    return (await store.records()).filter((record) => folders.some((root) => inFolder(record.projectPath, root, platform)));
  };

  return {
    owned: (project) => owned(project),
    drop: () => cache.clear(),
    async list(project) {
      const roots = await folderRoots(project.path);
      const [journal, records, live] = await Promise.all([readHookSessions(project, 'kimi'), owned(project, roots), liveSessionLocks(rt.paths.locks, liveness)]);
      const alive = new Set(live);
      const state = (id: string): SessionInfo['state'] => (alive.has(id) ? 'running' : 'stopped');
      const byId = new Map<string, SessionInfo>();
      for (const session of journal) {
        if (session.cwd !== null && !roots.some((root) => inFolder(session.cwd as string, root, platform))) continue;
        byId.set(session.sessionId, hookSessionInfo('kimi', session, { title: shortTitle(session.sessionId), state: state(session.sessionId) }));
      }
      for (const record of records) {
        const model = byId.get(record.sessionId)?.model;
        byId.set(record.sessionId, {
          provider: 'kimi',
          localId: record.sessionId,
          title: record.title.trim() || shortTitle(record.sessionId),
          createdAt: record.createdAt,
          origin: 'panel',
          state: state(record.sessionId),
          links: {},
          cwd: record.projectPath,
          ...(model ? { model } : {}),
        });
      }

      let common: string | null = null;
      let fetched: { at: number; value: Enumeration } | null = null;
      const client = await rt.server.current();
      if (!client) {
        // A server that was never wanted is not missed: sessions of the journal carry no note.
        if (rt.server.used || records.length > 0) common = unavailableNote(SERVER_DOWN);
      } else {
        const cached = cache.get(project.path);
        if (cached && now() - cached.at < LIST_CACHE_MS) fetched = cached;
        else {
          try {
            fetched = { at: now(), value: await enumerateSessions(client, platform, roots, { workspaceIds: records.map((record) => record.workspaceId) }) };
            cache.set(project.path, fetched);
          } catch (error) {
            common = unavailableNote(describeKimiError(error, rt.program().version));
          }
        }
      }

      const flags = new Map<string, string[]>();
      const panel = new Set(records.map((record) => record.sessionId));
      for (const session of fetched?.value.sessions ?? []) {
        const known = byId.get(session.id);
        const info: SessionInfo = {
          provider: 'kimi',
          localId: session.id,
          title: session.title.trim() || known?.title || shortTitle(session.id),
          createdAt: session.createdAt,
          origin: panel.has(session.id) ? 'panel' : 'hook',
          state: state(session.id),
          links: {},
        };
        const cwd = session.cwd ?? known?.cwd;
        const model = session.model ?? known?.model;
        if (cwd) info.cwd = cwd;
        if (model) info.model = model;
        byId.set(session.id, info);
        flags.set(session.id, [...(session.archived ? [ARCHIVED_NOTE] : []), ...(session.status === 'approval' || session.status === 'question' ? [WAITING_NOTE] : [])]);
      }

      const links = await sessionLinks(rt, project);
      const result = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      for (const info of result) {
        info.links = { ...links.links };
        const restart = rt.appRestart();
        const parts = [...(common ? [common] : []), ...(restart ? [restart] : []), ...(fetched && !fetched.value.complete ? [PARTIAL_NOTE] : []), ...(flags.get(info.localId) ?? [])];
        // A session the complete list of the server does not have (a newer one may not be in the cached answer yet).
        if (fetched?.value.complete && !flags.has(info.localId) && Date.parse(info.createdAt) < fetched.at) parts.push(GONE_NOTE);
        for (const note of notes.get(info.localId)) if (!parts.includes(note)) parts.push(note);
        if (links.resume) parts.push(resumeNote(info.localId));
        if (parts.length > 0) info.note = parts.join('; ');
      }
      return result;
    },
  };
}
