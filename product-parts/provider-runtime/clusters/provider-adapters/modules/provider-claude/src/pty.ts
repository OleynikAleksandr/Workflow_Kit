// The expect scripts (src/pty/*.exp) and the markers they print into their log files. Sessions and
// environments run under the process supervisor (own group, output to a file, no CLAUDE*, D5);
// the backend follows them by reading the log and, as a fallback, claude's debug file. The scripts
// never press keys in Claude's dialogs: they stop claude and print DIALOG <kind> (dialogs.tcl).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ProviderError } from '#provider-registry';
import { normalizeRemoteId } from './links.ts';

/** Paths of the expect scripts (both source dialogs.tcl from their own folder) and the Windows host. */
export interface PtyScripts {
  session: string;
  environment: string;
  /** ConPTY host with the same contract (pty/win-host.ts, spec M5 section 4.1). */
  host: string;
}

/** The scripts shipped with this module. */
export const PTY_SCRIPTS: PtyScripts = {
  session: fileURLToPath(new URL('./pty/session.exp', import.meta.url)),
  environment: fileURLToPath(new URL('./pty/environment.exp', import.meta.url)),
  host: fileURLToPath(new URL('./pty/win-host.ts', import.meta.url)),
};

/** How a session or environment script starts: expect on macOS and Linux, node + host on Windows. */
export type PtyLauncher = { kind: 'expect'; expect: string } | { kind: 'host'; node: string };

/** The command line of a script run: the same arguments for both launchers. */
export function ptyCommand(launcher: PtyLauncher, scripts: PtyScripts, kind: 'session' | 'environment', args: readonly string[]): { command: string; args: string[] } {
  if (launcher.kind === 'host') return { command: launcher.node, args: [scripts.host, kind, ...args] };
  return { command: launcher.expect, args: [scripts[kind], ...args] };
}

/** A dialog the scripts stopped on: trust, external imports, Claude's first run, or another one. */
export type DialogKind = 'trust' | 'imports' | 'onboarding' | 'unknown';

/** What a script has printed so far. */
export interface PtyMarkers {
  claudePid: number | null;
  /** session_<X> from SESSION_URL. */
  sessionId: string | null;
  noSessionUrl: boolean;
  /** ENV_READY or ENV_STARTED was printed. */
  envStarted: boolean;
  envId: string | null;
  /** DIALOG <kind>: claude showed a dialog and was stopped without a key pressed. */
  dialog: DialogKind | null;
  /** PROMO_DECLINED lines: feature offers answered "Not now" (spec M15). */
  offersDeclined: number;
  failure: 'not-trusted' | 'exited' | 'dialog' | null;
}

/** Parses the marker lines of a script log (the pty screen between them is ignored). */
export function parseMarkers(text: string): PtyMarkers {
  const line = (pattern: string): RegExpExecArray | null => new RegExp(`^${pattern}\\s*$`, 'm').exec(text);
  const pid = line('CLAUDE_PID (\\d+)');
  const session = line('SESSION_URL (session_[A-Za-z0-9]+)');
  const env = line('ENV_READY (\\S+)');
  const dialog = line('DIALOG (trust|imports|onboarding|unknown)');
  let failure: PtyMarkers['failure'] = null;
  if (dialog) failure = 'dialog';
  else if (line('(?:SESSION|ENV)_NOT_TRUSTED')) failure = 'not-trusted';
  else if (line('(?:SESSION|ENV)_EXITED')) failure = 'exited';
  return {
    claudePid: pid ? Number(pid[1]) : null,
    sessionId: session?.[1] ?? null,
    noSessionUrl: line('NO_SESSION_URL') !== null,
    envStarted: env !== null || line('ENV_STARTED') !== null,
    envId: env?.[1] ?? null,
    dialog: (dialog?.[1] as DialogKind | undefined) ?? null,
    offersDeclined: (text.match(/^PROMO_DECLINED \d+\s*$/gm) ?? []).length,
    failure,
  };
}

/** Error codes of the recognised dialogs. */
export const DIALOG_CODES: Readonly<Record<DialogKind, string>> = {
  trust: 'trust-dialog',
  imports: 'imports-dialog',
  onboarding: 'onboarding-dialog',
  unknown: 'unknown-dialog',
};

const DIALOG_TITLES: Readonly<Record<DialogKind, string>> = {
  trust: 'диалог доверия к папке',
  imports: 'диалог внешних импортов CLAUDE.md («Allow external CLAUDE.md file imports?»)',
  onboarding: 'экран первого запуска (выбор темы или вход)',
  unknown: 'неизвестный диалог',
};

/** The screen text a script saw before DIALOG (escape sequences removed, cursor moves as spaces). */
export function dialogText(log: string, lines = 16): string {
  const marker = /^DIALOG (?:trust|imports|onboarding|unknown)\s*$/m.exec(log);
  const screen = marker ? log.slice(0, marker.index) : log;
  const pid = /^CLAUDE_PID \d+\s*$/m.exec(screen);
  return logTail(pid ? screen.slice(pid.index + pid[0].length) : screen, lines);
}

/** The error of an operation stopped by a Claude dialog: the dialog text and where to resolve it. */
export function dialogError(kind: DialogKind, log: string, logFile: string): ProviderError {
  const text = dialogText(log);
  const message = `Claude показал ${DIALOG_TITLES[kind]}; Kit не нажимает клавиш в диалогах и остановил процесс.${text ? `\nТекст диалога:\n${text}` : ''}`;
  const hint =
    kind === 'unknown'
      ? `Решите это в предпросмотре доверия («Предпросмотр доверия…» → «Доверять»); если диалога там нет — запустите claude в папке вручную и ответьте сами. Журнал: ${logFile}`
      : `Решите это в предпросмотре доверия: «Предпросмотр доверия…» → выбор → «Доверять», затем повторите. Журнал: ${logFile}`;
  return new ProviderError(DIALOG_CODES[kind], message, { hint, details: { log: logFile, dialog: kind } });
}

/** session_<X> from claude's debug file ("Created session cse_<X>"); the latest one wins. */
export function debugSessionId(text: string): string | null {
  const all = [...text.matchAll(/Created session (cse_[A-Za-z0-9]+|session_[A-Za-z0-9]+)/g)];
  const last = all.at(-1);
  return last ? normalizeRemoteId(last[1]) : null;
}

/**
 * Removes terminal escape sequences and carriage returns from a pty log. Cursor-forward moves
 * (ESC [ n C), which Claude's UI prints instead of spaces, become spaces.
 */
export function stripAnsi(text: string): string {
  return text
    .replace(/\u001b\[(\d*)C/g, (_, n: string) => ' '.repeat(Math.min(Number(n || '1'), 200)))
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g, '').replace(/\r/g, '');
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
