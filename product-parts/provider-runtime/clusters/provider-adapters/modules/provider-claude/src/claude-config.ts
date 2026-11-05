// Read-only view of ~/.claude.json: trust per folder (projects["<path>"].hasTrustDialogAccepted)
// and whether an account is signed in. The file is re-parsed only when its mtime or size changes
// (D11); Kit never writes it itself, claude does during the trust dialog.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** What the provider needs from ~/.claude.json. */
export interface ClaudeConfigSnapshot {
  file: string;
  exists: boolean;
  /** Parse error text; trust is unknown while it is set. */
  error: string | null;
  /** Folders with hasTrustDialogAccepted === true. */
  trusted: ReadonlySet<string>;
  /** True when oauthAccount is present; null when the file is missing or broken. */
  loggedIn: boolean | null;
}

/** Cached reader of one ~/.claude.json. */
export interface ClaudeConfigReader {
  readonly file: string;
  /** Cached by mtime and size. */
  read(): Promise<ClaudeConfigSnapshot>;
  /** Trust of a folder: true, false, or null when the file cannot be read. */
  trustOf(folder: string): Promise<{ trusted: boolean | null; note?: string }>;
}

/** Path of ~/.claude.json for a home folder. */
export function claudeConfigFile(homedir: string): string {
  return path.join(homedir, '.claude.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extracts the snapshot from the file text (tolerant to unknown fields, R1). */
export function parseClaudeConfig(file: string, text: string): ClaudeConfigSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { file, exists: true, error: `не читается как JSON: ${(error as Error).message}`, trusted: new Set(), loggedIn: null };
  }
  if (!isRecord(value)) return { file, exists: true, error: 'ожидается JSON-объект', trusted: new Set(), loggedIn: null };
  const trusted = new Set<string>();
  const projects = value['projects'];
  if (isRecord(projects)) {
    for (const [folder, entry] of Object.entries(projects)) {
      if (isRecord(entry) && entry['hasTrustDialogAccepted'] === true) trusted.add(folder);
    }
  }
  return { file, exists: true, error: null, trusted, loggedIn: isRecord(value['oauthAccount']) };
}

/** Creates a cached reader of the given file. */
export function createClaudeConfigReader(file: string): ClaudeConfigReader {
  let cached: { mtimeMs: number; size: number; snapshot: ClaudeConfigSnapshot } | undefined;
  const reader: ClaudeConfigReader = {
    file,
    async read() {
      let info;
      try {
        info = await stat(file);
      } catch {
        cached = undefined;
        return { file, exists: false, error: null, trusted: new Set(), loggedIn: null };
      }
      if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.snapshot;
      const snapshot = parseClaudeConfig(file, await readFile(file, 'utf8'));
      cached = { mtimeMs: info.mtimeMs, size: info.size, snapshot };
      return snapshot;
    },
    async trustOf(folder) {
      const snapshot = await reader.read();
      if (!snapshot.exists) return { trusted: false, note: `${file} ещё нет: Claude Code не запускался` };
      if (snapshot.error) return { trusted: null, note: `${file}: ${snapshot.error}` };
      return { trusted: snapshot.trusted.has(folder) };
    },
  };
  return reader;
}
