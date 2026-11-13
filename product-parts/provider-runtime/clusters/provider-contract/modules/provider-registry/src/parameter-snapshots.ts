import path from 'node:path';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
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
export async function writeSnapshot(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value) + '\n', { mode: 0o600 });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}
