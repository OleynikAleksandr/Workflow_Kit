// Diagnosis of the shared access on Windows (spec M13 section 2.2) with a fake PowerShell and ssh;
// the platform is injected, so it runs on every OS.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CommandRunner } from '#process-supervisor';
import {
  WINDOWS_NOT_CONFIRMED,
  diagnoseWindows,
  hasHostAlias,
  isGitShell,
  isWindowsSharedConnection,
  parseWindowsFacts,
  windowsSummary,
} from '../src/shared-windows.ts';

const CONNECTION = '5120 "C:\\Windows\\System32\\OpenSSH\\ssh.exe" -T -o BatchMode=yes wfk-local sh -c codex app-server proxy';
const facts = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ sshd: 'Running', defaultShell: 'C:\\Program Files\\Git\\bin\\sh.exe', app: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_1', processes: [CONNECTION], ...over });

function runner(answers: { ps: string | null; ssh?: { code: number; stdout: string; stderr: string } }): { run: CommandRunner; calls: string[] } {
  const calls: string[] = [];
  const run: CommandRunner = async (command) => {
    calls.push(command);
    const base = { signal: null, startError: null, timedOut: false };
    if (command === 'powershell.exe') return answers.ps === null ? { ...base, code: 1, stdout: '', stderr: 'no' } : { ...base, code: 0, stdout: answers.ps, stderr: '' };
    if (command === 'ssh') return { ...base, ...(answers.ssh ?? { code: 0, stdout: '\nC:/Users/u/bin/codex|true\n', stderr: '' }) };
    return { ...base, code: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

const inputs = (run: CommandRunner, config: string | null = 'Host wfk-local\n  HostName 127.0.0.1\n') => ({
  runCommand: run,
  homedir: 'C:\\Users\\u',
  codexInstalled: true,
  sshFound: true,
  readText: async () => config,
});

test('facts: JSON of the probe script, one process as a string, BOM, garbage', () => {
  assert.deepEqual(parseWindowsFacts(`\uFEFF${facts({ processes: CONNECTION })}`)?.processes, [CONNECTION]);
  assert.equal(parseWindowsFacts(facts({ sshd: '' }))?.sshd, null);
  assert.equal(parseWindowsFacts('not json'), null);
  assert.equal(parseWindowsFacts(null), null);
});

test('Git shells, the ssh.exe connection and the Host alias are recognised', () => {
  assert.equal(isGitShell('C:\\Program Files\\Git\\bin\\sh.exe'), true);
  assert.equal(isGitShell('C:\\Program Files\\Git\\usr\\bin\\bash.exe'), true);
  assert.equal(isGitShell('C:\\Windows\\System32\\cmd.exe'), false);
  assert.equal(isGitShell(null), false);
  assert.equal(isWindowsSharedConnection(CONNECTION), true);
  assert.equal(isWindowsSharedConnection('7 C:\\x\\codex.exe app-server proxy'), false);
  assert.equal(hasHostAlias('Host a wfk-local\n'), true);
  assert.equal(hasHostAlias('Host wfk-localx\n'), false);
});

test('everything in place: every check passes, the mode still waits for the probe', async () => {
  const fake = runner({ ps: facts() });
  const checks = await diagnoseWindows(inputs(fake.run));
  assert.ok(checks.every((c) => c.status === 'ok'), JSON.stringify(checks));
  assert.deepEqual(fake.calls, ['powershell.exe', 'ssh']);
  const summary = windowsSummary(checks);
  assert.equal(summary.reason, WINDOWS_NOT_CONFIRMED);
  assert.match(summary.hint, /^Проверено: codex, приложение ChatGPT, .*SSH-сеанс, подключение ChatGPT\./);
});

test('a missing sshd and a cmd DefaultShell fail; the SSH session is then not checked', async () => {
  const fake = runner({ ps: facts({ sshd: '', defaultShell: 'C:\\Windows\\System32\\cmd.exe', processes: [] }) });
  const checks = await diagnoseWindows(inputs(fake.run));
  const by = Object.fromEntries(checks.map((c) => [c.name, c]));
  assert.equal(by['сервер OpenSSH']?.status, 'fail');
  assert.equal(by['оболочка SSH']?.status, 'fail');
  assert.match(by['оболочка SSH']?.detail ?? '', /cmd\.exe/);
  assert.equal(by['SSH-сеанс']?.status, 'unknown');
  assert.deepEqual(fake.calls, ['powershell.exe']);
  assert.match(windowsSummary(checks).hint, /Не прошло: сервер OpenSSH \(служба sshd не установлена\); оболочка SSH/);
});

test('no Host alias, a failing ssh, a second app-server and a silent PowerShell are reported', async () => {
  const noHost = await diagnoseWindows(inputs(runner({ ps: facts() }).run, null));
  assert.equal(noHost.find((c) => c.name === 'Host wfk-local')?.status, 'fail');
  const denied = await diagnoseWindows(inputs(runner({ ps: facts(), ssh: { code: 255, stdout: '', stderr: 'Permission denied (publickey).\n' } }).run));
  assert.match(denied.find((c) => c.name === 'SSH-сеанс')?.detail ?? '', /Permission denied/);
  const second = await diagnoseWindows(inputs(runner({ ps: facts({ processes: ['9 C:\\u\\codex.exe -c features.code_mode_host=true app-server --listen unix://'] }) }).run));
  assert.equal(second.find((c) => c.name === 'второй app-server')?.status, 'fail');
  const silent = await diagnoseWindows(inputs(runner({ ps: null }).run));
  assert.equal(silent.find((c) => c.name === 'сведения Windows')?.status, 'fail');
});
