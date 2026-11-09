// Where Kit hooks run on this machine (spec M5 section 6). On macOS and Linux the hook is the POSIX
// command of templates.ts (unchanged). On Windows there is no sh: the Claude hook uses the exec
// form (node.exe + the launcher script, no shell) and the Codex hook gets commandWindows, which
// Codex runs with PowerShell. Both call the stable launcher script wfk.mjs next to wfk.cmd in
// %LOCALAPPDATA%\Workflow Kit, which install (or wfk link) points at the current copy, so hooks do
// not change when the app is updated.
import os from 'node:os';
import path from 'node:path';
import type { HookClient } from './templates.ts';

/** The machine the hooks are written for. */
export interface HookHost {
  platform: NodeJS.Platform;
  /** Absolute node.exe (Windows only). */
  node: string;
  /** Absolute launcher script wfk.mjs (Windows only). */
  launcher: string;
}

/** Name of the launcher script that hooks run on Windows. */
export const WINDOWS_HOOK_LAUNCHER = 'wfk.mjs';

/** The host of this process: the node of the service and %LOCALAPPDATA%\Workflow Kit\wfk.mjs. */
export function defaultHookHost(
  env: Readonly<Record<string, string | undefined>> = process.env,
  homedir: string = os.homedir(),
  platform: NodeJS.Platform = process.platform,
  node: string = process.execPath,
): HookHost {
  if (platform !== 'win32') return { platform, node, launcher: '' };
  // Not WFK_DATA_DIR: like ~/.local/bin/wfk on macOS, hooks always call the installed launcher.
  const local = env['LOCALAPPDATA'] || path.win32.join(homedir, 'AppData', 'Local');
  return { platform, node, launcher: path.win32.join(local, 'Workflow Kit', WINDOWS_HOOK_LAUNCHER) };
}

/** Windows paths with forward slashes: hook runners lose backslashes (Claude Code #108050). */
export function forwardSlashes(file: string): string {
  return file.replace(/\\/g, '/');
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Arguments of the launcher for a hook: hook <subcommand> --client <client>. */
export function hookArgs(subcommand: string, client: HookClient): string[] {
  return ['hook', subcommand, '--client', client];
}

/**
 * PowerShell command of a Codex hook on Windows: the hook input is read as UTF-8 and piped to
 * node explicitly (PowerShell does not pass its stdin to a native child by itself); always exit 0.
 */
export function powershellHookCommand(host: HookHost, subcommand: string, client: HookClient): string {
  const utf8 = '[Text.UTF8Encoding]::new($false)';
  return [
    `[Console]::InputEncoding=${utf8}`,
    `[Console]::OutputEncoding=${utf8}`,
    `$OutputEncoding=${utf8}`,
    `[Console]::In.ReadToEnd() | & ${psQuote(forwardSlashes(host.node))} ${psQuote(forwardSlashes(host.launcher))} ${hookArgs(subcommand, client).join(' ')}`,
    'exit 0',
  ].join('; ');
}

/** All command text of a hook entry (command, args, commandWindows) for recognition and display. */
export function hookText(hook: Readonly<Record<string, unknown>>): string {
  const args = Array.isArray(hook['args']) ? hook['args'].filter((a): a is string => typeof a === 'string') : [];
  const parts = [hook['command'], ...args, hook['commandWindows']].filter((p): p is string => typeof p === 'string');
  return parts.join(' ');
}
