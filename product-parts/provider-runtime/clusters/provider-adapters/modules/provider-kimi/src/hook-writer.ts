// One guarded change of config.toml (protocol section 8): a lock file against a second write of
// Kit, a backup, a temporary file renamed over the config only when the config is still the text
// the change was built from, `kimi doctor config`, and a rollback of nothing but Kit's own write.
import { chmod, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ProviderError } from '#provider-registry';
import { holderAlive } from './locks.ts';
import type { Liveness } from './locks.ts';

/** A lock that cannot be read is abandoned when its file is older than this. */
export const UNREADABLE_LOCK_MS = 30_000;
/** Backups of config.toml that Kit keeps. */
export const KEPT_BACKUPS = 3;

/** The text of config.toml; a missing file reads as ''. */
export interface ConfigText {
  text: string;
  exists: boolean;
  /** False when the bytes are not UTF-8: Kit would damage such a file. */
  utf8: boolean;
}

export async function readConfig(file: string): Promise<ConfigText> {
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { text: '', exists: false, utf8: true };
    throw error;
  }
  const text = bytes.toString('utf8');
  return { text, exists: true, utf8: Buffer.from(text, 'utf8').equals(bytes) };
}

/** Inputs of a change; everything about the machine is injected. */
export interface ConfigChangeDeps {
  file: string;
  platform: NodeJS.Platform;
  live: Liveness;
  now(): Date;
  /** Runs `kimi doctor config`; resolves to null when the file is accepted, else to the reason. */
  doctor(): Promise<string | null>;
  /** Test seam: runs right before the last comparison and the rename. */
  beforeRename?: () => Promise<void>;
}

/** What a change did. */
export interface ConfigChange {
  written: boolean;
  /** Backup of the previous file; null when there was no file or nothing was written. */
  backup: string | null;
}

const lockFile = (file: string): string => `${file}.wfk-lock`;
const changed = (): ProviderError => new ProviderError('hooks-changed', 'config.toml Kimi изменился после предпросмотра', { status: 409, hint: 'Проверьте предпросмотр ещё раз.' });

async function takeLock(deps: ConfigChangeDeps): Promise<string> {
  const file = lockFile(deps.file);
  const own = JSON.stringify({ pid: process.pid, startedAt: deps.now().toISOString() });
  for (let attempt = 0; ; attempt += 1) {
    try {
      await writeFile(file, own, { flag: 'wx', mode: 0o600 });
      return own;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || attempt > 0) throw error;
    }
    let abandoned: boolean;
    try {
      const holder = JSON.parse(await readFile(file, 'utf8')) as { pid?: unknown; startedAt?: unknown } | null;
      if (typeof holder !== 'object' || holder === null) throw new Error('not an object');
      abandoned = !holderAlive({ pid: holder.pid, startedAt: holder.startedAt }, deps.live);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      const age = await stat(file).then((info) => deps.now().getTime() - info.mtimeMs, () => UNREADABLE_LOCK_MS + 1);
      abandoned = age > UNREADABLE_LOCK_MS;
    }
    if (!abandoned) throw new ProviderError('hooks-busy', 'config.toml Kimi сейчас меняет другая операция Workflow Kit', { status: 409, hint: 'Повторите через несколько секунд.' });
    await rm(file, { force: true });
  }
}

async function dropLock(deps: ConfigChangeDeps, own: string): Promise<void> {
  const file = lockFile(deps.file);
  // Only the lock this call wrote: a taken-over one belongs to its new holder.
  if ((await readFile(file, 'utf8').catch(() => null)) === own) await rm(file, { force: true });
}

async function backup(deps: ConfigChangeDeps, text: string, mode: number | null): Promise<string> {
  const dir = path.dirname(deps.file);
  const prefix = `${path.basename(deps.file)}.wfk-backup-`;
  const stamp = deps.now().toISOString().replace(/[-:.]/g, '');
  let file = path.join(dir, prefix + stamp);
  for (let n = 1; await stat(file).then(() => true, () => false); n += 1) file = path.join(dir, `${prefix}${stamp}-${n}`);
  await writeFile(file, text, { mode: mode ?? 0o600 });
  const old = (await readdir(dir)).filter((name) => name.startsWith(prefix)).sort().slice(0, -KEPT_BACKUPS);
  for (const name of old) await rm(path.join(dir, name), { force: true });
  return file;
}

/** Writes text next to the config and renames it over the config; the mode of the config is kept. */
async function replace(deps: ConfigChangeDeps, text: string, mode: number | null, check?: () => Promise<void>): Promise<void> {
  const temp = `${deps.file}.wfk-tmp-${process.pid}`;
  try {
    await writeFile(temp, text, { mode: mode ?? 0o600 });
    // writeFile applies the umask; Windows has no such modes.
    if (deps.platform !== 'win32') await chmod(temp, mode ?? 0o600);
    await check?.();
    await rename(temp, deps.file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/**
 * Changes config.toml to build(current text). build throws to refuse (a changed fingerprint);
 * the same text back means there is nothing to write.
 */
export async function changeConfig(deps: ConfigChangeDeps, build: (current: string) => string): Promise<ConfigChange> {
  await mkdir(path.dirname(deps.file), { recursive: true });
  const own = await takeLock(deps);
  try {
    const before = await readConfig(deps.file);
    if (!before.utf8) throw new ProviderError('hooks-unknown', 'config.toml Kimi не в UTF-8: Workflow Kit его не меняет', { status: 409 });
    const target = build(before.text);
    if (target === before.text) return { written: false, backup: null };
    const mode = before.exists ? (await stat(deps.file)).mode & 0o777 : null;
    const kept = before.exists ? await backup(deps, before.text, mode) : null;
    await replace(deps, target, mode, async () => {
      await deps.beforeRename?.();
      const again = await readConfig(deps.file);
      if (again.exists !== before.exists || again.text !== before.text) throw changed();
    });
    const refusal = await deps.doctor();
    if (refusal !== null) {
      const now = await readConfig(deps.file);
      const where = kept ? ` Прежний файл: ${kept}.` : '';
      if (!now.exists || now.text !== target) {
        throw new ProviderError('hooks-invalid', `Kimi не принимает config.toml (${refusal}), и файл уже изменён ещё раз: Workflow Kit его не трогает.${where}`, { status: 409 });
      }
      if (before.exists) await replace(deps, before.text, mode);
      else await rm(deps.file, { force: true });
      throw new ProviderError('hooks-invalid', `Kimi не принимает config.toml с хуком Kit (${refusal}): прежний файл возвращён.`, { status: 409 });
    }
    return { written: true, backup: kept };
  } finally {
    await dropLock(deps, own);
  }
}
