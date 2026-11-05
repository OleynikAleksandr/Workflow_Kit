import { appendFile, chmod, mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import type { DataDirs } from './paths.ts';

/** Size after which events.jsonl is rotated (spec section 6). */
export const EVENTS_MAX_BYTES = 5 * 1024 * 1024;

/** One line of events.jsonl. */
export interface EventRecord {
  /** ISO time of the event. */
  time: string;
  /** Dotted event type, e.g. "project.created". */
  type: string;
  [field: string]: unknown;
}

/** Options of the event journal; the clock and the size limit are injectable for tests. */
export interface EventLogOptions {
  file: string;
  /** Rotation threshold in bytes (default 5 MiB). */
  maxBytes?: number;
  now?: () => Date;
  /** File mode of a new journal (default 0600; ignored on Windows). */
  mode?: number;
}

/** Append-only journal of backend events (JSON Lines). */
export interface EventLog {
  readonly file: string;
  /** Appends one event; appends are serialized, rotation happens before an append that would exceed the limit. */
  append(type: string, fields?: Record<string, unknown>): Promise<EventRecord>;
}

/** Path of events.jsonl inside the state directory. */
export function eventsFile(dirs: DataDirs): string {
  return path.join(dirs.stateDir, 'events.jsonl');
}

/** Path of the previous journal kept after rotation (events.1.jsonl). */
export function rotatedEventsFile(file: string): string {
  const ext = path.extname(file);
  return `${file.slice(0, file.length - ext.length)}.1${ext}`;
}

async function fileSize(file: string): Promise<number> {
  try {
    return (await stat(file)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}

/**
 * Creates the event journal. When the next line would push the file over maxBytes,
 * the file is renamed to events.1.jsonl (replacing the older one) and a new file starts.
 */
export function createEventLog(options: EventLogOptions): EventLog {
  const maxBytes = options.maxBytes ?? EVENTS_MAX_BYTES;
  const now = options.now ?? (() => new Date());
  const mode = options.mode ?? 0o600;
  let queue: Promise<unknown> = Promise.resolve();

  async function write(record: EventRecord): Promise<void> {
    const line = `${JSON.stringify(record)}\n`;
    await mkdir(path.dirname(options.file), { recursive: true, mode: 0o700 });
    let size = await fileSize(options.file);
    if (size > 0 && size + Buffer.byteLength(line) > maxBytes) {
      await rename(options.file, rotatedEventsFile(options.file));
      size = 0;
    }
    await appendFile(options.file, line, { encoding: 'utf8', mode });
    if (size === 0 && process.platform !== 'win32') await chmod(options.file, mode);
  }

  return {
    file: options.file,
    append(type, fields = {}) {
      const record: EventRecord = { ...fields, time: now().toISOString(), type };
      const done = queue.then(() => write(record));
      queue = done.catch(() => undefined);
      return done.then(() => record);
    },
  };
}
