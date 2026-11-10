// The Kimi Code app (spec M8, section 2.6): the link that opens a project in it and the check
// that the app is installed. Kimi has no link to one session, so a session links to its project.
// The link always opens the project with a new chat (spec M9 section 8.1); the start option
// --workspace=<folder> opens it as it is, so the service starts the app with it.
import { stat } from 'node:fs/promises';
import { cleanEnv } from '#process-supervisor';
import type { CommandRunner } from '#process-supervisor';
import { envValue, pathApi } from './paths.ts';

/** Start of the only link of the app Kit builds and opens. */
export const KIMI_LINK_PREFIX = 'kimi-code://open?';
/** Folder of the app on macOS. */
export const KIMI_APP_NAME = 'Kimi Code.app';
/** Registry keys of the kimi-code:// handler on Windows: of the user, then of the machine. */
export const KIMI_SCHEME_KEYS: readonly string[] = ['HKCU\\Software\\Classes\\kimi-code', 'HKCR\\kimi-code'];
/** MIME type of the kimi-code:// handler on Linux. */
export const KIMI_SCHEME_MIME = 'x-scheme-handler/kimi-code';
const LINK_LIMIT = 4096;
const CHECK_TIMEOUT_MS = 5000;

/** Link that opens a folder as a project of the app; fresh asks for a new session. */
export function kimiProjectLink(folder: string, fresh = false): string {
  return `${KIMI_LINK_PREFIX}root=${encodeURIComponent(folder)}${fresh ? '&new=1' : ''}`;
}

/** Parts of a project link; null for anything but one root and an optional new=1. */
export function parseKimiProjectLink(url: string): { root: string; fresh: boolean } | null {
  if (url.length > LINK_LIMIT || !url.startsWith(KIMI_LINK_PREFIX) || url.includes('#')) return null;
  const params = new URLSearchParams(url.slice(KIMI_LINK_PREFIX.length));
  const roots = params.getAll('root');
  const fresh = params.getAll('new');
  const root = roots[0];
  if (roots.length !== 1 || !root || fresh.length > 1 || (fresh.length === 1 && fresh[0] !== '1')) return null;
  if ([...params.keys()].length !== 1 + fresh.length) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(root)) return null;
  return { root, fresh: fresh.length === 1 };
}

/** Note of a session when the app is not installed: how to continue it in a terminal. */
export function resumeNote(sessionId: string): string {
  return `продолжить: \`kimi -S ${sessionId}\` в терминале проекта`;
}

/** Inputs of kimiAppFound. */
export interface KimiAppCheck {
  platform: NodeJS.Platform;
  env: Readonly<Record<string, string | undefined>>;
  homedir: string;
  runCommand: CommandRunner;
  /** macOS: folders searched for the app (default: /Applications and Applications of the user). */
  appFolders?: readonly string[];
}

/** A program and its arguments that open a project in the Kimi Code app. */
export interface KimiLaunch {
  command: string;
  args: string[];
}

// The output of a check program, or null when it failed, timed out or did not start.
async function output(check: KimiAppCheck, command: string, args: readonly string[]): Promise<string | null> {
  try {
    const result = await check.runCommand(command, args, { cwd: check.homedir, env: cleanEnv(check.env, { platform: check.platform }), timeoutMs: CHECK_TIMEOUT_MS });
    return !result.startError && !result.timedOut && result.code === 0 ? result.stdout : null;
  } catch {
    return null;
  }
}

const regProgram = (check: KimiAppCheck): string => pathApi(check.platform).join(envValue(check.env, 'SystemRoot', check.platform) || 'C:\\Windows', 'System32', 'reg.exe');

/** macOS: the folder of the app in /Applications or in Applications of the user, or null. */
async function appBundle(check: KimiAppCheck): Promise<string | null> {
  const api = pathApi(check.platform);
  for (const folder of check.appFolders ?? ['/Applications', api.join(check.homedir, 'Applications')]) {
    const bundle = api.join(folder, KIMI_APP_NAME);
    if (await stat(bundle).then((entry) => entry.isDirectory(), () => false)) return bundle;
  }
  return null;
}

/**
 * The program of a `reg query <key> /ve` answer: the default value of shell\open\command,
 * `"C:\...\Kimi Code.exe" "%1"`; %VARIABLES% are expanded. Null when it is not an .exe.
 */
export function parseHandlerProgram(answer: string, env: Readonly<Record<string, string | undefined>>): string | null {
  const line = answer.split(/\r?\n/).find((item) => /\sREG_(?:EXPAND_)?SZ\s/.test(item));
  const value = line?.replace(/^.*?\sREG_(?:EXPAND_)?SZ\s+/, '').trim() ?? '';
  const quoted = /^"([^"]+)"/.exec(value);
  const bare = /^(.+?\.exe)\b/i.exec(value);
  const program = (quoted?.[1] ?? bare?.[1] ?? '').replace(/%([^%]+)%/g, (all, name: string) => envValue(env, name, 'win32') ?? all);
  return /\.exe$/i.test(program) && !program.includes('%') ? program : null;
}

/**
 * True when the Kimi Code app is installed: its folder on macOS, the handler of kimi-code://
 * in the registry on Windows and in the MIME database elsewhere. Never throws.
 */
export async function kimiAppFound(check: KimiAppCheck): Promise<boolean> {
  const { platform } = check;
  if (platform === 'darwin') return (await appBundle(check)) !== null;
  if (platform === 'win32') {
    for (const key of KIMI_SCHEME_KEYS) if ((await output(check, regProgram(check), ['query', key])) !== null) return true;
    return false;
  }
  return ((await output(check, 'xdg-mime', ['query', 'default', KIMI_SCHEME_MIME])) ?? '').trim() !== '';
}

const psQuote = (text: string): string => `'${text.replace(/'/g, "''")}'`;

/**
 * The start of the app that opens `folder` as it is, without a new chat (spec M9 8.1): the app
 * runs once per machine and takes the option from this second start. macOS: open -n -a with the
 * bundle; Windows: Start-Process of the program of the kimi-code handler (it does not wait for
 * the app); elsewhere (no app for Linux) null — the caller opens the link. Never throws.
 */
export async function kimiWorkspaceCommand(check: KimiAppCheck, folder: string): Promise<KimiLaunch | null> {
  const { platform } = check;
  const option = `--workspace=${folder}`;
  if (platform === 'darwin') {
    const bundle = await appBundle(check);
    return bundle ? { command: 'open', args: ['-n', '-a', bundle, '--args', option] } : null;
  }
  if (platform !== 'win32') return null;
  for (const key of KIMI_SCHEME_KEYS) {
    const answer = await output(check, regProgram(check), ['query', `${key}\\shell\\open\\command`, '/ve']);
    const program = answer === null ? null : parseHandlerProgram(answer, check.env);
    if (!program) continue;
    const system32 = pathApi(platform).join(envValue(check.env, 'SystemRoot', platform) || 'C:\\Windows', 'System32');
    // The app strips the quotes around the folder of --workspace="…".
    const script = `Start-Process -FilePath ${psQuote(program)} -ArgumentList ${psQuote(`--workspace="${folder}"`)}`;
    return { command: pathApi(platform).join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe'), args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script] };
  }
  return null;
}
