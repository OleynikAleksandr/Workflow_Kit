// The autopiloting settings of the service (spec M39 runtime section 1): one file
// `autopiloting.json` in the configuration folder, `{ version: 1, revision, mode, review }`. A
// missing file means off without review; an unreadable or invalid one never turns the autopilot
// on: it reads as off and the error is shown in Settings. Writes are atomic and check the
// revision; the file is the same for every panel of the service (Mac, iPad, other devices).
// M48: these are the defaults a session takes when it begins (session-settings.ts); a change
// never reaches a session that has begun.
import path from 'node:path';
import { InvalidJsonFileError, readJsonFile, writeJsonAtomic } from '#data-store';

export type AutopilotingMode = 'off' | 'after-start' | 'full';
export const AUTOPILOTING_MODES: readonly AutopilotingMode[] = ['off', 'after-start', 'full'];
export const SETTINGS_FILE = 'autopiloting.json';

export interface AutopilotingSettings {
  version: 1;
  revision: number;
  mode: AutopilotingMode;
  review: boolean;
}

/** The settings as the panel reads them: the stored values, or off with the reading error. */
export interface SettingsView {
  settings: AutopilotingSettings;
  /** Why the stored file could not be read; the values are then the safe defaults. */
  error: string | null;
}

export const DEFAULT_SETTINGS: AutopilotingSettings = { version: 1, revision: 0, mode: 'off', review: false };

/**
 * A refused write: 400 bad-request (unknown value), 404 project-not-found (M48, a session card of an
 * unknown project) or 409 settings-stale (with the current values).
 */
export class SettingsError extends Error {
  readonly code: 'bad-request' | 'project-not-found' | 'settings-stale';
  readonly status: number;
  /** The stored values the write was refused against (Settings or, M48, the session's record). */
  readonly current: object | null;
  constructor(code: SettingsError['code'], message: string, current: object | null = null) {
    super(message);
    this.name = 'SettingsError';
    this.code = code;
    this.status = code === 'bad-request' ? 400 : code === 'project-not-found' ? 404 : 409;
    this.current = current;
  }
}

export interface SettingsChange {
  before: AutopilotingSettings;
  after: AutopilotingSettings;
}

export interface SettingsStore {
  read(): Promise<SettingsView>;
  /** Writes the new values when `expectedRevision` is the stored revision; the file first, then the listeners. */
  write(input: unknown): Promise<AutopilotingSettings>;
  /** Hears a stored change (for example off pauses the runs); returns the unsubscribe. */
  onChange(listener: (change: SettingsChange) => Promise<void> | void): () => void;
}

function parse(value: unknown): AutopilotingSettings | string {
  if (!value || typeof value !== 'object') return 'файл настроек не содержит объекта';
  const v = value as Record<string, unknown>;
  if (v['version'] !== 1) return `неизвестная версия настроек: ${String(v['version'])}`;
  if (!Number.isSafeInteger(v['revision']) || (v['revision'] as number) < 0) return 'неверная ревизия настроек';
  if (!AUTOPILOTING_MODES.includes(v['mode'] as AutopilotingMode)) return `неизвестный режим: ${String(v['mode'])}`;
  if (typeof v['review'] !== 'boolean') return 'неверное значение ревью';
  return { version: 1, revision: v['revision'] as number, mode: v['mode'] as AutopilotingMode, review: v['review'] };
}

export function createSettingsStore(options: { configDir: string; platform?: NodeJS.Platform }): SettingsStore {
  const file = path.join(options.configDir, SETTINGS_FILE);
  const listeners = new Set<(change: SettingsChange) => Promise<void> | void>();
  let writing: Promise<unknown> = Promise.resolve();

  async function read(): Promise<SettingsView> {
    let value: unknown;
    try {
      value = await readJsonFile(file);
    } catch (error) {
      const reason = error instanceof InvalidJsonFileError ? 'файл настроек повреждён' : `файл настроек не читается (${error instanceof Error ? error.message : String(error)})`;
      return { settings: { ...DEFAULT_SETTINGS }, error: reason };
    }
    if (value === undefined) return { settings: { ...DEFAULT_SETTINGS }, error: null };
    const parsed = parse(value);
    return typeof parsed === 'string' ? { settings: { ...DEFAULT_SETTINGS }, error: parsed } : { settings: parsed, error: null };
  }

  async function write(input: unknown): Promise<AutopilotingSettings> {
    const body = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const { expectedRevision, mode, review } = body;
    if (!Number.isSafeInteger(expectedRevision) || (expectedRevision as number) < 0) {
      throw new SettingsError('bad-request', 'Нужна expectedRevision — ревизия настроек, которую видит панель');
    }
    if (!AUTOPILOTING_MODES.includes(mode as AutopilotingMode)) throw new SettingsError('bad-request', `Неизвестный режим автопилотирования: ${String(mode)}`);
    if (typeof review !== 'boolean') throw new SettingsError('bad-request', 'review — true или false');
    // One write at a time: the revision check and the write are one step.
    const step = writing.then(async () => {
      const { settings: before } = await read();
      if (before.revision !== expectedRevision) {
        throw new SettingsError('settings-stale', 'Настройки уже изменены на другом устройстве', before);
      }
      const after: AutopilotingSettings = { version: 1, revision: before.revision + 1, mode: mode as AutopilotingMode, review };
      await writeJsonAtomic(file, after, { mode: 0o600, dirMode: 0o700, ...(options.platform ? { platform: options.platform } : {}) });
      for (const listener of listeners) await listener({ before, after });
      return after;
    });
    writing = step.catch(() => undefined);
    return step;
  }

  return {
    read,
    write,
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
