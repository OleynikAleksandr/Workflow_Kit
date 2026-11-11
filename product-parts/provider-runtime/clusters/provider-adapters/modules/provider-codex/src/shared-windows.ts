// Diagnosis of the shared access on Windows (spec M13 section 2.2). The remote command of the
// ChatGPT app over SSH is POSIX (`sh -c`, $SHELL), so a Windows computer needs the OpenSSH server
// with the sh.exe of Git for Windows as its DefaultShell. Until a probe on Windows confirms the
// scheme, every check runs read-only and the state stays unsupported with what passed and what
// did not. One PowerShell call reads the service, the registry, the app package and processes.
import path from 'node:path';
import { powershell } from '#process-supervisor';
import type { CommandRunner } from '#process-supervisor';
import { SHARED_ALIAS, SSH_CHECK_COMMAND, parseSshCheck } from './shared-files.ts';
import { isSecondAppServer } from './shared-mode.ts';

/** Package of the ChatGPT app on Windows (the same one open-link starts). */
export const WINDOWS_APP_PACKAGE = 'OpenAI.Codex';

/** Why the mode stays off on Windows after the checks (spec M13 section 1, principle 4). */
export const WINDOWS_NOT_CONFIRMED = 'на Windows общий доступ ещё не подтверждён пробой (M13): сессии ChatGPT работают как раньше';

/** Read-only PowerShell script: sshd status, DefaultShell, the app package, ssh/codex processes as JSON. */
export const WINDOWS_PROBE_SCRIPT = [
  '$s = Get-Service sshd -ErrorAction SilentlyContinue',
  "$d = (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\OpenSSH' -Name DefaultShell -ErrorAction SilentlyContinue).DefaultShell",
  `$a = Get-AppxPackage -Name '${WINDOWS_APP_PACKAGE}' -ErrorAction SilentlyContinue | Select-Object -First 1`,
  "$p = @(Get-CimInstance Win32_Process -Filter \"Name='ssh.exe' OR Name='codex.exe'\" | ForEach-Object { \"$($_.ProcessId) $($_.CommandLine)\" })",
  "[pscustomobject]@{ sshd = $(if ($s) { [string]$s.Status } else { '' }); defaultShell = [string]$d; app = $(if ($a) { [string]$a.InstallLocation } else { '' }); processes = $p } | ConvertTo-Json -Compress",
].join('; ');

/** What the probe script found; null fields are not known. */
export interface WindowsFacts {
  sshd: string | null;
  defaultShell: string | null;
  appLocation: string | null;
  processes: string[];
}

/** One line of the diagnosis. */
export interface WindowsCheck {
  name: string;
  status: 'ok' | 'fail' | 'unknown';
  detail: string;
}

/** Parses the JSON of WINDOWS_PROBE_SCRIPT; null when it is not that JSON. */
export function parseWindowsFacts(stdout: string | null): WindowsFacts | null {
  if (!stdout) return null;
  try {
    const value = JSON.parse(stdout.replace(/^﻿/, '').trim()) as Record<string, unknown>;
    const text = (key: string): string | null => (typeof value[key] === 'string' && value[key] !== '' ? (value[key] as string) : null);
    const list = Array.isArray(value['processes']) ? value['processes'] : typeof value['processes'] === 'string' ? [value['processes']] : [];
    return { sshd: text('sshd'), defaultShell: text('defaultShell'), appLocation: text('app'), processes: list.filter((p): p is string => typeof p === 'string') };
  } catch {
    return null;
  }
}

/** True for the sh.exe or bash.exe of Git for Windows (a POSIX shell for the app's command). */
export function isGitShell(file: string | null): boolean {
  return file !== null && /[\\/]Git[\\/](usr[\\/])?bin[\\/](sh|bash)\.exe$/i.test(file.trim());
}

