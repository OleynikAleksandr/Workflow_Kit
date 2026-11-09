// Read-only view of ~/.claude.json: trust per folder (projects["<path>"].hasTrustDialogAccepted), the
// external-imports decision of a folder, the nearest trusted parent folder and whether an account is
// signed in. The file is re-parsed only when its mtime or size changes (D11). Writing lives in
// config-writer.ts and runs only from grantTrust.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { TrustState } from '#provider-registry';
import { folderKey } from './folder-key.ts';

/** Keys of a project entry Kit reads and writes. */
export const TRUST_KEY = 'hasTrustDialogAccepted';
export const IMPORTS_APPROVED_KEY = 'hasClaudeMdExternalIncludesApproved';
export const IMPORTS_SHOWN_KEY = 'hasClaudeMdExternalIncludesWarningShown';

/** Note of a folder whose parent is trusted while the folder itself is not. */
export const INHERITED_NOTE = 'интерактивный Claude не спросит, Remote Control требует доверия папки';

/** What Kit knows about one projects["<path>"] entry. */
export interface ProjectEntry {
  trusted: boolean;
  /** hasClaudeMdExternalIncludesApproved; null when the key is absent. */
  importsApproved: boolean | null;
  /** hasClaudeMdExternalIncludesWarningShown: the external-imports question was answered. */
  importsDecided: boolean;
}

/** What the provider needs from ~/.claude.json. */
export interface ClaudeConfigSnapshot {
  file: string;
  exists: boolean;
  /** Parse error text; trust is unknown while it is set. */
  error: string | null;
  /** Folders with hasTrustDialogAccepted === true. */
  trusted: ReadonlySet<string>;
  /** Every projects entry by its exact key. */
  projects: ReadonlyMap<string, ProjectEntry>;
  /** True when oauthAccount is present; null when the file is missing or broken. */
  loggedIn: boolean | null;
}

/** Cached reader of one ~/.claude.json. */
export interface ClaudeConfigReader {
  readonly file: string;
  /** Cached by mtime and size. */
  read(): Promise<ClaudeConfigSnapshot>;
  /** Trust of a folder by its exact key (null when the file cannot be read), with a trusted parent. */
  trustOf(folder: string): Promise<TrustState>;
}

/** Path of ~/.claude.json for a home folder. */
export function claudeConfigFile(homedir: string): string {
  return path.join(homedir, '.claude.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function emptySnapshot(file: string, exists: boolean, error: string | null): ClaudeConfigSnapshot {
  return { file, exists, error, trusted: new Set(), projects: new Map(), loggedIn: null };
}

/** Extracts the snapshot from the file text (tolerant to unknown fields, R1). */
export function parseClaudeConfig(file: string, text: string): ClaudeConfigSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return emptySnapshot(file, true, `не читается как JSON: ${(error as Error).message}`);
  }
  if (!isRecord(value)) return emptySnapshot(file, true, 'ожидается JSON-объект');
  const trusted = new Set<string>();
  const projects = new Map<string, ProjectEntry>();
  const entries = value['projects'];
  if (isRecord(entries)) {
    for (const [folder, entry] of Object.entries(entries)) {
      if (!isRecord(entry)) continue;
      const approved = entry[IMPORTS_APPROVED_KEY];
      projects.set(folderKey(folder), {
        trusted: entry[TRUST_KEY] === true,
        importsApproved: typeof approved === 'boolean' ? approved : null,
        importsDecided: entry[IMPORTS_SHOWN_KEY] === true,
      });
      if (entry[TRUST_KEY] === true) trusted.add(folderKey(folder));
    }
  }
  return { file, exists: true, error: null, trusted, projects, loggedIn: isRecord(value['oauthAccount']) };
}

/** The nearest trusted parent of a folder (the interactive trust check of Claude walks up to /). */
export function trustedParent(snapshot: ClaudeConfigSnapshot, folder: string): string | null {
  let current = path.resolve(folder);
  for (;;) {
    const parent = path.dirname(current);
    if (parent === current) return null;
    if (snapshot.trusted.has(folderKey(parent))) return parent;
    current = parent;
  }
}

/** Trust of a folder from a snapshot: only the exact key counts; a trusted parent is a separate mark. */
export function trustFromSnapshot(snapshot: ClaudeConfigSnapshot, folder: string): TrustState {
  const { file } = snapshot;
  if (!snapshot.exists) return { trusted: false, note: `${file} ещё нет: Claude Code не запускался` };
  if (snapshot.error) return { trusted: null, note: `${file}: ${snapshot.error}` };
  if (snapshot.trusted.has(folderKey(folder))) return { trusted: true };
  const parent = trustedParent(snapshot, folder);
  return parent ? { trusted: false, inherited: { from: parent, note: INHERITED_NOTE } } : { trusted: false };
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
        return emptySnapshot(file, false, null);
      }
      if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.snapshot;
      const snapshot = parseClaudeConfig(file, await readFile(file, 'utf8'));
      cached = { mtimeMs: info.mtimeMs, size: info.size, snapshot };
      return snapshot;
    },
    async trustOf(folder) {
      return trustFromSnapshot(await reader.read(), folder);
    },
  };
  return reader;
}
