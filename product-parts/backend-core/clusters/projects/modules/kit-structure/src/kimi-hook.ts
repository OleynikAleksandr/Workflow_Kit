// The Kit hook of Kimi Code (spec M8 section 2.3, protocol sections 5 and 8). Kimi has user-wide
// hooks only: blocks [[hooks]] of <home>/config.toml, and it runs each command through the shell
// of the OS — /bin/sh -c on macOS and Linux, cmd.exe /d /s /c on Windows. So the command is a
// shell line here: the POSIX line of the other clients, and on Windows the quoted absolute
// node.exe and launcher script. provider-kimi owns the file; this file owns the text of the blocks.
import { callsLauncher } from './hook-config.ts';
import type { HookHost } from './hook-host.ts';

/** Value of --client in the hooks of Kimi. */
export const KIMI_HOOK_CLIENT = 'kimi';
/** Seconds a hook of Kimi may take (the turn end is only reported, nothing waits in it). */
export const KIMI_HOOK_TIMEOUT_S = 30;
/** Comment line above the blocks of Kit in config.toml. */
export const KIMI_HOOKS_MARKER = '# Workflow Kit';

/** Hook events of Kimi that Kit listens to, in the order they are written, with their subcommand. */
export const KIMI_HOOK_EVENTS: ReadonlyArray<{ event: string; subcommand: string }> = [
  { event: 'SessionStart', subcommand: 'session-start' },
  { event: 'UserPromptSubmit', subcommand: 'prompt' },
  { event: 'Stop', subcommand: 'turn-end' },
  { event: 'StopFailure', subcommand: 'turn-end' },
  { event: 'Interrupt', subcommand: 'turn-end' },
];

/** One [[hooks]] block of Kit. */
export interface KimiHookBlock {
  event: string;
  command: string;
  timeout: number;
}

/** The blocks Kit writes, or the reason why no command can be written for this machine. */
export type KimiHookPlan = { ok: true; blocks: KimiHookBlock[] } | { ok: false; reason: string };

/** Why a Windows path cannot stand inside a quoted cmd.exe argument; null when it can. */
function unquotable(name: string, file: string): string | null {
  if (file === '') return `не известен путь: ${name}`;
  const bad = file.includes('"') ? 'кавычку' : file.includes('%') ? 'знак %' : /[\r\n]/.test(file) ? 'перевод строки' : null;
  return bad ? `путь «${file}» (${name}) содержит ${bad}: cmd.exe не выполнит такую команду` : null;
}

/** The shell line of a hook: POSIX on macOS and Linux, quoted absolute paths for cmd.exe on Windows. */
export function kimiHookCommand(subcommand: string, host: HookHost): string {
  const tail = `hook ${subcommand} --client ${KIMI_HOOK_CLIENT}`;
  if (host.platform === 'win32') return `"${host.node}" "${host.launcher}" ${tail}`;
  return `[ -x "$HOME/.local/bin/wfk" ] && "$HOME/.local/bin/wfk" ${tail}; exit 0`;
}

/** The five blocks of Kit for a machine. */
export function kimiHookBlocks(host: HookHost): KimiHookPlan {
  if (host.platform === 'win32') {
    const reason = unquotable('node.exe', host.node) ?? unquotable('wfk.mjs', host.launcher);
    if (reason) return { ok: false, reason };
  }
  return { ok: true, blocks: KIMI_HOOK_EVENTS.map(({ event, subcommand }) => ({ event, command: kimiHookCommand(subcommand, host), timeout: KIMI_HOOK_TIMEOUT_S })) };
}

/** A TOML string: literal in single quotes; with an apostrophe inside, basic with \ and " escaped. */
export function tomlString(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** The text Kit adds to config.toml: the marker comment and the blocks, each line ended by eol. */
export function kimiHooksSection(blocks: readonly KimiHookBlock[], eol = '\n'): string {
  const texts = blocks.map((block) => ['[[hooks]]', `event = "${block.event}"`, `command = ${tomlString(block.command)}`, `timeout = ${block.timeout}`].join(eol) + eol);
  return KIMI_HOOKS_MARKER + eol + texts.join(eol);
}

/** True for a hook command of Kimi that calls the Kit launcher (any event, any edit around it). */
export function isKimiKitCommand(command: unknown): boolean {
  return typeof command === 'string' && callsLauncher(command) && command.includes(`--client ${KIMI_HOOK_CLIENT}`);
}
