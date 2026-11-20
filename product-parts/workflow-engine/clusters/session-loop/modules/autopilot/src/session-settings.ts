// M48 T001: the autopiloting of one session. Settings hold the defaults; a session takes them once,
// when it begins (its first SessionStart, or the first decision point of a session the service did
// not know), and keeps its own mode and review from then on. The user changes them on the session's
// card at any stage; Settings never change a session that has begun. A session that owns the active
// run of its project when it is first seen (an update from an older version) takes the run's mode
// and review. One file per session: `<project>/.workflow-kit/local/autopiloting/sessions/<client>.<id>.json`.
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { readJsonFile, writeJsonAtomic } from '#data-store';
import { RUNS_DIR } from './run-journal.ts';
import type { RunJournal } from './run-journal.ts';
import { AUTOPILOTING_MODES, SettingsError } from './settings.ts';
import type { AutopilotingMode, SettingsStore } from './settings.ts';

export const SESSION_SETTINGS_DIR = `${RUNS_DIR}/sessions`;

export type SessionSettingsSource = 'defaults' | 'user' | 'run';

export interface SessionAutopiloting {
  version: 1;
  revision: number;
  /** `<client>:<session id>`, as the channel names the session. */
  key: string;
  mode: AutopilotingMode;
  review: boolean;
  source: SessionSettingsSource;
  /** When the values were taken or last changed (ISO). */
  at: string;
  /**
   * M48 T002: when the user answered the session's plan question with a specification and a plan
   * (ISO) — the agent writes them; cleared once Kit shows a proposal or a plan. Not a change of the
   * user: the revision stays.
   */
  preparing?: string | null;
}

export interface SessionSettingsChange {
  projectId: string;
  folder: string;
  key: string;
  before: SessionAutopiloting;
  after: SessionAutopiloting;
}

export interface SessionSettingsStore {
  /** The stored record, or null for a session that has not begun for the service. */
  get(projectId: string, key: string): Promise<SessionAutopiloting | null>;
  /** The record, taken now from the active run of the session or from Settings when there is none. */
  ensure(projectId: string, key: string): Promise<SessionAutopiloting>;
  /** The user's change on the session card: `{ expectedRevision, mode?, review? }`. */
  write(projectId: string, key: string, input: unknown): Promise<SessionAutopiloting>;
  /** M48 T002: sets or clears the «writing the plan» mark of a session (the revision stays). */
  mark(projectId: string, key: string, at: string | null): Promise<void>;
  /** Reads the records of every project once (service start), for the panel state. */
  load(projects: Array<{ id: string; path: string }>): Promise<void>;
  /** The known records by project and session key (the `autopiloting.sessions` section). */
  section(): Record<string, Record<string, SessionAutopiloting>>;
  onChange(listener: (change: SessionSettingsChange) => Promise<void> | void): () => void;
}

/** A session key the card accepts: `<client>:<session id>` with no path or space characters. */
export function validSessionKey(key: string): boolean {
  return /^[a-z][a-z0-9-]{0,31}:[A-Za-z0-9._-]{1,200}$/u.test(key);
}

/** The file name of a session: `<client>.<id>.json` with no character Windows refuses. */
export function sessionSettingsName(key: string): string {
  const colon = key.indexOf(':');
  const client = colon > 0 ? key.slice(0, colon) : 'session';
  const id = colon > 0 ? key.slice(colon + 1) : key;
  const safe = (part: string): string => part.replace(/[^A-Za-z0-9._-]/g, '_');
  return `${safe(client)}.${safe(id)}.json`;
}

export function sessionSettingsFile(folder: string, key: string): string {
  return path.join(folder, ...SESSION_SETTINGS_DIR.split('/'), sessionSettingsName(key));
}

function parse(value: unknown, key: string): SessionAutopiloting | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v['version'] !== 1 || v['key'] !== key) return null;
  if (!Number.isSafeInteger(v['revision']) || (v['revision'] as number) < 0) return null;
  if (!AUTOPILOTING_MODES.includes(v['mode'] as AutopilotingMode) || typeof v['review'] !== 'boolean') return null;
  const source = (['defaults', 'user', 'run'] as const).find((s) => s === v['source']);
  if (!source || typeof v['at'] !== 'string') return null;
  const preparing = typeof v['preparing'] === 'string' ? v['preparing'] : null;
  return { version: 1, revision: v['revision'] as number, key, mode: v['mode'] as AutopilotingMode, review: v['review'], source, at: v['at'], ...(preparing ? { preparing } : {}) };
}

