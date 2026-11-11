// Diagnosis of the shared access on Windows (spec M13 sections 2.2 and 2.3) with a fake PowerShell
// and ssh; the platform is injected, so it runs on every OS.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CommandRunner } from '#process-supervisor';
import {
  checksText,
  diagnoseWindows,
  hasHostAlias,
  isGitShell,
  isWindowsSharedConnection,
  parseWindowsFacts,
  windowsVerdict,
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
  gitShell: 'C:\\Program Files\\Git\\bin\\sh.exe' as string | null,
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

test('everything in place: every check passes and the connection decides', async () => {
  const fake = runner({ ps: facts() });
  const checks = await diagnoseWindows(inputs(fake.run));
  assert.ok(checks.every((c) => c.status === 'ok'), JSON.stringify(checks));
  assert.deepEqual(fake.calls, ['powershell.exe', 'ssh']);
  assert.match(checksText(checks), /^Проверено: codex, приложение ChatGPT, клиент OpenSSH, Git for Windows, .*SSH-сеанс, подключение ChatGPT\.$/);
  assert.equal(windowsVerdict(checks, { configured: true, admin: false }), null);
  assert.equal(windowsVerdict(checks, { configured: false, admin: false })?.state, 'not-configured');
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
  assert.match(checksText(checks), /Не прошло: сервер OpenSSH \(служба sshd не установлена\); оболочка SSH/);
  const verdict = windowsVerdict(checks, { configured: true, admin: false });
  assert.equal(verdict?.state, 'needs-admin-setup');
  assert.match(verdict?.reason ?? '', /служба sshd не установлена; DefaultShell: C:\\Windows/);
  assert.match(verdict?.hint ?? '', /от имени администратора/);
});

test('verdict order: codex, app, ssh client and Git make it unsupported; a denied admin key needs the script', async () => {
  const base = { configured: true, admin: false };
  const none = await diagnoseWindows({ ...inputs(runner({ ps: facts({ app: '' }) }).run), codexInstalled: false });
  assert.equal(windowsVerdict(none, base)?.reason, 'codex не найден');
  const noApp = await diagnoseWindows(inputs(runner({ ps: facts({ app: '' }) }).run));
  assert.match(windowsVerdict(noApp, base)?.reason ?? '', /приложение ChatGPT/);
  const noSsh = await diagnoseWindows({ ...inputs(runner({ ps: facts() }).run), sshFound: false });
  assert.match(windowsVerdict(noSsh, base)?.reason ?? '', /ssh\.exe/);
  const noGit = await diagnoseWindows({ ...inputs(runner({ ps: facts() }).run), gitShell: null });
  assert.equal(windowsVerdict(noGit, base)?.state, 'unsupported');
  assert.match(windowsVerdict(noGit, base)?.reason ?? '', /Git for Windows/);
  const denied = await diagnoseWindows(inputs(runner({ ps: facts(), ssh: { code: 255, stdout: '', stderr: 'Permission denied (publickey).\n' } }).run));
  assert.equal(windowsVerdict(denied, { configured: true, admin: true })?.state, 'needs-admin-setup');
  assert.equal(windowsVerdict(denied, base)?.state, 'broken');
  const silent = await diagnoseWindows(inputs(runner({ ps: null }).run));
  assert.equal(windowsVerdict(silent, base)?.state, 'broken');
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
