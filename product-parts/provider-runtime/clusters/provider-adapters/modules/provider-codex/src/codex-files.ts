// Codex's own files under $CODEX_HOME (default ~/.codex), read without external programs: the
// daemon pid file, trust in config.toml, thread names in session_index.jsonl. Every reader is
// tolerant to unknown fields (R1) and cached by mtime and size (D11).
import { open, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** Paths of the Codex files the provider reads. */
export interface CodexPaths {
  home: string;
  config: string;
  daemonPid: string;
  daemonStderr: string;
  /** Login of the CLI and the apps (ChatGPT refreshes it). */
  auth: string;
  controlSocket: string;
  sessionIndex: string;
}

/** $CODEX_HOME when set (absolute), otherwise <home>/.codex. */
export function codexPaths(homedir: string, env: Readonly<Record<string, string | undefined>>): CodexPaths {
  const fromEnv = env['CODEX_HOME'];
  const home = fromEnv && path.isAbsolute(fromEnv) ? fromEnv : path.join(homedir, '.codex');
  return {
    home,
    config: path.join(home, 'config.toml'),
    daemonPid: path.join(home, 'app-server-daemon', 'daemon.pid'),
    daemonStderr: path.join(home, 'app-server-daemon', 'daemon.stderr.log'),
    auth: path.join(home, 'auth.json'),
    controlSocket: path.join(home, 'app-server-control', 'app-server-control.sock'),
    sessionIndex: path.join(home, 'session_index.jsonl'),
  };
}

/** A TOML basic-string key; paths with quotes, backslashes or control characters are refused. */
export function tomlKey(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/["\\\u0000-\u001f\u007f]/.test(value)) throw new Error(`cannot quote ${JSON.stringify(value)} as a Codex config key`);
  return `"${value}"`;
}

/** keyPath of config/value/write for the trust of a folder. */
export function trustKeyPath(folder: string): string {
  return `projects.${tomlKey(folder)}.trust_level`;
}

/** keyPath of config/value/write for the approval of one hook. */
export function hookTrustKeyPath(hookKey: string): string {
  return `hooks.state.${tomlKey(hookKey)}.trusted_hash`;
}

function decodeKey(raw: string): string | null {
  if (raw.startsWith("'")) return raw.slice(1, -1);
  try {
    return JSON.parse(raw) as string;
  } catch {
    return null;
  }
}

const KEY = String.raw`("(?:[^"\\]|\\.)*"|'[^']*')`;
const PROJECT_HEADER = new RegExp(String.raw`^\s*\[\s*projects\s*\.\s*${KEY}\s*\]\s*(?:#.*)?$`);
const ANY_HEADER = /^\s*\[/;
const TRUST_LINE = /^\s*trust_level\s*=\s*(?:"([^"]*)"|'([^']*)')/;
const DOTTED_TRUST = new RegExp(String.raw`^\s*${KEY}\s*\.\s*trust_level\s*=\s*(?:"([^"]*)"|'([^']*)')`);
const INLINE_TRUST = new RegExp(String.raw`^\s*${KEY}\s*=\s*\{[^}]*trust_level\s*=\s*(?:"([^"]*)"|'([^']*)')`);

/**
 * trust_level of a folder in config.toml text: `[projects."<path>"]` tables, dotted keys and
 * inline tables under `[projects]`. null when the folder has no entry.
 */
export function projectTrustLevel(text: string, folder: string): string | null {
  let table: string | null = null;
  let inProjects = false;
  let found: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const header = PROJECT_HEADER.exec(line);
    if (header) {
      table = decodeKey(header[1]!);
      inProjects = false;
      continue;
    }
    if (ANY_HEADER.test(line)) {
      table = null;
      inProjects = /^\s*\[\s*projects\s*\]/.test(line);
      continue;
    }
    if (table === folder) {
      const match = TRUST_LINE.exec(line);
      if (match) found = match[1] ?? match[2] ?? null;
    } else if (inProjects) {
      const match = DOTTED_TRUST.exec(line) ?? INLINE_TRUST.exec(line);
      if (match && decodeKey(match[1]!) === folder) found = match[2] ?? match[3] ?? null;
    }
  }
  return found;
}

/** A file's text with a cache keyed by mtime and size; null when the file is missing. */
export function cachedText(): (file: string) => Promise<string | null> {
  const cache = new Map<string, { mtimeMs: number; size: number; text: string }>();
  return async (file) => {
    let info;
    try {
      info = await stat(file);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return null;
      throw error;
    }
    const entry = cache.get(file);
    if (entry && entry.mtimeMs === info.mtimeMs && entry.size === info.size) return entry.text;
    const text = await readFile(file, 'utf8');
    cache.set(file, { mtimeMs: info.mtimeMs, size: info.size, text });
    return text;
  };
}

/** Daemon pid file contents: { pid, processStartTime, … }; null when missing or unreadable. */
export async function readDaemonPid(file: string): Promise<{ pid: number; startedAt: string | null; startMs: number | null } | null> {
  try {
    const value = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    const pid = value['pid'];
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return null;
    const started = value['processStartTime'];
    const identity = value['processIdentity'] as Record<string, unknown> | undefined;
    const seconds = identity && typeof identity['startSeconds'] === 'number' ? identity['startSeconds'] : null;
    return { pid, startedAt: typeof started === 'string' ? started : null, startMs: seconds === null ? null : seconds * 1000 };
  } catch {
    return null;
  }
}

/** True when a process with pid exists (EPERM counts: it exists but belongs to someone else). */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Last bytes of a text file ('' when missing). */
export async function readTail(file: string, maxBytes: number): Promise<string> {
  let handle;
  try {
    handle = await open(file, 'r');
  } catch {
    return '';
  }
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - maxBytes);
    const buffer = Buffer.alloc(size - start);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

/** The newest "401 / token expired" line of the daemon's stderr log, or null. */
export function tokenErrorLine(stderrTail: string): string | null {
  // eslint-disable-next-line no-control-regex
  const lines = stderrTail.replace(/\u001b\[[0-9;]*m/g, '').split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    // An MCP server's own 401 (rmcp transport) is about that server, not the ChatGPT login.
    if (/\brmcp::/.test(line)) continue;
    if (/\b401\b/.test(line) && /token|unauthori[sz]ed/i.test(line)) return line.trim().slice(0, 300);
    if (/token (?:has )?expired|refresh token/i.test(line)) return line.trim().slice(0, 300);
  }
  return null;
}

/** Thread names from session_index.jsonl ({ id, thread_name } per line, the last line wins). */
export function parseSessionIndex(text: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as Record<string, unknown>;
      if (typeof row['id'] === 'string' && typeof row['thread_name'] === 'string' && row['thread_name'] !== '') {
        names.set(row['id'], row['thread_name']);
      }
    } catch {
      // A broken line is skipped.
    }
  }
  return names;
}

/** What the Codex server says when another app-server of this installation holds remote control. */
export const ALREADY_ONLINE = 'Remote app server already online';

/**
 * The newest remote-control warning that process <pid> wrote to Codex's log database
 * (<home>/logs_<N>.sqlite, the newest N), read only; null when there is none or it cannot be read.
 */
export async function lastRemoteWarning(home: string, pid: number): Promise<string | null> {
  try {
    const names = (await readdir(home)).filter((name) => /^logs_\d+\.sqlite$/.test(name));
    const newest = names.sort((a, b) => Number(/\d+/.exec(b)![0]) - Number(/\d+/.exec(a)![0]))[0];
    if (!newest) return null;
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path.join(home, newest), { readOnly: true });
    try {
      const row = db
        .prepare("SELECT feedback_log_body AS body FROM logs WHERE process_uuid LIKE ? AND target LIKE '%remote_control%' AND level = 'WARN' ORDER BY ts DESC, ts_nanos DESC LIMIT 1")
        .get(`pid:${pid}:%`) as { body?: unknown } | undefined;
      return typeof row?.body === 'string' ? row.body : null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
