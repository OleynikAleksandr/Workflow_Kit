// Session names (spec section 11): manual name → the agent's topic (`wfk session title`) → the
// plan objective (owner session) → the provider's own name → «Новая сессия». Names live in the
// project folder next to the review toggle, .workflow-kit/local/sessions/<client>.<id>.json
// (fields title, topic, synced); Codex threads also get the name in ChatGPT when that is safe.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from '#data-store';

export const SESSIONS_DIR = '.workflow-kit/local/sessions';
export const DEFAULT_NAME = 'Новая сессия';
export const MAX_TITLE_LENGTH = 80;

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
}

/** A refused title change. */
export class TitleError extends Error {
  readonly code: 'bad-title' | 'bad-session' | 'project-not-found' | 'no-running-turn' | 'ambiguous' | 'already-set';
  readonly status: number;
  constructor(code: TitleError['code'], message: string, status: number) {
    super(message);
    this.name = 'TitleError';
    this.code = code;
    this.status = status;
  }
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
  /** Gives the name to the provider app; resolves { synced, note }. */
  rename?: (projectId: string, key: string, name: string) => Promise<{ synced: boolean; note?: string }>;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface SessionTitles {
  load(): Promise<void>;
  /** Manual name from the panel; an empty name removes it. */
  setManual(projectId: string, key: string, name: string): Promise<SessionTitle>;
  /** Puts the session into the archive or returns it (the provider session is not touched). */
  setArchived(projectId: string, key: string, archived: boolean): Promise<SessionTitle>;
  /** `wfk session title`: the topic of the session whose turn is running in the folder's project. */
  setTopic(folder: string, title: string): Promise<{ projectId: string; key: string; title: SessionTitle }>;
  /** Name of a session (providerTitle: the provider's own name, if any). */
  name(projectId: string, key: string, providerTitle?: string | null): SessionTitle;
  /** A turn of the session started: retries a provider rename that had to wait. */
  onTurn(key: string): void;
  section(): { projects: Record<string, Record<string, SessionTitle>> };
}

interface Stored {
  title: string | null;
  topic: string | null;
  synced: boolean | null;
  note: string | null;
  archivedAt: string | null;
}

const KEY = /^(claude|codex):([A-Za-z0-9._-]{1,200})$/;

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

  async function save(projectId: string, key: string, patch: Partial<Stored>): Promise<Stored> {
    const file = titleFileName(key);
    if (!file) throw new TitleError('bad-session', 'Неверный ключ сессии', 400);
    const target = path.join(await folderOf(projectId), SESSIONS_DIR, file);
    const current = ((await readJsonFile(target).catch(() => undefined)) ?? {}) as Record<string, unknown>;
    const map = projectMap(projectId);
    const next: Stored = { title: null, topic: null, synced: null, note: null, archivedAt: null, ...map.get(key), ...patch };
    const fields = { title: next.title, topic: next.topic, synced: next.synced, archivedAt: next.archivedAt };
    await writeJsonAtomic(target, { ...current, ...fields }, { mode: 0o600, dirMode: 0o700 });
    map.set(key, next);
    return next;
  }

  function resolve(projectId: string, key: string, providerTitle?: string | null): SessionTitle {
    const entry = stored.get(projectId)?.get(key);
    const manual = entry?.title ?? null;
    const topic = entry?.topic ?? null;
    const base = { manual, topic, synced: entry?.synced ?? null, note: entry?.note ?? null, archivedAt: entry?.archivedAt ?? null };
    if (manual) return { name: manual, source: 'manual', ...base };
    if (topic) return { name: topic, source: 'agent', ...base };
    const scope = options.scope(projectId);
    if (scope && scope.ownerSession && key.endsWith(`:${scope.ownerSession}`)) return { name: scope.objective, source: 'scope', ...base };
    if (providerTitle) return { name: providerTitle, source: 'provider', ...base };
    return { name: DEFAULT_NAME, source: 'default', ...base };
  }

  async function sync(projectId: string, key: string): Promise<void> {
    const title = resolve(projectId, key);
    if (!options.rename || !key.startsWith('codex:') || (title.source !== 'manual' && title.source !== 'agent')) return;
    try {
      const result = await options.rename(projectId, key, title.name);
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

  return {
    async load() {
      for (const project of await options.listProjects()) {
        let names: string[] = [];
        try {
          names = await readdir(path.join(project.path, SESSIONS_DIR));
        } catch {
          continue;
        }
        const map = projectMap(project.id);
        for (const name of names) {
          const match = /^(claude|codex)\.([A-Za-z0-9._-]{1,200})\.json$/.exec(name);
          if (!match) continue;
          const value = (await readJsonFile(path.join(project.path, SESSIONS_DIR, name)).catch(() => undefined)) as Record<string, unknown> | undefined;
          if (!value) continue;
          const text = (field: string): string | null => (typeof value[field] === 'string' && value[field] !== '' ? (value[field] as string) : null);
          map.set(`${match[1]}:${match[2]}`, {
            title: text('title'),
            topic: text('topic'),
            synced: typeof value['synced'] === 'boolean' ? value['synced'] : null,
            note: null,
            archivedAt: text('archivedAt'),
          });
        }
      }
    },
    async setManual(projectId, key, name) {
      const title = cleanTitle(name);
      await save(projectId, key, { title: title || null, synced: null, note: null });
      await sync(projectId, key);
      return resolve(projectId, key);
    },
    async setArchived(projectId, key, archived) {
      await save(projectId, key, { archivedAt: archived ? (options.now?.() ?? new Date()).toISOString() : null });
      return resolve(projectId, key);
    },
    async setTopic(folder, raw) {
      const title = cleanTitle(raw);
      if (!title) throw new TitleError('bad-title', 'Пустая тема', 400);
      const project = await options.resolveProject(folder);
      if (!project) throw new TitleError('project-not-found', 'Папка не относится к проекту Workflow Kit', 404);
      const running = options.sessions().filter((s) => s.projectId === project.id && s.state === 'working');
      if (running.length === 0) {
        throw new TitleError('no-running-turn', 'Не найдена сессия проекта с идущим ходом: служба не получила хук начала хода', 409);
      }
      if (running.length > 1) {
        throw new TitleError('ambiguous', `В проекте идут ходы нескольких сессий (${running.length}): переименуйте сессию в панели Workflow Kit`, 409);
      }
      const key = running[0]!.key;
      if (stored.get(project.id)?.get(key)?.topic) throw new TitleError('already-set', 'Тема этой сессии уже задана', 409);
      await save(project.id, key, { topic: title, synced: null, note: null });
      await sync(project.id, key);
      return { projectId: project.id, key, title: resolve(project.id, key) };
    },
    name: resolve,
    onTurn(key) {
      const waiting = pending.get(key);
      if (waiting) void sync(waiting.projectId, key);
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