export function createSessionSettings(options: {
  settings: Pick<SettingsStore, 'read'>;
  journal: Pick<RunJournal, 'active'>;
  projectPath(projectId: string): Promise<string | undefined>;
  platform?: NodeJS.Platform;
  now?: () => Date;
  log?: (line: string) => void;
}): SessionSettingsStore {
  const now = options.now ?? (() => new Date());
  const writeOptions = { mode: 0o600, dirMode: 0o700, ...(options.platform ? { platform: options.platform } : {}) };
  const cache = new Map<string, Map<string, SessionAutopiloting>>();
  const listeners = new Set<(change: SessionSettingsChange) => Promise<void> | void>();
  // One step at a time per session file: the revision check and the write are one step.
  const chains = new Map<string, Promise<unknown>>();
  const serial = <T>(file: string, step: () => Promise<T>): Promise<T> => {
    const next = (chains.get(file) ?? Promise.resolve()).then(step);
    chains.set(file, next.catch(() => undefined));
    return next;
  };
  const remember = (projectId: string, record: SessionAutopiloting): SessionAutopiloting => {
    const sessions = cache.get(projectId) ?? new Map<string, SessionAutopiloting>();
    sessions.set(record.key, record);
    cache.set(projectId, sessions);
    return record;
  };
  async function folderOf(projectId: string): Promise<string> {
    const folder = await options.projectPath(projectId);
    if (!folder) throw new SettingsError('project-not-found', 'Проект не найден');
    return folder;
  }
  async function read(folder: string, key: string): Promise<SessionAutopiloting | null> {
    const value = await readJsonFile(sessionSettingsFile(folder, key)).catch(() => undefined);
    return value === undefined ? null : parse(value, key);
  }
  async function taken(folder: string, key: string): Promise<SessionAutopiloting> {
    const run = await options.journal.active(folder).catch(() => null);
    if (run && run.owner.key === key) return { version: 1, revision: 0, key, mode: run.mode, review: run.review, source: 'run', at: now().toISOString() };
    const { settings } = await options.settings.read();
    return { version: 1, revision: 0, key, mode: settings.mode, review: settings.review, source: 'defaults', at: now().toISOString() };
  }

  async function ensure(projectId: string, key: string): Promise<SessionAutopiloting> {
    if (!validSessionKey(key)) throw new SettingsError('bad-request', 'Неверный ключ сессии: нужен <client>:<id>');
    const folder = await folderOf(projectId);
    const file = sessionSettingsFile(folder, key);
    return serial(file, async () => {
      const known = await read(folder, key);
      if (known) return remember(projectId, known);
      const record = await taken(folder, key);
      await writeJsonAtomic(file, record, writeOptions);
      options.log?.(`autopiloting: session ${key} of ${projectId} begins with mode=${record.mode}, review=${record.review ? 'on' : 'off'} (${record.source})`);
      return remember(projectId, record);
    });
  }

  return {
    async get(projectId, key) {
      const folder = await options.projectPath(projectId);
      if (!folder) return null;
      const record = await read(folder, key);
      return record ? remember(projectId, record) : null;
    },
    ensure,
    async write(projectId, key, input) {
      const body = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
      const { expectedRevision, mode, review } = body;
      if (!Number.isSafeInteger(expectedRevision) || (expectedRevision as number) < 0) {
        throw new SettingsError('bad-request', 'Нужна expectedRevision — ревизия настроек сессии, которую видит панель');
      }
      if (mode !== undefined && !AUTOPILOTING_MODES.includes(mode as AutopilotingMode)) throw new SettingsError('bad-request', `Неизвестный режим автопилотирования: ${String(mode)}`);
      if (review !== undefined && typeof review !== 'boolean') throw new SettingsError('bad-request', 'review — true или false');
      if (mode === undefined && review === undefined) throw new SettingsError('bad-request', 'Нужен mode или review');
      const folder = await folderOf(projectId);
      const before = await ensure(projectId, key);
      const file = sessionSettingsFile(folder, key);
      const change = await serial(file, async () => {
        const current = (await read(folder, key)) ?? before;
        if (current.revision !== expectedRevision) {
          throw new SettingsError('settings-stale', 'Настройки сессии уже изменены на другом устройстве', current);
        }
        const after: SessionAutopiloting = {
          ...current,
          revision: current.revision + 1,
          ...(mode !== undefined ? { mode: mode as AutopilotingMode } : {}),
          ...(review !== undefined ? { review: review as boolean } : {}),
          source: 'user',
          at: now().toISOString(),
        };
        await writeJsonAtomic(file, after, writeOptions);
        remember(projectId, after);
        return { projectId, folder, key, before: current, after };
      });
      for (const listener of listeners) await listener(change);
      return change.after;
    },
    async mark(projectId, key, at) {
      const record = await ensure(projectId, key);
      if ((record.preparing ?? null) === at) return;
      const folder = await folderOf(projectId);
      const file = sessionSettingsFile(folder, key);
      await serial(file, async () => {
        const current = (await read(folder, key)) ?? record;
        const { preparing: _old, ...rest } = current;
        const next: SessionAutopiloting = at ? { ...rest, preparing: at } : rest;
        await writeJsonAtomic(file, next, writeOptions);
        remember(projectId, next);
      });
    },
    async load(projects) {
      for (const project of projects) {
        let names: string[] = [];
        try {
          names = await readdir(path.join(project.path, ...SESSION_SETTINGS_DIR.split('/')));
        } catch {
          continue;
        }
        for (const name of names.filter((n) => n.endsWith('.json'))) {
          const value = await readJsonFile(path.join(project.path, ...SESSION_SETTINGS_DIR.split('/'), name)).catch(() => undefined);
          const key = value && typeof value === 'object' ? (value as Record<string, unknown>)['key'] : undefined;
          const record = typeof key === 'string' && sessionSettingsName(key) === name ? parse(value, key) : null;
          if (record) remember(project.id, record);
        }
      }
    },
    section() {
      return Object.fromEntries([...cache].map(([projectId, sessions]) => [projectId, Object.fromEntries(sessions)]));
    },
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
