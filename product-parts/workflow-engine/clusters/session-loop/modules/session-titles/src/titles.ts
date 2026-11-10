// Session names (spec section 11): manual name → the agent's topic (`wfk session title`) → the
// plan objective (owner session) → the provider's own name → «Новая сессия». Names live in the
// project folder next to the review toggle, .workflow-kit/local/sessions/<client>.<id>.json
// (fields title, topic, synced); the provider gives the name to its app (renameSession), a
// provider with promptTitle also through the UserPromptSubmit hook answer (sessionTitle).
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { createKeyedMutex, readJsonFile, writeJsonAtomic } from '#data-store';

export const SESSIONS_DIR = '.workflow-kit/local/sessions';
export const DEFAULT_NAME = 'Новая сессия';
export const MAX_TITLE_LENGTH = 80;
/** Note of a promptTitle session whose name waits for the end of the turn or the next prompt hook. */
export const NEXT_TURN_NOTE = 'Имя уйдёт в приложение, когда агент закончит ход или со следующим сообщением';
/** How `wfk session title|plan` names the session itself. */
export const SESSION_FLAGS_HINT = 'повторите команду с --client <id> --session <id>';
const MAX_CANDIDATES = 20;

export type TitleSource = 'manual' | 'agent' | 'scope' | 'provider' | 'default';

export interface SessionTitle {
  name: string;
  source: TitleSource;
  manual: string | null;
  topic: string | null;
  /** True when the provider app shows the same name; false when it is only in Workflow Kit. */
  synced: boolean | null;
  note: string | null;
  /** When the session was put into the archive (hidden in the tree); null when it is not. */
  archivedAt: string | null;
  /** When the session was removed from Workflow Kit's lists for good (the chat stays in the app). */
  forgottenAt: string | null;
}

