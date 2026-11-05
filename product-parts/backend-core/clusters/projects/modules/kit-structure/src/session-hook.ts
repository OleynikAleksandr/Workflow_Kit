// Receiving the SessionStart hook (wfk hook session-start): one JSON line per session start in
// <project>/.workflow-kit/local/sessions.jsonl. Never throws for bad input and never prints.
import { appendFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { MANIFEST_PATH } from './structure.ts';
import { HOOK_CLIENTS } from './templates.ts';
import type { HookClient } from './templates.ts';

/** Journal of the hook relative to the project root (git-ignored through .workflow-kit/local/). */
export const SESSIONS_JOURNAL_PATH = '.workflow-kit/local/sessions.jsonl';

/** Environment variable that marks sessions started by Kit itself (e.g. the trust dialog). */
export const SERVICE_SESSION_ENV = 'WFK_SERVICE_SESSION';

/** Longest string value kept from the hook input. */
const MAX_FIELD_LENGTH = 4096;

/** Fields copied from the hook input into the journal. */
const INPUT_FIELDS = ['session_id', 'transcript_path', 'cwd', 'source', 'model', 'permission_mode'] as const;

/** One line of sessions.jsonl. */
export interface SessionStartRecord {
  time: string;
  client: HookClient;
  session_id: string | null;
  transcript_path: string | null;
  cwd: string | null;
  source: string | null;
  model: string | null;
  permission_mode: string | null;
  /** Value of WFK_SERVICE_SESSION: such sessions are Kit's own and are hidden from session lists. */
  service: string | null;
}

/** Inputs of recordSessionStart; everything comes from the hook process. */
export interface SessionStartInput {
  client: string | undefined;
  /** Raw stdin of the hook (JSON from Claude or Codex); invalid JSON is tolerated. */
  stdin: string;
  env: Readonly<Record<string, string | undefined>>;
  /** Working directory of the hook process. */
  cwd: string;
  now?: () => Date;
}

/** What the hook did; used by tests and debug output only. */
export type SessionStartResult = { recorded: true; file: string; record: SessionStartRecord } | { recorded: false; reason: string };

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.length > MAX_FIELD_LENGTH ? value.slice(0, MAX_FIELD_LENGTH) : value;
}

function parseInput(stdin: string): Record<string, unknown> {
  try {
    const value = JSON.parse(stdin) as unknown;
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Walks up from start to the nearest folder with a Kit manifest; undefined when there is none. */
export async function findProjectRoot(start: string): Promise<string | undefined> {
  let current = path.resolve(start);
  for (;;) {
    const found = await stat(path.join(current, ...MANIFEST_PATH.split('/'))).then(
      (info) => info.isFile(),
      () => false,
    );
    if (found) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/**
 * Appends one line for a SessionStart event. The project is $CLAUDE_PROJECT_DIR or the nearest
 * folder with a Kit manifest above the session cwd (or the process cwd).
 */
export async function recordSessionStart(input: SessionStartInput): Promise<SessionStartResult> {
  const client = HOOK_CLIENTS.find((c) => c === input.client);
  if (!client) return { recorded: false, reason: `unknown client: ${String(input.client)}` };
  const payload = parseInput(input.stdin);
  const payloadCwd = text(payload['cwd']);
  const starts = [input.env['CLAUDE_PROJECT_DIR'], payloadCwd, input.cwd].filter(
    (value): value is string => typeof value === 'string' && path.isAbsolute(value),
  );
  let root: string | undefined;
  for (const start of starts) {
    root = await findProjectRoot(start);
    if (root) break;
  }
  if (!root) return { recorded: false, reason: 'no Workflow Kit project above the session folder' };
  const record: SessionStartRecord = {
    time: (input.now ?? (() => new Date()))().toISOString(),
    client,
    session_id: null,
    transcript_path: null,
    cwd: null,
    source: null,
    model: null,
    permission_mode: null,
    service: text(input.env[SERVICE_SESSION_ENV]) || null,
  };
  for (const field of INPUT_FIELDS) record[field] = text(payload[field]);
  const file = path.join(root, ...SESSIONS_JOURNAL_PATH.split('/'));
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  // A single write of one short line with O_APPEND does not interleave with other hooks.
  await appendFile(file, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
  return { recorded: true, file, record };
}
