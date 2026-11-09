// External commands of the installer for each OS (launchctl, systemctl, reg, PowerShell).
// Pure builders: the flow runs them through the injected CommandRunner, tests compare them.
import { LAUNCH_AGENT_LABEL, RUN_KEY, RUN_VALUE_NAME, SYSTEMD_UNIT } from './layout.ts';
import { wscriptPath } from './templates.ts';

/** One external program call. */
export interface PlannedCommand {
  command: string;
  args: string[];
}

const LAUNCHCTL = '/bin/launchctl';
const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

/** Building the macOS app: compile the Swift source, draw the icon, pack it, refresh the Dock. */
export const macApp = {
  compile: (source: string, executable: string): PlannedCommand => ({ command: '/usr/bin/xcrun', args: ['swiftc', '-O', '-o', executable, source] }),
  iconset: (executable: string, dir: string): PlannedCommand => ({ command: executable, args: ['--make-iconset', dir] }),
  iconutil: (dir: string, icns: string): PlannedCommand => ({ command: '/usr/bin/iconutil', args: ['-c', 'icns', '-o', icns, dir] }),
  register: (app: string): PlannedCommand => ({ command: LSREGISTER, args: ['-f', app] }),
};

/** launchctl calls for the LaunchAgent in the GUI domain of a user. */
export const launchctl = {
  print: (uid: number): PlannedCommand => ({ command: LAUNCHCTL, args: ['print', `gui/${uid}/${LAUNCH_AGENT_LABEL}`] }),
  bootstrap: (uid: number, plist: string): PlannedCommand => ({ command: LAUNCHCTL, args: ['bootstrap', `gui/${uid}`, plist] }),
  bootout: (uid: number): PlannedCommand => ({ command: LAUNCHCTL, args: ['bootout', `gui/${uid}/${LAUNCH_AGENT_LABEL}`] }),
  kickstart: (uid: number): PlannedCommand => ({ command: LAUNCHCTL, args: ['kickstart', `gui/${uid}/${LAUNCH_AGENT_LABEL}`] }),
};

function systemctlUser(...args: string[]): PlannedCommand {
  return { command: 'systemctl', args: ['--user', ...args] };
}

/** systemctl --user calls for the Workflow Kit unit. */
export const systemctl = {
  /** Succeeds when a systemd user manager is reachable. */
  probe: (): PlannedCommand => systemctlUser('show-environment'),
  daemonReload: (): PlannedCommand => systemctlUser('daemon-reload'),
  enable: (): PlannedCommand => systemctlUser('enable', SYSTEMD_UNIT),
  disable: (): PlannedCommand => systemctlUser('disable', SYSTEMD_UNIT),
  start: (): PlannedCommand => systemctlUser('start', SYSTEMD_UNIT),
  stop: (): PlannedCommand => systemctlUser('stop', SYSTEMD_UNIT),
  restart: (): PlannedCommand => systemctlUser('restart', SYSTEMD_UNIT),
  isEnabled: (): PlannedCommand => systemctlUser('is-enabled', SYSTEMD_UNIT),
};

function systemRoot(env: NodeJS.ProcessEnv): string {
  return env['SystemRoot'] || env['SYSTEMROOT'] || 'C:\\Windows';
}

function regExe(env: NodeJS.ProcessEnv): string {
  return `${systemRoot(env)}\\System32\\reg.exe`;
}

/** reg.exe calls for the HKCU Run value (no administrator rights needed). */
export const registry = {
  add: (env: NodeJS.ProcessEnv, value: string): PlannedCommand => ({
    command: regExe(env),
    args: ['add', RUN_KEY, '/v', RUN_VALUE_NAME, '/t', 'REG_SZ', '/d', value, '/f'],
  }),
  remove: (env: NodeJS.ProcessEnv): PlannedCommand => ({ command: regExe(env), args: ['delete', RUN_KEY, '/v', RUN_VALUE_NAME, '/f'] }),
  query: (env: NodeJS.ProcessEnv): PlannedCommand => ({ command: regExe(env), args: ['query', RUN_KEY, '/v', RUN_VALUE_NAME] }),
};

/** Extracts the data of the Run value from `reg query` output; null when absent. */
export function parseRegQuery(stdout: string): string | null {
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^\s*(\S+)\s+REG_\w+\s+(.*)$/.exec(line);
    if (match && match[1] === RUN_VALUE_NAME) return (match[2] ?? '').trim();
  }
  return null;
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** powershell.exe call with a script (no profile, no prompts). */
export function powershell(env: NodeJS.ProcessEnv, script: string): PlannedCommand {
  return {
    command: `${systemRoot(env)}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
  };
}

const USER_PATH = "[Environment]::GetEnvironmentVariable('Path', 'User')";

/** Script that appends a directory to the user PATH once (broadcasts the change). */
export function addUserPathScript(dir: string): string {
  return [
    `$d = ${psQuote(dir)}`,
    `$p = ${USER_PATH}`,
    "if ($null -eq $p) { $p = '' }",
    "$parts = @($p -split ';' | Where-Object { $_ -ne '' })",
    "if ($parts -notcontains $d) { [Environment]::SetEnvironmentVariable('Path', (($parts + $d) -join ';'), 'User') }",
  ].join('; ');
}

/** Script that removes a directory from the user PATH. */
export function removeUserPathScript(dir: string): string {
  return [
    `$d = ${psQuote(dir)}`,
    `$p = ${USER_PATH}`,
    'if ($null -ne $p) {',
    "$parts = @($p -split ';' | Where-Object { $_ -ne '' -and $_ -ne $d })",
    "[Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User') }",
  ].join(' ');
}

/** Script that creates the Start menu shortcut: wscript runs the hidden `wfk open` helper. */
export function shortcutScript(env: NodeJS.ProcessEnv, shortcut: string, openVbs: string, workingDir: string): string {
  return [
    "$s = (New-Object -ComObject WScript.Shell).CreateShortcut(" + psQuote(shortcut) + ')',
    `$s.TargetPath = ${psQuote(wscriptPath(env))}`,
    `$s.Arguments = ${psQuote(`"${openVbs}"`)}`,
    `$s.WorkingDirectory = ${psQuote(workingDir)}`,
    "$s.Description = 'Workflow Kit'",
    '$s.Save()',
  ].join('; ');
}

/** Script that prints the login-shell PATH between markers (macOS and Linux). */
export const PATH_MARK = '__WFK_PATH__';

/** Login-shell calls that print PATH: interactive login first (nvm, ~/.zshrc), then login only. */
export function loginPathCommands(shell: string): PlannedCommand[] {
  const script = `printf '${PATH_MARK}%s${PATH_MARK}' "$PATH"`;
  return [
    { command: shell, args: ['-i', '-l', '-c', script] },
    { command: shell, args: ['-l', '-c', script] },
  ];
}

/** PATH printed by loginPathCommands; null when the markers are missing. */
export function parseLoginPath(stdout: string): string | null {
  const start = stdout.indexOf(PATH_MARK);
  if (start < 0) return null;
  const end = stdout.indexOf(PATH_MARK, start + PATH_MARK.length);
  if (end < 0) return null;
  const value = stdout.slice(start + PATH_MARK.length, end).trim();
  return value === '' ? null : value;
}
