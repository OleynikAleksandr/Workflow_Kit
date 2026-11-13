import path from 'node:path';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createKeyedMutex } from '#data-store';
import type { DataDirs } from '#data-store';

function safe(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid snapshot id');
  return id;
}
/** The injected platform also permits constructing paths for a remote OS in tests. */
export function snapshotFile(dirs: Pick<DataDirs, 'stateDir'>, provider: string, sessionId: string, platform: NodeJS.Platform = process.platform): string {
  const p = platform === 'win32' ? path.win32 : path.posix;
  return p.join(dirs.stateDir, 'session-parameters', safe(provider), `${safe(sessionId)}.json`);
}
export function limitsFile(dirs: Pick<DataDirs, 'stateDir'>, provider: string, platform: NodeJS.Platform = process.platform): string {
  const p = platform === 'win32' ? path.win32 : path.posix;
  return p.join(dirs.stateDir, 'session-parameters', safe(provider), 'account.limits.json');
}
export async function readSnapshot<T = unknown>(file: string): Promise<T | null> {
  try { return JSON.parse(await readFile(file, 'utf8')) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}
export interface SnapshotWriteOptions {
  /** Injectable filesystem replace/sleep for deterministic transient-lock tests. */
  replace?: (source: string, destination: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
}
const writes = createKeyedMutex();
/** Serialize replacements of one destination; retain atomic rename and bounded busy retries. */
export async function writeSnapshot(file: string, value: unknown, options: SnapshotWriteOptions = {}): Promise<void> {
  const attempts = options.attempts ?? 6;
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 10) throw new Error('Invalid snapshot attempts');
  const replace = options.replace ?? rename;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  return writes.run(path.resolve(file), async () => {
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(value) + '\n', { mode: 0o600 });
      for (let attempt = 0; ; attempt++) {
        try { await replace(temporary, file); break; }
        catch (error) {
          if (attempt + 1 >= attempts || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
          await sleep(15 * 2 ** attempt);
        }
      }
    } finally { await rm(temporary, { force: true }); }
  });
}
