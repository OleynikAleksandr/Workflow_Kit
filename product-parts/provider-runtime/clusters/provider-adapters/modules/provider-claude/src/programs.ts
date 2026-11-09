// Locating `claude` and `expect` (D12) and deciding which capabilities this machine has (D4):
// the OS, the presence of expect and the claude version. Only files are inspected here; the
// version comes from `claude --version`, which runs at service start and on refresh (D11).
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Capabilities } from '#provider-registry';

/** Oldest claude known to have `--remote-control` and `remote-control --spawn` (checked on 2.1.x). */
export const MIN_CLAUDE_VERSION = '2.1.0';

/** Paths of the external programs the provider needs. */
export interface ClaudePrograms {
  claude: string | null;
  expect: string | null;
}

async function executable(file: string): Promise<boolean> {
  try {
    if (!(await stat(file)).isFile()) return false;
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Finds a program: the path saved by `install` (config.json programs, D12) first, then PATH of
 * the service environment, then the extra directories. Returns an absolute path or null.
 */
export async function findProgram(
  name: string,
  options: { configured?: string | undefined; env: Readonly<Record<string, string | undefined>>; extraDirs?: readonly string[] },
): Promise<string | null> {
  if (options.configured && path.isAbsolute(options.configured) && (await executable(options.configured))) return options.configured;
  const dirs = [...(options.env['PATH'] ?? '').split(path.delimiter), ...(options.extraDirs ?? [])];
  for (const dir of dirs) {
    if (!dir || !path.isAbsolute(dir)) continue;
    const candidate = path.join(dir, name);
    if (await executable(candidate)) return candidate;
  }
  return null;
}

/** Locates claude and expect for a home folder and service environment. */
export async function findClaudePrograms(input: {
  programs: Readonly<Record<string, string>>;
  env: Readonly<Record<string, string | undefined>>;
  homedir: string;
  platform: NodeJS.Platform;
}): Promise<ClaudePrograms> {
  const claudeName = input.platform === 'win32' ? 'claude.exe' : 'claude';
  const claude = await findProgram(claudeName, {
    configured: input.programs['claude'],
    env: input.env,
    extraDirs: [path.join(input.homedir, '.local', 'bin'), path.join(input.homedir, '.claude', 'local')],
  });
  const expect =
    input.platform === 'win32' ? null : await findProgram('expect', { configured: input.programs['expect'], env: input.env, extraDirs: ['/usr/bin'] });
  return { claude, expect };
}

/** "2.1.318 (Claude Code)" → "2.1.318"; null when no version is found. */
export function parseVersion(output: string): string | null {
  return /(\d+\.\d+\.\d+)/.exec(output)?.[1] ?? null;
}

/** Compares dotted versions numerically: negative, zero or positive. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Why writing trust is unavailable (it needs no pty: Kit writes ~/.claude.json itself); null when available. */
export function trustUnavailableReason(platform: NodeJS.Platform, programs: ClaudePrograms): string | null {
  if (platform === 'win32') return 'Windows: Claude пока не поддерживается (Q1)';
  if (!programs.claude) return 'claude не найден: установите Claude Code или укажите путь в config.json → programs.claude';
  return null;
}

/** Why pty-based actions (sessions, environment) are unavailable; null when they are available. */
export function ptyUnavailableReason(platform: NodeJS.Platform, programs: ClaudePrograms, version: string | null): string | null {
  if (platform === 'win32') return 'Windows: pty для Claude пока не поддерживается (Q1)';
  if (!programs.claude) return 'claude не найден: установите Claude Code или укажите путь в config.json → programs.claude';
  if (!programs.expect) {
    return platform === 'linux' ? 'нет expect: установите пакет expect (например, sudo apt install expect)' : 'нет expect: программа expect не найдена';
  }
  if (version && compareVersions(version, MIN_CLAUDE_VERSION) < 0) {
    return `claude ${version} старее ${MIN_CLAUDE_VERSION}: обновите Claude Code (claude update)`;
  }
  return null;
}

/** Capabilities of the Claude provider on this machine. */
export function claudeCapabilities(platform: NodeJS.Platform, programs: ClaudePrograms, version: string | null): Capabilities {
  const reason = ptyUnavailableReason(platform, programs, version);
  const pty = reason ? { available: false, reason } : { available: true };
  const stop = platform === 'win32' ? { available: false, reason: 'Windows: процессы сессий не поддерживаются' } : { available: true };
  const trustReason = trustUnavailableReason(platform, programs);
  return {
    trust: trustReason ? { available: false, reason: trustReason } : { available: true },
    hooks: { available: true },
    sessions: { available: true },
    createSession: { ...pty },
    resumeSession: { ...pty },
    stopSession: stop,
    environment: { ...pty },
  };
}
