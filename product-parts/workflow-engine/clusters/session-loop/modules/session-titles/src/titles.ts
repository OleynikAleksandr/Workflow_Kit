// Session names (spec section 11): manual name → the agent's topic (`wfk session title`) → the
// plan objective (owner session) → the provider's own name → «Новая сессия». Names live in the
// project folder next to the review toggle, .workflow-kit/local/sessions/<client>.<id>.json
// (fields title, topic, synced); the provider gives the name to its app (renameSession), a
// provider with promptTitle also through the UserPromptSubmit hook answer (sessionTitle).
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { createKeyedMutex, readJsonFile, writeJsonAtomic } from '#data-store';
import { DEFAULT_NAME, MAX_TITLE_LENGTH, NEXT_TURN_NOTE, SESSIONS_DIR, SESSION_FLAGS_HINT, TitleError } from './types.ts';
import type { ActiveSession, SessionCandidate, SessionTitle, SessionTitles, SessionTitlesOptions } from './types.ts';

export { DEFAULT_NAME, MAX_TITLE_LENGTH, NEXT_TURN_NOTE, SESSIONS_DIR, SESSION_FLAGS_HINT, TitleError } from './types.ts';
export type { ActiveSession, SessionCandidate, SessionTitle, SessionTitles, SessionTitlesOptions, TitleSource } from './types.ts';

const MAX_CANDIDATES = 20;

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

  /** Tells the service a session left the Kit process; a failing listener is only logged. */
  function excludedNow(projectId: string, key: string): void {
    try {
      options.onExcluded?.(projectId, key);
    } catch (error) {
      log(`titles: ${key} could not leave the Kit process: ${error instanceof Error ? error.message : String(error)}`);
    }
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
      if (archived) excludedNow(projectId, key);
      await options.archived?.(projectId, key, archived).catch((error: unknown) => {
        options.log?.(`titles: ${key} ${archived ? 'archive' : 'restore'} in the provider failed: ${error instanceof Error ? error.message : String(error)}`);
      });
      return resolve(projectId, key);
    },
    async setForgotten(projectId, key) {
      await save(projectId, key, { forgottenAt: (options.now?.() ?? new Date()).toISOString() });
      excludedNow(projectId, key);
      return resolve(projectId, key);
    },
    excluded(projectId, key) {
      const entry = stored.get(projectId)?.get(key);
      return Boolean(entry && (entry.archivedAt || entry.forgottenAt));
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
