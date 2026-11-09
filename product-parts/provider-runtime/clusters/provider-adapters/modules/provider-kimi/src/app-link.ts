// The Kimi Code app (spec M8, section 2.6): the link that opens a project in it and the check
// that the app is installed. Kimi has no link to one session, so a session links to its project.
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

/**
 * True when the Kimi Code app is installed: its folder on macOS, the handler of kimi-code://
 * in the registry on Windows and in the MIME database elsewhere. Never throws.
 */
export async function kimiAppFound(check: KimiAppCheck): Promise<boolean> {
  const { platform } = check;
  const api = pathApi(platform);
  if (platform === 'darwin') {
    for (const folder of check.appFolders ?? ['/Applications', api.join(check.homedir, 'Applications')]) {
      const found = await stat(api.join(folder, KIMI_APP_NAME)).then(
        (entry) => entry.isDirectory(),
        () => false,
      );
      if (found) return true;
    }
    return false;
  }
  const run = async (command: string, args: readonly string[]): Promise<string | null> => {
    try {
      const result = await check.runCommand(command, args, { cwd: check.homedir, env: cleanEnv(check.env, { platform }), timeoutMs: CHECK_TIMEOUT_MS });
      return !result.startError && !result.timedOut && result.code === 0 ? result.stdout : null;
    } catch {
      return null;
    }
  };
  if (platform === 'win32') {
    const reg = api.join(envValue(check.env, 'SystemRoot', platform) || 'C:\\Windows', 'System32', 'reg.exe');
    for (const key of KIMI_SCHEME_KEYS) if ((await run(reg, ['query', key])) !== null) return true;
    return false;
  }
  return ((await run('xdg-mime', ['query', 'default', KIMI_SCHEME_MIME])) ?? '').trim() !== '';
}
