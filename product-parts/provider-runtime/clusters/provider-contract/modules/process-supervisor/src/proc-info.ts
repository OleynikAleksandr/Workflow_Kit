// Identity of a process for D9: start time, command line and process group as reported by `ps`,
// and the boot id of the machine. A pid alone is never trusted: it may be reused after an exit
// or a reboot.
import { readFile } from 'node:fs/promises';
import { runCommand } from './command.ts';
import type { CommandRunner } from './command.ts';

/** What the system reports about a live process. */
export interface ProcessInfo {
  pid: number;
  /** Process group id; null when unknown. */
  pgid: number | null;
  /** Start time as printed by `ps -o lstart` (spaces collapsed): compared verbatim. */
  startToken: string;
  /** Start time as ISO text (second precision); null when it cannot be parsed. */
  startedAt: string | null;
  /** Full command line (`ps -ww -o args`). */
  commandLine: string;
}

/** Reads the identity of a process; undefined when it does not exist or cannot be inspected. */
export type ProcessInspector = (pid: number) => Promise<ProcessInfo | undefined>;

/** Reads the boot id of the machine; null when the platform gives none. */
export type BootIdReader = () => Promise<string | null>;

const PS_LINE = /^\s*(\d+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.*)$/s;

/** Parses one line of `ps -o pgid= -o lstart= -o args=`; undefined for anything else. */
export function parsePsLine(pid: number, line: string): ProcessInfo | undefined {
  const match = PS_LINE.exec(line.replace(/\n+$/, ''));
  if (!match) return undefined;
  const startToken = match[2]!.replace(/\s+/g, ' ');
  const parsed = Date.parse(startToken);
  return {
    pid,
    pgid: Number(match[1]),
    startToken,
    startedAt: Number.isNaN(parsed) ? null : new Date(parsed).toISOString(),
    commandLine: match[3]!.trim(),
  };
}

/** Process inspector based on `ps` (macOS, Linux); on Windows every process is unverifiable. */
export function psInspector(options: { platform?: NodeJS.Platform; run?: CommandRunner } = {}): ProcessInspector {
  const platform = options.platform ?? process.platform;
  const run = options.run ?? runCommand;
  return async (pid) => {
    if (platform === 'win32' || !Number.isSafeInteger(pid) || pid <= 0) return undefined;
    const result = await run('ps', ['-ww', '-o', 'pgid=', '-o', 'lstart=', '-o', 'args=', '-p', String(pid)], {
      env: { PATH: '/bin:/usr/bin:/usr/sbin:/sbin', LC_ALL: 'C', LANG: 'C' },
      timeoutMs: 5000,
    });
    if (result.code !== 0) return undefined;
    const line = result.stdout.split('\n').find((l) => l.trim() !== '');
    return line === undefined ? undefined : parsePsLine(pid, line);
  };
}

/** Boot id reader: Linux /proc/sys/kernel/random/boot_id, macOS kern.boottime; null elsewhere. */
export function systemBootId(options: { platform?: NodeJS.Platform; run?: CommandRunner; readText?: (file: string) => Promise<string> } = {}): BootIdReader {
  const platform = options.platform ?? process.platform;
  const run = options.run ?? runCommand;
  const readText = options.readText ?? ((file: string) => readFile(file, 'utf8'));
  let cached: Promise<string | null> | undefined;
  const read = async (): Promise<string | null> => {
    if (platform === 'linux') {
      const text = await readText('/proc/sys/kernel/random/boot_id').catch(() => '');
      return text.trim() === '' ? null : `linux:${text.trim()}`;
    }
    if (platform === 'darwin') {
      const result = await run('/usr/sbin/sysctl', ['-n', 'kern.boottime'], { timeoutMs: 5000 });
      const sec = /sec\s*=\s*(\d+)/.exec(result.stdout)?.[1];
      return sec === undefined ? null : `darwin:${sec}`;
    }
    return null;
  };
  return () => {
    cached ??= read().then((value) => {
      if (value === null) cached = undefined;
      return value;
    });
    return cached;
  };
}
