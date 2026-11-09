import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

/** Options of the atomic JSON writer. */
export interface WriteJsonOptions {
  /** File mode of the written file (default 0600). */
  mode?: number;
  /** Mode of parent directories created on the way (default 0700). */
  dirMode?: number;
  /** Platform whose file rules apply (default: the running one). */
  platform?: NodeJS.Platform;
}

/** Codes of a Windows rename that loses a race with another writer or a reader of the target. */
const WINDOWS_BUSY = new Set(['EPERM', 'EBUSY', 'EACCES']);

/** Dependencies of renameRetrying; tests replace them. */
export interface RenameDeps {
  rename?: (from: string, to: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
}

/**
 * Renames a file over its target. On Windows a rename fails with EPERM, EBUSY or EACCES while
 * another process renames onto or reads the same target; the rename is retried with a growing
 * pause. Other platforms and other errors fail at once.
 */
export async function renameRetrying(from: string, to: string, platform: NodeJS.Platform, deps: RenameDeps = {}): Promise<void> {
  const move = deps.rename ?? rename;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const attempts = deps.attempts ?? 10;
  for (let attempt = 1; ; attempt += 1) {
    try {
      await move(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (platform !== 'win32' || !WINDOWS_BUSY.has(code) || attempt >= attempts) throw error;
      await sleep(15 * attempt);
    }
  }
}

/**
 * Writes a value as pretty JSON atomically: the text goes to a temporary file next to
 * the target, is flushed to disk and then renamed over the target. Readers see either
 * the old or the new content, never a partial file.
 */
export async function writeJsonAtomic(file: string, value: unknown, options: WriteJsonOptions = {}): Promise<void> {
  await writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`, options);
}

/**
 * Writes text atomically (temporary file next to the target, fsync, rename). The default
 * mode is 0600; callers that write into user projects pass the mode they want to keep.
 */
export async function writeFileAtomic(file: string, text: string, options: WriteJsonOptions = {}): Promise<void> {
  const dir = path.dirname(file);
  await mkdir(dir, { recursive: true, mode: options.dirMode ?? 0o700 });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  const mode = options.mode ?? 0o600;
  const platform = options.platform ?? process.platform;
  const handle = await open(tmp, 'wx', mode);
  try {
    try {
      await handle.writeFile(text, 'utf8');
      // The umask may narrow the mode given to open(); chmod sets it exactly.
      if (platform !== 'win32') await handle.chmod(mode);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameRetrying(tmp, file, platform);
  } catch (error) {
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
}

/** Error for a JSON file that exists but cannot be parsed; such a file is never overwritten silently. */
export class InvalidJsonFileError extends Error {
  readonly file: string;

  constructor(file: string, cause: unknown) {
    super(`Invalid JSON in ${file}`, { cause });
    this.name = 'InvalidJsonFileError';
    this.file = file;
  }
}

/** Reads a JSON file; returns undefined when it does not exist and throws InvalidJsonFileError on bad JSON. */
export async function readJsonFile(file: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new InvalidJsonFileError(file, error);
  }
}