/** A refused title change. */
export class TitleError extends Error {
  readonly code: 'bad-title' | 'bad-session' | 'project-not-found' | 'session-ambiguous' | 'already-set' | 'service-turn';
  readonly status: number;
  /** Extra fields of the HTTP error, e.g. { candidates } of session-ambiguous. */
  readonly details: Record<string, unknown> | undefined;
  constructor(code: TitleError['code'], message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'TitleError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** A session `wfk session title|plan` may have meant (session-ambiguous). */
export interface SessionCandidate {
  client: string;
  session: string;
  state: string;
  name: string;
}

/** A session the titles module can see in the channel. */
export interface ActiveSession {
  key: string;
  projectId: string | null;
  state: string;
}

export interface SessionTitlesOptions {
  listProjects: () => Promise<Array<{ id: string; path: string }>>;
  /** Project of a folder (cwd or $CLAUDE_PROJECT_DIR of `wfk session title`). */
  resolveProject: (folder: string) => Promise<{ id: string } | undefined>;
  /** Sessions of the agent channel with their activity. */
  sessions: () => ActiveSession[];
  /** Plan objective and owner session id of a project, when a scope is active. */
  scope: (projectId: string) => { objective: string; ownerSession: string | null } | null;
  /**
   * Keys of the sessions the providers list for a project. When several turns run in the
   * project, the topic goes to the one that is a listed session (hidden helper threads of the
   * apps also send hooks but are never listed).
   */
  listed?: (projectId: string) => Promise<ReadonlySet<string>>;
  /**
   * Keys of the sessions the providers list for a project with state running (a Kimi turn is
   * seen by its session lock even when no hook reached the service, spec M9 2.3).
   */
  listedRunning?: (projectId: string) => Promise<ReadonlySet<string>>;
  /**
   * The provider's app takes a name from the prompt hook answer, and a rename is safe only
   * outside a turn (Provider.promptTitle). Default: no provider does.
   */
  promptTitle?: (client: string) => boolean;
  /** Gives the name to the provider app; resolves { synced, note }. */
  rename?: (projectId: string, key: string, name: string) => Promise<{ synced: boolean; note?: string }>;
  /**
   * Called after a session went into the archive or came back (the service stops it or brings it
   * back); a failure is logged and does not undo the archive state.
   */
  archived?: (projectId: string, key: string, archived: boolean) => Promise<void>;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface SessionTitles {
  load(): Promise<void>;
  /** Manual name from the panel; an empty name removes it. */
  setManual(projectId: string, key: string, name: string): Promise<SessionTitle>;
  /** Puts the session into the archive or returns it; options.archived acts on the provider session. */
  setArchived(projectId: string, key: string, archived: boolean): Promise<SessionTitle>;
  /** Removes the session from every list of Workflow Kit for good (the chat stays in the app). */
  setForgotten(projectId: string, key: string): Promise<SessionTitle>;
  /**
   * `wfk session title`: the topic of the calling session (`session`: from the provider's
   * environment variable or --client/--session), else of the only session whose turn is running
   * in the folder's project (session-ambiguous with the candidates otherwise).
   */
  setTopic(folder: string, title: string, session?: { client: string; id: string } | null): Promise<{ projectId: string; key: string; title: SessionTitle }>;
  /**
   * Key of the only session of the project with a running turn (by the channel; never guessed by
   * time). None or several → TitleError session-ambiguous (409) with details.candidates.
   */
  running(projectId: string): Promise<string>;
  /** Name of a session (providerTitle: the provider's own name, if any). */
  name(projectId: string, key: string, providerTitle?: string | null): SessionTitle;
  /** A turn of the session started: retries a provider rename that had to wait. */
  onTurn(key: string): void;
  /** The turn of the session ended (no turn, no dialog): retries a waiting rename; resolves after it. */
  onStop(key: string): Promise<void>;
  /**
   * A turn started with the panel's service greeting (`service`: true) or with anything else:
   * no topic is taken during a service turn, it is not the user's task yet.
   */
  setServiceTurn(key: string, service: boolean): void;
  /**
   * Prompt hook of a promptTitle session: the Workflow Kit name to give the app (once per name and
   * service run) when it differs from `current`, the app's title; null otherwise. A matching
   * title marks the name synced.
   */
  appTitle(key: string, current: string | null): Promise<string | null>;
  section(): { projects: Record<string, Record<string, SessionTitle>> };
}

interface Stored {
  title: string | null;
  topic: string | null;
  synced: boolean | null;
  note: string | null;
  archivedAt: string | null;
  forgottenAt: string | null;
}

const KEY = /^([a-z][a-z0-9-]{0,31}):([A-Za-z0-9._-]{1,200})$/;
const FILE = /^([a-z][a-z0-9-]{0,31})\.([A-Za-z0-9._-]{1,200})\.json$/;
const clientOf = (key: string): string => key.slice(0, Math.max(0, key.indexOf(':')));

export function titleFileName(key: string): string | null {
  const match = KEY.exec(key);
  return match ? `${match[1]}.${match[2]}.json` : null;
}

/** Trims and checks a title: one line, 1..80 characters. */
export function cleanTitle(value: unknown): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (text.length > MAX_TITLE_LENGTH) throw new TitleError('bad-title', `Имя длиннее ${MAX_TITLE_LENGTH} знаков`, 400);
  return text;
}

export function createSessionTitles(options: SessionTitlesOptions): SessionTitles {
  const log = options.log ?? (() => undefined);
  const stored = new Map<string, Map<string, Stored>>();
  const pending = new Map<string, { projectId: string; name: string }>();
  // promptTitle session key -> the name already sent through the prompt hook in this service run.
  const sentToApp = new Map<string, string>();
  // Sessions whose current turn is the panel's service greeting.
  const serviceTurns = new Set<string>();

  const projectMap = (projectId: string): Map<string, Stored> => {
    let map = stored.get(projectId);
    if (!map) {
      map = new Map();
      stored.set(projectId, map);
    }
    return map;
  };

  async function folderOf(projectId: string): Promise<string> {
    const project = (await options.listProjects()).find((p) => p.id === projectId);
    if (!project) throw new TitleError('project-not-found', 'Проект не найден', 404);
    return project.path;
  }

  // Saves of one session file run one after another (a background rename and a hook may overlap).
  const files = createKeyedMutex();
  function save(projectId: string, key: string, patch: Partial<Stored>): Promise<Stored> {
    return files.run(`${projectId}\u0000${key}`, () => saveNow(projectId, key, patch));
  }

  async function saveNow(projectId: string, key: string, patch: Partial<Stored>): Promise<Stored> {
    const file = titleFileName(key);
    if (!file) throw new TitleError('bad-session', 'Неверный ключ сессии', 400);
    const target = path.join(await folderOf(projectId), SESSIONS_DIR, file);
    const current = ((await readJsonFile(target).catch(() => undefined)) ?? {}) as Record<string, unknown>;
    const map = projectMap(projectId);
    const next: Stored = { title: null, topic: null, synced: null, note: null, archivedAt: null, forgottenAt: null, ...map.get(key), ...patch };
    const fields = { title: next.title, topic: next.topic, synced: next.synced, archivedAt: next.archivedAt, forgottenAt: next.forgottenAt };
    await writeJsonAtomic(target, { ...current, ...fields }, { mode: 0o600, dirMode: 0o700 });
    map.set(key, next);
    return next;
  }

  function resolve(projectId: string, key: string, providerTitle?: string | null): SessionTitle {
    const entry = stored.get(projectId)?.get(key);
    const manual = entry?.title ?? null;
    const topic = entry?.topic ?? null;
    const base = { manual, topic, synced: entry?.synced ?? null, note: entry?.note ?? null, archivedAt: entry?.archivedAt ?? null, forgottenAt: entry?.forgottenAt ?? null };
    if (manual) return { name: manual, source: 'manual', ...base };
    if (topic) return { name: topic, source: 'agent', ...base };
    const scope = options.scope(projectId);
    if (scope && scope.ownerSession && key.endsWith(`:${scope.ownerSession}`)) return { name: scope.objective, source: 'scope', ...base };
    if (providerTitle) return { name: providerTitle, source: 'provider', ...base };
    return { name: DEFAULT_NAME, source: 'default', ...base };
  }

  /**
   * Gives a manual name or topic to the provider app. A promptTitle session (Claude) is renamed
   * by typing /rename into its terminal, which is safe only outside a turn (a permission dialog
   * could take the keys): during a turn the name waits for the Stop hook (`idle`: called from it).
   */
  async function sync(projectId: string, key: string, idle = false): Promise<void> {
    const title = resolve(projectId, key);
    if (title.source !== 'manual' && title.source !== 'agent') return;
    if (options.promptTitle?.(clientOf(key))) {
      const inTurn = !idle && options.sessions().some((s) => s.key === key && s.state === 'working');
      if (!options.rename || inTurn) {
        if (options.rename) pending.set(key, { projectId, name: title.name });
        await save(projectId, key, { synced: false, note: NEXT_TURN_NOTE }).catch((error: unknown) => log(`titles: save ${key} failed: ${String(error)}`));
        return;
      }
    }
    if (!options.rename) return;
    try {
      const result = await options.rename(projectId, key, title.name);
      // The prompt hook may have confirmed the same name meanwhile: a late refusal does not undo it.
      const now = resolve(projectId, key);
      if (!result.synced && now.synced === true && now.name === title.name) {
        pending.delete(key);
        return;
      }
      await save(projectId, key, { synced: result.synced, note: result.note ?? null });
      if (result.synced) pending.delete(key);
      else pending.set(key, { projectId, name: title.name });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await save(projectId, key, { synced: false, note: message }).catch(() => undefined);
      pending.set(key, { projectId, name: title.name });
      log(`titles: rename ${key} failed: ${message}`);
    }
  }

  /** The only session of the project with a running turn; hidden helper threads are skipped. */
  async function runningKey(projectId: string): Promise<string> {
    const all = options.sessions().filter((s) => s.projectId === projectId);
    const listed = options.listed ? await options.listed(projectId).catch(() => null) : null;
    // Hidden helper threads of the apps send hooks too: listed sessions win when there are any.
    const known = (list: ActiveSession[]): ActiveSession[] => {
      const found = listed ? list.filter((s) => listed.has(s.key)) : [];
      return found.length > 0 ? found : list;
    };
    let running = all.filter((s) => s.state === 'working');
    if (running.length > 1) running = known(running);
    if (running.length === 1) return running[0]!.key;
    // No turn in the channel (no hook came): the turns the providers see themselves.
    if (running.length === 0 && options.listedRunning) {
      const busy = [...((await options.listedRunning(projectId).catch(() => null)) ?? [])];
      if (busy.length === 1) return busy[0]!;
      if (busy.length > 1) running = busy.map((key) => ({ key, projectId, state: 'working' }));
    }
    const candidates: SessionCandidate[] = (running.length > 1 ? running : known(all)).slice(0, MAX_CANDIDATES).map((s) => ({
      client: clientOf(s.key),
      session: s.key.slice(s.key.indexOf(':') + 1),
      state: s.state,
      name: resolve(projectId, s.key).name,
    }));
    const what = running.length > 1 ? `В проекте идут ходы нескольких сессий (${running.length})` : 'Не найдена сессия проекта с идущим ходом';
    throw new TitleError('session-ambiguous', `${what}: ${SESSION_FLAGS_HINT}`, 409, { candidates });
  }

  return {
    async load() {
      const unsynced: Array<[string, string]> = [];
      for (const project of await options.listProjects()) {
        let names: string[] = [];
        try {
          names = await readdir(path.join(project.path, SESSIONS_DIR));
        } catch {
          continue;
        }
        const map = projectMap(project.id);
        for (const name of names) {
          const match = FILE.exec(name);
          if (!match) continue;
          const value = (await readJsonFile(path.join(project.path, SESSIONS_DIR, name)).catch(() => undefined)) as Record<string, unknown> | undefined;
          if (!value) continue;
          const text = (field: string): string | null => (typeof value[field] === 'string' && value[field] !== '' ? (value[field] as string) : null);
          const entry: Stored = {
            title: text('title'),
            topic: text('topic'),
            synced: typeof value['synced'] === 'boolean' ? value['synced'] : null,
            note: null,
            archivedAt: text('archivedAt'),
            forgottenAt: text('forgottenAt'),
          };
          const key = `${match[1]}:${match[2]}`;
          map.set(key, entry);
          if ((entry.title || entry.topic) && entry.synced !== true && !entry.forgottenAt) unsynced.push([project.id, key]);
        }
      }
      // A name that did not reach the app before the restart is sent again now, not on the next
      // turn of that session (the retry list lives in memory). In the background: no wait.
      for (const [projectId, key] of unsynced) void sync(projectId, key);
    },
    async setManual(projectId, key, name) {
      const title = cleanTitle(name);
      await save(projectId, key, { title: title || null, synced: null, note: null });
      await sync(projectId, key);
      return resolve(projectId, key);
    },
    async setArchived(projectId, key, archived) {
      await save(projectId, key, { archivedAt: archived ? (options.now?.() ?? new Date()).toISOString() : null });
      await options.archived?.(projectId, key, archived).catch((error: unknown) => {
        options.log?.(`titles: ${key} ${archived ? 'archive' : 'restore'} in the provider failed: ${error instanceof Error ? error.message : String(error)}`);
      });
      return resolve(projectId, key);
    },
    async setForgotten(projectId, key) {
      await save(projectId, key, { forgottenAt: (options.now?.() ?? new Date()).toISOString() });
      return resolve(projectId, key);
    },
    async setTopic(folder, raw, session) {
      const title = cleanTitle(raw);
      if (!title) throw new TitleError('bad-title', 'Пустая тема', 400);
      const project = await options.resolveProject(folder);
      if (!project) throw new TitleError('project-not-found', 'Папка не относится к проекту Workflow Kit', 404);
      const key = session ? `${session.client}:${session.id}` : await runningKey(project.id);
      if (!titleFileName(key)) throw new TitleError('bad-session', 'Неверный ключ сессии', 400);
      if (serviceTurns.has(key)) {
        throw new TitleError('service-turn', 'Это служебное сообщение Workflow Kit, а не задача: задайте тему в ходе, где пользователь даст задачу', 409);
      }
      if (stored.get(project.id)?.get(key)?.topic) throw new TitleError('already-set', 'Тема этой сессии уже задана', 409);
      await save(project.id, key, { topic: title, synced: null, note: null });
      await sync(project.id, key);
      return { projectId: project.id, key, title: resolve(project.id, key) };
    },
    name: resolve,
    running: runningKey,
    onTurn(key) {
      const waiting = pending.get(key);
      if (waiting) void sync(waiting.projectId, key);
    },
    setServiceTurn(key, service) {
      if (service) serviceTurns.add(key);
      else serviceTurns.delete(key);
    },
    async onStop(key) {
      const waiting = pending.get(key);
      if (waiting) await sync(waiting.projectId, key, true);
    },
    async appTitle(key, current) {
      if (!options.promptTitle?.(clientOf(key))) return null;
      for (const [projectId, map] of stored) {
        if (!map.has(key)) continue;
        const title = resolve(projectId, key);
        if (title.source !== 'manual' && title.source !== 'agent') return null;
        if (current === title.name) {
          pending.delete(key);
          if (title.synced !== true) await save(projectId, key, { synced: true, note: null }).catch(() => undefined);
          return null;
        }
        // Sent once per name: a later rename in the app itself is not overridden on every prompt.
        if (sentToApp.get(key) === title.name) return null;
        sentToApp.set(key, title.name);
        return title.name;
      }
      return null;
    },
    section() {
      const projects: Record<string, Record<string, SessionTitle>> = {};
      for (const [projectId, map] of stored) {
        projects[projectId] = {};
        for (const key of map.keys()) projects[projectId]![key] = resolve(projectId, key);
      }
      return { projects };
    },
  };
}
