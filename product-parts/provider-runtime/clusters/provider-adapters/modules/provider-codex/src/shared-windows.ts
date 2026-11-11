// Diagnosis of the shared access on Windows (spec M13 sections 2.2 and 2.3). The remote command of
// the ChatGPT app over SSH is POSIX (`sh -c`, $SHELL), so a Windows computer needs the OpenSSH
// server with the sh.exe of Git for Windows as its DefaultShell. Every check is read-only; one
// PowerShell call reads the service, the registry, the app package and processes. windowsVerdict
// turns the checks into the state of the card; the connection itself is judged as on macOS.
import path from 'node:path';
import { powershell } from '#process-supervisor';
import type { CommandRunner } from '#process-supervisor';
import type { SharedAccessStateName } from '#provider-registry';
import { ELEVATED_HINT, ELEVATED_REASON } from './elevation.ts';
import { SHARED_ALIAS, SSH_CHECK_COMMAND, parseSshCheck } from './shared-files.ts';
import { isSecondAppServer } from './shared-mode.ts';

/** Package of the ChatGPT app on Windows (the same one open-link starts). */
export const WINDOWS_APP_PACKAGE = 'OpenAI.Codex';

/** A connection of the app counts once its ssh.exe lives this long: failed attempts end sooner (M14). */
export const CONNECTION_MIN_AGE_S = 15;

/**
 * Read-only PowerShell script as JSON: sshd status, DefaultShell, EnableLUA (UAC), the app package
 * and the ssh/codex processes as "<pid> <age in seconds> <command line>".
 */
export const WINDOWS_PROBE_SCRIPT = [
  '$s = Get-Service sshd -ErrorAction SilentlyContinue',
  "$d = (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\OpenSSH' -Name DefaultShell -ErrorAction SilentlyContinue).DefaultShell",
  `$a = Get-AppxPackage -Name '${WINDOWS_APP_PACKAGE}' -ErrorAction SilentlyContinue | Select-Object -First 1`,
  "$u = (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -Name EnableLUA -ErrorAction SilentlyContinue).EnableLUA",
  "$p = @(Get-CimInstance Win32_Process -Filter \"Name='ssh.exe' OR Name='codex.exe'\" | ForEach-Object { \"$($_.ProcessId) $([int]((Get-Date) - $_.CreationDate).TotalSeconds) $($_.CommandLine)\" })",
  "[pscustomobject]@{ sshd = $(if ($s) { [string]$s.Status } else { '' }); defaultShell = [string]$d; uac = [string]$u; app = $(if ($a) { [string]$a.InstallLocation } else { '' }); processes = $p } | ConvertTo-Json -Compress",
].join('; ');

/** What the probe script found; null fields are not known. */
export interface WindowsFacts {
  sshd: string | null;
  defaultShell: string | null;
  /** EnableLUA: "1" UAC on, "0" off. */
  uac: string | null;
  appLocation: string | null;
  processes: string[];
}

/** Stable names of the checks (the text names are for people). */
export type WindowsCheckId = 'codex' | 'facts' | 'elevation' | 'app' | 'ssh-client' | 'git-shell' | 'sshd' | 'shell' | 'host' | 'session' | 'connection' | 'second-server';

