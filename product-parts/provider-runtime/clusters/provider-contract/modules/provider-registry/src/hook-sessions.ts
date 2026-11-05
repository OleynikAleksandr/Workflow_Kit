// Reading the SessionStart hook journal (<project>/.workflow-kit/local/sessions.jsonl, written by
// `wfk hook`). Providers build their session lists from it; the server never filters sessions.
import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { SESSIONS_JOURNAL_PATH } from '#kit-structure';
import type { ProviderId, SessionInfo } from './contract.ts';

/** One session found in the journal (lines with the same session_id are merged). */
export interface HookSession {
  client: string;
  sessionId: string;
  /** Time of the first line of this session. */
  firstSeen: string;
  /** Time of the latest line (resume, compact, clear). */
  lastSeen: string;
  /** Values of the latest line. */
  transcriptPath: string | null;
  cwd: string | null;
  model: string | null;
  permissionMode: string | null;
  /** Every "source" seen, in order (startup, resume, clear, compact). */
  sources: string[];
  /** WFK_SERVICE_SESSION mark: Kit's own sessions (e.g. the trust dialog). */
  service: string | null;
}

/** Options of readHookSessions. */
export interface ReadHookSessionsOptions {
  /** Keep sessions marked with WFK_SERVICE_SESSION (default false: they are Kit's own). */
  includeService?: boolean;
  /** Only the tail of a larger journal is read (default 4 MiB). */
  maxBytes?: number;
}

/** Default tail of the journal that is read. */
export const HOOK_JOURNAL_MAX_BYTES = 4 * 1024 * 1024;

interface CacheEntry {
  mtimeMs: number;
  size: number;
  maxBytes: number;
  sessions: HookSession[];
}

const cache = new Map<string, CacheEntry>();
const CACHE_LIMIT = 200;

/** Path of the hook journal of a project folder. */
export function hookJournalFile(projectPath: string): string {
  return path.join(projectPath, ...SESSIONS_JOURNAL_PATH.split('/'));
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

async function readTail(file: string, size: number, maxBytes: number): Promise<string> {
  const start = Math.max(0, size - maxBytes);
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(size - start);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    const content = buffer.subarray(0, bytesRead).toString('utf8');
    // A cut first line is dropped.
    return start > 0 ? content.slice(content.indexOf('\n') + 1) : content;
  } finally {
    await handle.close();
  }
}

/** Parses journal text into sessions (all clients, service ones included), newest first. */
export function parseHookJournal(content: string): HookSession[] {
  const byId = new Map<string, HookSession>();
  for (const line of content.split('\n')) {
    if (line.trim() === '') continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const client = text(row['client']);
    const sessionId = text(row['session_id']);
    const time = text(row['time']);
    if (!client || !sessionId || !time) continue;
    const key = `${client}\u0000${sessionId}`;
    const source = text(row['source']);
    const existing = byId.get(key);
    const session: HookSession = existing ?? {
      client,
      sessionId,
      firstSeen: time,
      lastSeen: time,
      transcriptPath: null,
      cwd: null,
      model: null,
      permissionMode: null,
      sources: [],
      service: null,
    };
    if (time < session.firstSeen) session.firstSeen = time;
    if (time >= session.lastSeen || !existing) {
      session.lastSeen = time;
      session.transcriptPath = text(row['transcript_path']) ?? session.transcriptPath;
      session.cwd = text(row['cwd']) ?? session.cwd;
      session.model = text(row['model']) ?? session.model;
      session.permissionMode = text(row['permission_mode']) ?? session.permissionMode;
    }
    if (source) session.sources.push(source);
    session.service = session.service ?? text(row['service']);
    byId.set(key, session);
  }
  return [...byId.values()].sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));
}

/**
 * Sessions of one client from the project's hook journal, newest first. Results are cached by
 * the file's mtime and size (D11); a missing journal gives an empty list. Sessions marked with
 * WFK_SERVICE_SESSION are left out unless includeService is set.
 */
export async function readHookSessions(
  project: { path: string },
  client: string,
  options: ReadHookSessionsOptions = {},
): Promise<HookSession[]> {
  const file = hookJournalFile(project.path);
  const maxBytes = options.maxBytes ?? HOOK_JOURNAL_MAX_BYTES;
  let info;
  try {
    info = await stat(file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return [];
    throw error;
  }
  let entry = cache.get(file);
  if (!entry || entry.mtimeMs !== info.mtimeMs || entry.size !== info.size || entry.maxBytes !== maxBytes) {
    entry = { mtimeMs: info.mtimeMs, size: info.size, maxBytes, sessions: parseHookJournal(await readTail(file, info.size, maxBytes)) };
    cache.delete(file);
    cache.set(file, entry);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  }
  return entry.sessions
    .filter((s) => s.client === client && (options.includeService || s.service === null))
    .map((s) => ({ ...s, sources: [...s.sources] }));
}

/** Drops cached journals (POST /api/refresh). */
export function clearHookSessionsCache(): void {
  cache.clear();
}

/**
 * A SessionInfo for a journal session: origin "hook", state "unknown", no links. Providers add
 * remoteId and links when they can resolve them (e.g. Claude's bridge-session record).
 */
export function hookSessionInfo(provider: ProviderId, session: HookSession, extra: Partial<SessionInfo> = {}): SessionInfo {
  const info: SessionInfo = {
    provider,
    localId: session.sessionId,
    title: `Сессия ${session.sessionId.slice(0, 8)}`,
    createdAt: session.firstSeen,
    origin: 'hook',
    state: 'unknown',
    links: {},
  };
  if (session.cwd) info.cwd = session.cwd;
  if (session.model) info.model = session.model;
  return { ...info, ...extra };
}
