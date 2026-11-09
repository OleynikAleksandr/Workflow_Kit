// Windows process identity and tree kill (spec M5 section 3): no `ps`, no process groups, no
// signals. Identity comes from CIM (Win32_Process: CreationDate and CommandLine) through Windows
// PowerShell, which every Windows 11 has; `wmic` is gone in 24H2. A stop ends the process tree
// with taskkill, first without /F, then with /F after the identity is checked again.
import { runCommand } from './command.ts';
import type { CommandRunner } from './command.ts';
import type { BootIdReader, ProcessInfo, ProcessInspector } from './proc-info.ts';

const POWERSHELL_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command'];

/** Runs a Windows PowerShell script with UTF-8 output; stdout, or null on failure. */
export async function powershell(run: CommandRunner, script: string, timeoutMs = 15_000): Promise<string | null> {
  const full = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${script}`;
  const result = await run('powershell.exe', [...POWERSHELL_ARGS, full], { timeoutMs });
  return result.code === 0 ? result.stdout : null;
}

/** Parses "<ISO creation time>\t<command line>" printed by the CIM script. */
export function parseCimLine(pid: number, text: string): ProcessInfo | undefined {
  const line = text.replace(/^﻿/, '').replace(/\r?\n$/, '');
  const tab = line.indexOf('\t');
  if (tab <= 0) return undefined;
  const startToken = line.slice(0, tab).trim();
  const parsed = Date.parse(startToken);
  if (Number.isNaN(parsed)) return undefined;
  return { pid, pgid: null, startToken, startedAt: new Date(parsed).toISOString(), commandLine: line.slice(tab + 1).trim() };
}

/** Process inspector of Windows: one CIM query per pid. */
export function cimInspector(options: { run?: CommandRunner } = {}): ProcessInspector {
  const run = options.run ?? runCommand;
  return async (pid) => {
    if (!Number.isSafeInteger(pid) || pid <= 0) return undefined;
    const out = await powershell(
      run,
      `$p = Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if ($p) { [Console]::Out.Write($p.CreationDate.ToUniversalTime().ToString('o') + [char]9 + $p.CommandLine) }`,
    );
    return out ? parseCimLine(pid, out) : undefined;
  };
}

/** Boot id of Windows: the last boot time in UTC (seconds). */
export function windowsBootId(options: { run?: CommandRunner } = {}): BootIdReader {
  const run = options.run ?? runCommand;
  return async () => {
    const out = await powershell(run, `[Console]::Out.Write((Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))`);
    const value = out?.trim() ?? '';
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) ? `win32:${value}` : null;
  };
}

/** taskkill of a process tree; force adds /F. True when taskkill reported success. */
export async function taskkill(run: CommandRunner, pid: number, force: boolean): Promise<boolean> {
  const args = ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])];
  const result = await run('taskkill', args, { timeoutMs: 15_000 });
  return result.code === 0;
}
