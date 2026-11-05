// The only writer of ~/.claude.json (grantTrust, after the preview and its token). It merges a few
// keys into projects["<folder>"] and keeps everything else as it is: read, patch, write a temporary
// file next to it with the same permissions, rename over it, read it back. Claude Code rewrites the
// whole file from its own memory, so a write made while it runs can be lost; the keys are checked
// after each write and the write is repeated (3 attempts by default).
import { randomBytes } from 'node:crypto';
import { chmod, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ProviderError } from '#provider-registry';

/** Attempts of one patch before "trust-lost". */
export const CONFIG_WRITE_ATTEMPTS = 3;

/** Options of patchProjectEntry; afterWrite lets tests imitate a concurrent write of Claude. */
export interface PatchOptions {
  attempts?: number;
  afterWrite?: (attempt: number) => Promise<void>;
}

/** Result of a successful patch. */
export interface PatchResult {
  /** Attempts used (1 when the first write held). */
  attempts: number;
  /** True when the file did not exist and was created. */
  created: boolean;
}

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** Parses the config; a broken file is never overwritten. */
function parse(file: string, text: string | null): JsonObject {
  if (text === null) return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new ProviderError('config-broken', `${file} не читается как JSON: ${(error as Error).message}`, { hint: 'Kit не пишет в битый файл: исправьте его или восстановите копию.' });
  }
  if (!isRecord(value)) throw new ProviderError('config-broken', `${file}: ожидается JSON-объект`, { hint: 'Kit не пишет в битый файл: исправьте его или восстановите копию.' });
  return value;
}

/** True when projects[folder] holds every key of patch with the same value. */
export function hasPatch(text: string | null, folder: string, patch: Readonly<JsonObject>): boolean {
  if (text === null) return false;
  try {
    const value = JSON.parse(text) as unknown;
    const projects = isRecord(value) ? value['projects'] : undefined;
    const entry = isRecord(projects) ? projects[folder] : undefined;
    return isRecord(entry) && Object.entries(patch).every(([key, expected]) => entry[key] === expected);
  } catch {
    return false;
  }
}

/** Resolves a symlinked ~/.claude.json, so the rename replaces the target and keeps the link. */
async function targetOf(file: string): Promise<string> {
  try {
    return await realpath(file);
  } catch {
    return file;
  }
}

/**
 * Merges patch into projects[folder] of the JSON file (2-space indent, other keys untouched, file
 * mode kept, 0600 for a new file) and verifies the result by reading it back. Throws
 * ProviderError "config-broken" for an unreadable file and "trust-lost" when every attempt was
 * overwritten.
 */
export async function patchProjectEntry(file: string, folder: string, patch: Readonly<JsonObject>, options: PatchOptions = {}): Promise<PatchResult> {
  const attempts = Math.max(1, options.attempts ?? CONFIG_WRITE_ATTEMPTS);
  const target = await targetOf(file);
  let created = false;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const before = await readOrNull(target);
    const config = parse(file, before);
    const projects = config['projects'] ?? {};
    if (!isRecord(projects)) throw new ProviderError('config-broken', `${file}: projects — не объект`, { hint: 'Kit не пишет в такой файл: проверьте его вручную.' });
    const entry = projects[folder];
    projects[folder] = { ...(isRecord(entry) ? entry : {}), ...patch };
    config['projects'] = projects;
    const mode = before === null ? 0o600 : (await stat(target)).mode & 0o777;
    const temp = path.join(path.dirname(target), `.${path.basename(target)}.wfk-${process.pid}-${randomBytes(4).toString('hex')}.tmp`);
    await writeFile(temp, JSON.stringify(config, null, 2), { mode });
    try {
      await chmod(temp, mode);
      // Claude may have saved the file meanwhile: start over from its version instead of replacing it.
      if ((await readOrNull(target)) !== before) continue;
      await rename(temp, target);
    } finally {
      await rm(temp, { force: true });
    }
    created ||= before === null;
    await options.afterWrite?.(attempt);
    if (hasPatch(await readOrNull(target), folder, patch)) return { attempts: attempt, created };
  }
  throw new ProviderError('trust-lost', `Запись в ${file} не сохранилась: файл перезаписан параллельно (попыток: ${attempts})`, {
    hint: 'Закройте запущенные сессии Claude Code и повторите «Предпросмотр доверия…» → «Доверять».',
  });
}