/** One line of the diagnosis. */
export interface WindowsCheck {
  id: WindowsCheckId;
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
    return { sshd: text('sshd'), defaultShell: text('defaultShell'), uac: text('uac'), appLocation: text('app'), processes: list.filter((p): p is string => typeof p === 'string') };
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

/** Age in seconds of a "<pid> <age> <command line>" line of the probe script; null without one. */
export function processAge(line: string): number | null {
  const match = /^\s*\d+\s+(\d+)\s/.exec(line);
  return match ? Number(match[1]) : null;
}

/** True for a connection of the app that lived CONNECTION_MIN_AGE_S, not a failed attempt. */
export function isSettledConnection(line: string): boolean {
  return isWindowsSharedConnection(line) && (processAge(line) ?? 0) >= CONNECTION_MIN_AGE_S;
}

/** True when ~/.ssh/config has a Host line naming the alias (written by Kit or by hand). */
export function hasHostAlias(config: string | null, alias: string = SHARED_ALIAS): boolean {
  return (config ?? '').split(/\r?\n/).some((line) => {
    const match = /^\s*Host\s+(.*)$/i.exec(line);
    return match !== null && match[1]!.trim().split(/\s+/).includes(alias);
  });
}

/** "Проверено: …. Не прошло: …. Не проверено: …." for the hint and `wfk doctor`. */
export function checksText(checks: readonly WindowsCheck[]): string {
  const named = (status: WindowsCheck['status']) => checks.filter((c) => c.status === status).map((c) => (status === 'ok' ? c.name : `${c.name} (${c.detail})`));
  return [
    named('ok').length > 0 ? `Проверено: ${named('ok').join(', ')}.` : '',
    named('fail').length > 0 ? `Не прошло: ${named('fail').join('; ')}.` : '',
    named('unknown').length > 0 ? `Не проверено: ${named('unknown').join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** The state the checks decide; null when they all pass and the connection decides (as on macOS). */
export interface WindowsVerdict {
  state: SharedAccessStateName;
  reason: string;
  hint: string;
}

const ADMIN_HINT = 'Запустите скрипт администратора (команда — в карточке) в PowerShell от имени администратора и нажмите «Перепроверить».';

/** Turns the checks into the state of spec M13 section 2.3, in the order of the checks. */
export function windowsVerdict(checks: readonly WindowsCheck[], options: { configured: boolean; admin: boolean }): WindowsVerdict | null {
  const failed = (id: WindowsCheckId) => checks.find((c) => c.id === id && c.status === 'fail');
  const text = checksText(checks);
  const make = (state: SharedAccessStateName, reason: string, hint: string): WindowsVerdict => ({ state, reason, hint: `${hint} ${text}` });
  if (failed('codex')) return make('unsupported', 'codex не найден', 'Установите Codex CLI и нажмите «Перепроверить».');
  if (failed('facts')) return make('broken', 'PowerShell не ответил: состояние Windows не прочитано', 'Нажмите «Перепроверить».');
  if (failed('elevation')) return make('broken', ELEVATED_REASON, ELEVATED_HINT);
  if (failed('app')) return make('unsupported', 'приложение ChatGPT для Windows не установлено', 'Установите ChatGPT из Microsoft Store и нажмите «Перепроверить».');
  if (failed('ssh-client')) return make('unsupported', 'нет клиента OpenSSH (ssh.exe)', 'Параметры → Система → Дополнительные компоненты → «Клиент OpenSSH», затем «Перепроверить».');
  if (failed('git-shell')) return make('unsupported', 'не найден Git for Windows (sh.exe)', 'Установите Git for Windows и нажмите «Перепроверить».');
  if (!options.configured) return make('not-configured', 'Kit ещё не настроил доступ ChatGPT к демону по SSH', 'Нажмите «Настроить».');
  const admin = [failed('sshd'), failed('shell')].filter((c): c is WindowsCheck => c !== undefined);
  if (admin.length > 0) return make('needs-admin-setup', `нужен шаг администратора: ${admin.map((c) => c.detail).join('; ')}`, ADMIN_HINT);
  const session = failed('session');
  if (session && options.admin && /Permission denied/i.test(session.detail)) {
    return make('needs-admin-setup', 'ключ Kit не принят: у администратора он должен быть в administrators_authorized_keys', ADMIN_HINT);
  }
  if (session) return make('broken', `SSH-сеанс ${SHARED_ALIAS}: ${session.detail}`, 'Нажмите «Настроить» ещё раз; если не помогло — запустите скрипт администратора ещё раз.');
  if (failed('second-server')) return make('broken', 'приложение ChatGPT подняло по SSH второй app-server рядом с демоном Kit', 'Закройте ChatGPT, нажмите «Настроить» ещё раз и откройте ChatGPT снова.');
  return null;
}

/** Inputs of the diagnosis (the runtime gives them; tests pass fakes). */
export interface WindowsInputs {
  runCommand: CommandRunner;
  homedir: string;
  codexInstalled: boolean | null;
  sshFound: boolean;
  /** sh.exe of Git for Windows; null when not found. */
  gitShell: string | null;
  readText: (file: string) => Promise<string | null>;
}

/** Runs every check of spec M13 section 2.2 read-only, in order. */
export async function diagnoseWindows(inputs: WindowsInputs): Promise<WindowsCheck[]> {
  const checks: WindowsCheck[] = [];
  const add = (id: WindowsCheckId, name: string, status: WindowsCheck['status'], detail: string): void => void checks.push({ id, name, status, detail });
  add('codex', 'codex', inputs.codexInstalled === true ? 'ok' : 'fail', inputs.codexInstalled === true ? 'найден' : 'не найден');
  const facts = parseWindowsFacts(await powershell(inputs.runCommand, WINDOWS_PROBE_SCRIPT, 20_000));
  if (!facts) add('facts', 'сведения Windows', 'fail', 'PowerShell не ответил');
  if (facts) add('elevation', 'контроль учётных записей', facts.uac === '0' ? 'fail' : facts.uac === '1' ? 'ok' : 'unknown', facts.uac === '0' ? 'UAC выключен (EnableLUA = 0)' : facts.uac === '1' ? 'UAC включён' : 'EnableLUA не прочитан');
  add('app', 'приложение ChatGPT', facts?.appLocation ? 'ok' : facts ? 'fail' : 'unknown', facts?.appLocation ? 'пакет найден' : `нет пакета ${WINDOWS_APP_PACKAGE}`);
  add('ssh-client', 'клиент OpenSSH', inputs.sshFound ? 'ok' : 'fail', inputs.sshFound ? 'ssh.exe найден' : 'ssh.exe не найден');
  add('git-shell', 'Git for Windows', inputs.gitShell ? 'ok' : 'fail', inputs.gitShell ?? 'sh.exe не найден');
  const sshdOk = facts?.sshd === 'Running';
  add('sshd', 'сервер OpenSSH', sshdOk ? 'ok' : facts ? 'fail' : 'unknown', facts?.sshd ? `служба sshd: ${facts.sshd}` : 'служба sshd не установлена');
  const shellOk = isGitShell(facts?.defaultShell ?? null);
  add('shell', 'оболочка SSH', shellOk ? 'ok' : facts ? 'fail' : 'unknown', facts?.defaultShell ? `DefaultShell: ${facts.defaultShell}` : 'DefaultShell не задан (нужен sh.exe Git)');
  const configFile = path.join(inputs.homedir, '.ssh', 'config');
  const hostOk = hasHostAlias(await inputs.readText(configFile));
  add('host', `Host ${SHARED_ALIAS}`, hostOk ? 'ok' : 'fail', hostOk ? 'есть в ~/.ssh/config' : 'нет в ~/.ssh/config');
  if (sshdOk && shellOk && hostOk && inputs.sshFound) {
    const probe = await inputs.runCommand('ssh', ['-F', configFile, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', SHARED_ALIAS, SSH_CHECK_COMMAND], { timeoutMs: 20_000 });
    const answer = probe.code === 0 ? parseSshCheck(probe.stdout) : null;
    const detail = answer
      ? `codex: ${answer.codex ?? 'нет'}, переключатель: ${answer.skip ? 'да' : 'нет'}`
      : ((probe.startError ?? probe.stderr).trim().split(/\r?\n/).pop() ?? `код ${probe.code}`);
    add('session', 'SSH-сеанс', answer?.codex && answer.skip ? 'ok' : 'fail', detail.slice(0, 200) || `код ${probe.code}`);
  } else {
    add('session', 'SSH-сеанс', 'unknown', 'нужны сервер OpenSSH, оболочка Git и Host wfk-local');
  }
  const processes = facts?.processes ?? [];
  const connected = processes.some((line) => isSettledConnection(line));
  add('connection', 'подключение ChatGPT', connected ? 'ok' : 'unknown', connected ? 'приложение подключено' : 'подключение не найдено');
  if (processes.some((line) => isSecondAppServer(line))) add('second-server', 'второй app-server', 'fail', 'приложение подняло второй app-server');
  return checks;
}