/** True for the ssh.exe of the ChatGPT app connected through the alias. */
export function isWindowsSharedConnection(commandLine: string, alias: string = SHARED_ALIAS): boolean {
  return /(^|[\s\\/"])ssh(\.exe)?"?(\s|$)/i.test(commandLine) && commandLine.split(/\s+/).includes(alias) && /app-server\s+proxy/.test(commandLine);
}

/** True when ~/.ssh/config has a Host line naming the alias (written by Kit or by hand). */
export function hasHostAlias(config: string | null, alias: string = SHARED_ALIAS): boolean {
  return (config ?? '').split(/\r?\n/).some((line) => {
    const match = /^\s*Host\s+(.*)$/i.exec(line);
    return match !== null && match[1]!.trim().split(/\s+/).includes(alias);
  });
}

/** The reason and hint of the Windows state from the checks. */
export function windowsSummary(checks: readonly WindowsCheck[]): { reason: string; hint: string } {
  const named = (status: WindowsCheck['status']) => checks.filter((c) => c.status === status).map((c) => (status === 'ok' ? c.name : `${c.name} (${c.detail})`));
  const parts = [
    named('ok').length > 0 ? `Проверено: ${named('ok').join(', ')}.` : '',
    named('fail').length > 0 ? `Не прошло: ${named('fail').join('; ')}.` : '',
    named('unknown').length > 0 ? `Не проверено: ${named('unknown').join('; ')}.` : '',
  ].filter(Boolean);
  return { reason: WINDOWS_NOT_CONFIRMED, hint: `${parts.join(' ')} Шаги пробы — docs/evidence/M13-windows-probe.md.` };
}

/** Inputs of the diagnosis (the runtime gives them; tests pass fakes). */
export interface WindowsInputs {
  runCommand: CommandRunner;
  homedir: string;
  codexInstalled: boolean | null;
  sshFound: boolean;
  readText: (file: string) => Promise<string | null>;
}

/** Runs every check of spec M13 section 2.2 read-only, in order. */
export async function diagnoseWindows(inputs: WindowsInputs): Promise<WindowsCheck[]> {
  const checks: WindowsCheck[] = [];
  const add = (name: string, status: WindowsCheck['status'], detail: string): void => void checks.push({ name, status, detail });
  add('codex', inputs.codexInstalled === true ? 'ok' : 'fail', inputs.codexInstalled === true ? 'найден' : 'не найден');
  const facts = parseWindowsFacts(await powershell(inputs.runCommand, WINDOWS_PROBE_SCRIPT, 20_000));
  if (!facts) add('сведения Windows', 'fail', 'PowerShell не ответил');
  add('приложение ChatGPT', facts?.appLocation ? 'ok' : facts ? 'fail' : 'unknown', facts?.appLocation ? 'пакет найден' : `нет пакета ${WINDOWS_APP_PACKAGE}`);
  add('клиент OpenSSH', inputs.sshFound ? 'ok' : 'fail', inputs.sshFound ? 'ssh.exe найден' : 'ssh.exe не найден');
  const sshdOk = facts?.sshd === 'Running';
  add('сервер OpenSSH', sshdOk ? 'ok' : facts ? 'fail' : 'unknown', facts?.sshd ? `служба sshd: ${facts.sshd}` : 'служба sshd не установлена');
  const shellOk = isGitShell(facts?.defaultShell ?? null);
  add('оболочка SSH', shellOk ? 'ok' : facts ? 'fail' : 'unknown', facts?.defaultShell ? `DefaultShell: ${facts.defaultShell}` : 'DefaultShell не задан (нужен sh.exe Git)');
  const configFile = path.join(inputs.homedir, '.ssh', 'config');
  const hostOk = hasHostAlias(await inputs.readText(configFile));
  add(`Host ${SHARED_ALIAS}`, hostOk ? 'ok' : 'fail', hostOk ? 'есть в ~/.ssh/config' : 'нет в ~/.ssh/config');
  if (sshdOk && hostOk && inputs.sshFound) {
    const probe = await inputs.runCommand('ssh', ['-F', configFile, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', SHARED_ALIAS, SSH_CHECK_COMMAND], { timeoutMs: 20_000 });
    const answer = probe.code === 0 ? parseSshCheck(probe.stdout) : null;
    const detail = answer ? `codex: ${answer.codex ?? 'нет'}, переключатель: ${answer.skip ? 'да' : 'нет'}` : (probe.startError ?? probe.stderr).trim().split(/\r?\n/).pop() ?? `код ${probe.code}`;
    add('SSH-сеанс', answer?.codex && answer.skip ? 'ok' : 'fail', detail.slice(0, 200));
  } else {
    add('SSH-сеанс', 'unknown', 'нужны сервер OpenSSH и Host wfk-local');
  }
  const processes = facts?.processes ?? [];
  const connected = processes.some((line) => isWindowsSharedConnection(line));
  add('подключение ChatGPT', connected ? 'ok' : facts ? 'unknown' : 'unknown', connected ? 'приложение подключено' : 'подключение не найдено');
  if (processes.some((line) => isSecondAppServer(line))) add('второй app-server', 'fail', 'приложение подняло второй app-server');
  return checks;
}
