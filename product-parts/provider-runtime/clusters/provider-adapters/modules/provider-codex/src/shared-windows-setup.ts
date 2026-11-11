// Setup of the shared access on Windows (spec M13 section 2.3): paths of Git for Windows, the
// administrator script Kit writes and the user runs (OpenSSH server, DefaultShell, the key of an
// administrator) and its rollback, the command that starts it and the PowerShell that opens a
// codex:// link in the ChatGPT app package. Kit never runs the administrator script itself.
import path from 'node:path';
import { powershell } from '#process-supervisor';
import type { CommandRunner } from '#process-supervisor';
import { KEY_COMMENT } from './shared-files.ts';

/** File name of the administrator script in the data directory. */
export const ADMIN_SCRIPT_NAME = 'shared-access-admin.ps1';
/** File name of the rollback script. */
export const ADMIN_ROLLBACK_NAME = 'shared-access-admin-undo.ps1';
/** Capability of the OpenSSH server. */
export const OPENSSH_SERVER = 'OpenSSH.Server~~~~0.0.1.0';
/** Group of the administrators (well-known SID); its members use administrators_authorized_keys. */
export const ADMINISTRATORS_SID = 'S-1-5-32-544';

/** PowerShell single-quoted literal. */
export function psLiteral(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

/** C:\Users\u\bin → /c/Users/u/bin (the PATH of a Git Bash session). */
export function toGitBashPath(windowsPath: string): string {
  const drive = /^([A-Za-z]):[\\/]?(.*)$/.exec(windowsPath);
  if (!drive) return windowsPath.replace(/\\/g, '/');
  return `/${drive[1]!.toLowerCase()}/${drive[2]!.replace(/\\/g, '/')}`.replace(/\/$/, '');
}

/** Places of sh.exe of Git for Windows, most likely first: next to git.exe, then the usual roots. */
export function gitShellCandidates(env: Readonly<Record<string, string | undefined>>, gitExe: string | null = null): string[] {
  const p = path.win32;
  const fromGit = gitExe ? /^(.*[\\/]Git)[\\/](cmd|bin|mingw64[\\/]bin)[\\/]git\.exe$/i.exec(gitExe) : null;
  const roots = [env['ProgramFiles'], env['ProgramW6432'], env['ProgramFiles(x86)'], env['LOCALAPPDATA'] ? p.join(env['LOCALAPPDATA'], 'Programs') : undefined];
  const files = roots.filter((r): r is string => typeof r === 'string' && r !== '').map((root) => p.join(root, 'Git', 'bin', 'sh.exe'));
  return [...new Set([...(fromGit ? [p.join(fromGit[1]!, 'bin', 'sh.exe')] : []), ...files])];
}

/** PowerShell: "True" when the user is in the Administrators group (also with a filtered UAC token). */
export const WINDOWS_ADMIN_SCRIPT = `[Console]::Out.Write([bool]((whoami /groups) -match '${ADMINISTRATORS_SID}'))`;

/** True or false when PowerShell answered, null when it did not. */
export async function windowsIsAdmin(run: CommandRunner): Promise<boolean | null> {
  const out = await powershell(run, WINDOWS_ADMIN_SCRIPT, 10_000);
  if (out === null) return null;
  return out.trim() === 'True';
}

/** What the administrator script needs. */
export interface AdminScriptInputs {
  /** sh.exe of Git for Windows, the DefaultShell of the OpenSSH server. */
  gitShell: string;
  /** The authorized_keys line of the Kit key, written for an administrator; null for a plain user. */
  adminKeyLine: string | null;
  /** The key itself (second field of the public key), to drop older lines of the same key. */
  keyBlob: string | null;
}

/** CRLF lines with a UTF-8 BOM: Windows PowerShell 5.1 reads a file without a BOM as ANSI. */
function scriptText(lines: readonly string[]): string {
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

const ADMIN_KEYS = "Join-Path $env:ProgramData 'ssh\\administrators_authorized_keys'";

/** The administrator script: idempotent, stops on the first error, says what it did. */
export function adminScript(inputs: AdminScriptInputs): string {
  const lines = [
    '# Workflow Kit: shared access of the ChatGPT app to the Codex daemon (spec M13).',
    '# Run it as administrator; Kit never runs it by itself.',
    "$ErrorActionPreference = 'Stop'",
    `if (-not (Get-Service sshd -ErrorAction SilentlyContinue)) { Add-WindowsCapability -Online -Name ${psLiteral(OPENSSH_SERVER)} | Out-Null }`,
    'Set-Service -Name sshd -StartupType Automatic',
    'Start-Service sshd',
    "New-Item -Path 'HKLM:\\SOFTWARE\\OpenSSH' -Force | Out-Null",
    `New-ItemProperty -Path 'HKLM:\\SOFTWARE\\OpenSSH' -Name DefaultShell -Value ${psLiteral(inputs.gitShell)} -PropertyType String -Force | Out-Null`,
  ];
  if (inputs.adminKeyLine) {
    lines.push(
      `$f = ${ADMIN_KEYS}`,
      `$old = if (Test-Path $f) { @(Get-Content $f | Where-Object { $_ -notlike ${psLiteral(`*${inputs.keyBlob ?? KEY_COMMENT}*`)} }) } else { @() }`,
      `Set-Content -Path $f -Value ($old + ${psLiteral(inputs.adminKeyLine)}) -Encoding ascii`,
      "icacls $f /inheritance:r /grant 'Administrators:F' /grant 'SYSTEM:F' | Out-Null",
    );
  }
  lines.push("Write-Host 'Workflow Kit: the OpenSSH server and DefaultShell are set. Press Recheck in the panel.'");
  return scriptText(lines);
}

/** The rollback: DefaultShell only when it is ours, the key line of an administrator; sshd stays. */
export function adminRollbackScript(inputs: { gitShell: string; keyBlob: string | null }): string {
  const lines = [
    '# Workflow Kit: removes what shared-access-admin.ps1 set (spec M13). The OpenSSH server stays.',
    "$ErrorActionPreference = 'Stop'",
    "$d = (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\OpenSSH' -Name DefaultShell -ErrorAction SilentlyContinue).DefaultShell",
    `if ($d -eq ${psLiteral(inputs.gitShell)}) { Remove-ItemProperty -Path 'HKLM:\\SOFTWARE\\OpenSSH' -Name DefaultShell }`,
    `$f = ${ADMIN_KEYS}`,
    `if (Test-Path $f) { Set-Content -Path $f -Value @(Get-Content $f | Where-Object { $_ -notlike ${psLiteral(`*${inputs.keyBlob ?? KEY_COMMENT}*`)} }) -Encoding ascii }`,
    "Write-Host 'Workflow Kit: rollback done.'",
  ];
  return scriptText(lines);
}

/** The command a user pastes into a PowerShell started as administrator. */
export function adminCommand(scriptFile: string): string {
  return `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}"`;
}

/** PowerShell that opens a codex:// link in the ChatGPT app package (as open-link does, M5). */
export function openInAppScript(url: string, appPackage: string): string {
  return [
    `$p = Get-AppxPackage -Name ${psLiteral(appPackage)} | Select-Object -First 1`,
    'if (-not $p) { exit 3 }',
    '$id = ((Get-AppxPackageManifest $p).Package.Applications.Application | Select-Object -First 1).Id',
    `Start-Process -FilePath ("shell:AppsFolder\\" + $p.PackageFamilyName + "!" + $id) -ArgumentList ${psLiteral(url)}`,
  ].join('; ');
}
