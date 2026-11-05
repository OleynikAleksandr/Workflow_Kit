// The expect scripts (src/pty/*.exp) and the markers they print into their log files. Sessions and
// environments run under the process supervisor (own group, output to a file, no CLAUDE*, D5);
// the backend follows them by reading the log and, as a fallback, claude's debug file.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizeRemoteId } from './links.ts';

/** Paths of the expect scripts. */
export interface PtyScripts {
  session: string;
  environment: string;
  trust: string;
}

/** The scripts shipped with this module. */
export const PTY_SCRIPTS: PtyScripts = {
  session: fileURLToPath(new URL('./pty/session.exp', import.meta.url)),
  environment: fileURLToPath(new URL('./pty/environment.exp', import.meta.url)),
  trust: fileURLToPath(new URL('./pty/trust.exp', import.meta.url)),
};

/** What a script has printed so far. */
export interface PtyMarkers {
  claudePid: number | null;
  /** session_<X> from SESSION_URL. */
  sessionId: string | null;
  noSessionUrl: boolean;
  /** ENV_READY or ENV_STARTED was printed. */
  envStarted: boolean;
  envId: string | null;
  trustDone: boolean;
  /** not-trusted, exited or failed (no trust dialog). */
  failure: 'not-trusted' | 'exited' | 'failed' | null;
}

/** Parses the marker lines of a script log (the pty screen between them is ignored). */
export function parseMarkers(text: string): PtyMarkers {
  const line = (pattern: string): RegExpExecArray | null => new RegExp(`^${pattern}\\s*$`, 'm').exec(text);
  const pid = line('CLAUDE_PID (\\d+)');
  const session = line('SESSION_URL (session_[A-Za-z0-9]+)');
  const env = line('ENV_READY (\\S+)');
  let failure: PtyMarkers['failure'] = null;
  if (line('(?:SESSION|ENV)_NOT_TRUSTED')) failure = 'not-trusted';
  else if (line('(?:SESSION|ENV|TRUST)_EXITED')) failure = 'exited';
  else if (line('TRUST_FAILED.*')) failure = 'failed';
  return {
    claudePid: pid ? Number(pid[1]) : null,
    sessionId: session?.[1] ?? null,
    noSessionUrl: line('NO_SESSION_URL') !== null,
    envStarted: env !== null || line('ENV_STARTED') !== null,
    envId: env?.[1] ?? null,
    trustDone: line('TRUST_DONE') !== null,
    failure,
  };
}

/** session_<X> from claude's debug file ("Created session cse_<X>"); the latest one wins. */
export function debugSessionId(text: string): string | null {
  const all = [...text.matchAll(/Created session (cse_[A-Za-z0-9]+|session_[A-Za-z0-9]+)/g)];
  const last = all.at(-1);
  return last ? normalizeRemoteId(last[1]) : null;
}

/** Removes terminal escape sequences and carriage returns from a pty log. */
export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g, '').replace(/\r/g, '');
}

/** The last non-empty lines of a log, without escape sequences (for error messages). */
export function logTail(text: string, lines = 8): string {
  return stripAnsi(text)
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')
    .slice(-lines)
    .join('\n');
}

/** Reads a text file; '' when it does not exist yet. */
export async function readText(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return '';
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls probe until it returns a value or the deadline passes (then undefined). */
export async function poll<T>(probe: () => Promise<T | undefined>, options: { timeoutMs: number; pollMs: number }): Promise<T | undefined> {
  const deadline = Date.now() + options.timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() >= deadline) return undefined;
    await sleep(options.pollMs);
  }
}
