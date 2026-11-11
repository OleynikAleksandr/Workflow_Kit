import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserPlan, getServiceStatus, runServiceCommand } from '../src/index.ts';
import { standardMachine } from './fakes.ts';

const MAC_DATA = '/Users/me/Library/Application Support/Workflow Kit';

test('without a context nothing is touched: the T001 answers stay', async () => {
  const status = getServiceStatus('linux');
  assert.equal(status.implemented, false);
  assert.equal(status.mechanism, 'systemd-user');
  const install = await runServiceCommand('install');
  assert.equal(install.exitCode, 2);
  assert.match(install.message, /^wfk install: не реализовано/);
  assert.match((await runServiceCommand('start')).message, /^wfk service start: не реализовано/);
  const plain = await runServiceCommand('status');
  assert.equal(plain.exitCode, 0);
  assert.match(plain.message, /не установлена/);
});

test('service start, status and stop of an installed macOS service', async () => {
  const m = standardMachine('darwin');
  await runServiceCommand('install', m.deps);
  const stop = await runServiceCommand('stop', m.deps);
  assert.equal(stop.message, 'служба остановлена');
  assert.deepEqual(m.lines().slice(-2), ['/bin/launchctl bootout gui/501/ai.workflowkit.backend', '/bin/launchctl print gui/501/ai.workflowkit.backend']);
  assert.equal((await runServiceCommand('stop', m.deps)).message, 'служба не была запущена');

  const status = await runServiceCommand('status', m.deps);
  assert.match(status.message, /служба: не отвечает на порту 4747/);
  assert.match(status.message, /автозапуск: LaunchAgent — зарегистрирован/);
  assert.match(status.message, /программы: node \/opt\/homebrew\/bin\/node, claude —/);

  const start = await runServiceCommand('start', m.deps);
  assert.match(start.message, /^служба запущена: pid \d+, версия 0\.1\.0, http:\/\/127\.0\.0\.1:4747\/$/);
  assert.match((await runServiceCommand('start', m.deps)).message, /^служба уже работает/);
  assert.match((await runServiceCommand('status', m.deps)).message, /служба: работает \(pid \d+, версия 0\.1\.0, порт 4747\)/);
});

test('stop falls back to TERM for the pid that /api/health reports', async () => {
  const m = standardMachine('linux', {
    extra: (command, args) => (command === 'systemctl' && args[1] === 'show-environment' ? { code: 1 } : undefined),
  });
  m.backend.health = { ok: true, version: '0.0.9', pid: 777 };
  const stop = await runServiceCommand('stop', m.deps);
  assert.equal(stop.message, 'служба остановлена');
  assert.deepEqual(m.killed, [777]);
});

test('a backend that does not come up is an error with the log path', async () => {
  const m = standardMachine('linux', {
    extra: (command, args) => (command === 'systemctl' && args[1] === 'show-environment' ? { code: 1 } : undefined),
  });
  m.deps.spawnDetached = async () => undefined;
  const start = await runServiceCommand('start', m.deps);
  assert.equal(start.exitCode, 1);
  assert.match(start.message, /не ответила на \/api\/health .*service\.log/);
});

test('open starts the service when needed and opens an app window', async () => {
  const m = standardMachine('darwin');
  await runServiceCommand('install', m.deps);
  await runServiceCommand('stop', m.deps);
  m.fs.seed('/Applications/Google Chrome.app/Contents/Info.plist', 'x');
  const open = await runServiceCommand('open', m.deps);
  assert.equal(open.exitCode, 0, open.message);
  assert.equal(open.message, 'панель открыта в окне приложения: http://127.0.0.1:4747/');
  const lines = m.lines();
  assert.ok(lines.includes(`/bin/launchctl bootstrap gui/501 /Users/me/Library/LaunchAgents/ai.workflowkit.backend.plist`));
  assert.equal(
    lines.at(-1),
    `/usr/bin/open -na /Applications/Google Chrome.app --args --app=http://127.0.0.1:4747/ --user-data-dir=${MAC_DATA}/panel-browser --no-first-run --no-default-browser-check`,
  );
  const again = await runServiceCommand('open', m.deps);
  assert.equal(again.exitCode, 0);
  assert.equal(m.lines().filter((line) => line.includes('bootstrap')).length, 2, 'a running service is not started twice');
});

test('a development instance opens on its own port with a detached backend', async () => {
  const m = standardMachine('linux', { env: { WFK_DATA_DIR: '/tmp/dev', WFK_PORT: '4999' } });
  m.fs.seed('/usr/bin/chromium', 'x', 0o755);
  const open = await runServiceCommand('open', m.deps);
  assert.equal(open.message, 'панель открыта в окне приложения: http://127.0.0.1:4999/');
  assert.deepEqual(m.spawned[0]?.args, ['/src/clone/bin/wfk.mjs', 'serve']);
  assert.equal(m.spawned[1]?.command, '/usr/bin/chromium');
  assert.deepEqual(m.spawned[1]?.args.slice(0, 2), ['--app=http://127.0.0.1:4999/', '--user-data-dir=/tmp/dev/panel-browser']);
  assert.equal(m.spawned[1]?.env['CLAUDECODE'], undefined);
});

test('browserPlan for the three OS with and without Chrome or Edge', () => {
  const none = { exists: () => false, findInPath: () => null };
  const base = { url: 'http://127.0.0.1:4747/', profileDir: '/p' };
  assert.deepEqual(browserPlan({ ...base, ...none, platform: 'darwin', env: {}, homedir: '/Users/me' }), {
    command: '/usr/bin/open',
    args: ['http://127.0.0.1:4747/'],
    detached: false,
    kind: 'browser',
  });
  const edgeInHome = browserPlan({
    ...base,
    platform: 'darwin',
    env: {},
    homedir: '/Users/me',
    exists: (file) => file === '/Users/me/Applications/Microsoft Edge.app',
    findInPath: () => null,
  });
  assert.deepEqual(edgeInHome.args.slice(0, 3), ['-na', '/Users/me/Applications/Microsoft Edge.app', '--args']);
  const winEnv = { 'ProgramFiles(x86)': 'C:\\PF86', ProgramFiles: 'C:\\PF', SystemRoot: 'C:\\Windows' };
  const edge = browserPlan({ ...base, platform: 'win32', env: winEnv, homedir: 'C:\\Users\\me', exists: (file) => file === 'C:\\PF\\Microsoft\\Edge\\Application\\msedge.exe', findInPath: () => null });
  assert.equal(edge.command, 'C:\\PF\\Microsoft\\Edge\\Application\\msedge.exe');
  assert.equal(edge.kind, 'app-window');
  const winDefault = browserPlan({ ...base, ...none, platform: 'win32', env: winEnv, homedir: 'C:\\Users\\me' });
  assert.deepEqual([winDefault.command, ...winDefault.args], ['C:\\Windows\\System32\\rundll32.exe', 'url.dll,FileProtocolHandler', 'http://127.0.0.1:4747/']);
  const linux = browserPlan({ ...base, platform: 'linux', env: {}, homedir: '/home/me', exists: () => false, findInPath: (name) => (name === 'xdg-open' ? '/usr/bin/xdg-open' : null) });
  assert.deepEqual([linux.command, ...linux.args], ['/usr/bin/xdg-open', 'http://127.0.0.1:4747/']);
});

test('doctor --installed checks the installed service and /api/health', async () => {
  const m = standardMachine('darwin', {
    extra: (command, args) => (command === '/bin/launchctl' && args[0] === 'print' && m.backend.health ? { code: 0 } : undefined),
  });
  const before = await runServiceCommand('doctor', m.deps, ['--installed']);
  assert.equal(before.exitCode, 1);
  assert.match(before.message, /\[ошибка\] установка: нет .*current\.json/);
  await runServiceCommand('install', m.deps);
  const report = await runServiceCommand('doctor', m.deps, ['--installed']);
  assert.equal(report.exitCode, 0, report.message);
  for (const name of ['установка', 'запускатель wfk', 'значок', 'автозапуск \\(LaunchAgent\\)', 'LaunchAgent загружен', 'служба \\(/api/health\\)']) {
    assert.match(report.message, new RegExp(`\\[ok\\]\\s+${name}`));
  }
  assert.match(report.message, /\[предупреждение\] программа claude: не найдена/);
  await m.fs.remove('/Users/me/.local/bin/wfk');
  const broken = await runServiceCommand('doctor', m.deps, ['--installed']);
  assert.equal(broken.exitCode, 1);
  assert.match(broken.message, /\[ошибка\] запускатель wfk/);
  const plain = await runServiceCommand('doctor', m.deps);
  assert.equal(plain.exitCode, 0, 'without --installed only the environment is checked');
});

test('doctor shows the shared access of ChatGPT (M12): a state that needs the user warns', async () => {
  const m = standardMachine('darwin');
  await runServiceCommand('install', m.deps);
  assert.doesNotMatch((await runServiceCommand('doctor', m.deps)).message, /общий доступ/, 'no line when the service does not answer it');
  m.backend.sharedAccess = { state: 'active', label: 'Работает', reason: null };
  assert.match((await runServiceCommand('doctor', m.deps)).message, /\[ok\]\s+ChatGPT: общий доступ к чатам: Работает/);
  m.backend.sharedAccess = { state: 'needs-remote-login', label: 'Нужен «Удалённый вход»', reason: 'порт 22 не отвечает' };
  const warn = await runServiceCommand('doctor', m.deps);
  assert.match(warn.message, /\[предупреждение\] ChatGPT: общий доступ к чатам: Нужен «Удалённый вход» — порт 22 не отвечает/);
  assert.equal(warn.exitCode, 0, 'a warning does not fail doctor');
  assert.doesNotMatch(warn.message, /проверки общего доступа/, 'the checks line is only for Windows');
});

test('doctor on Windows prints the checks of the shared access (M13)', async () => {
  const m = standardMachine('win32');
  await runServiceCommand('install', m.deps);
  m.backend.sharedAccess = { state: 'unsupported', label: 'Недоступно', reason: 'на Windows общий доступ ещё не подтверждён пробой (M13)', hint: 'Проверено: codex. Не прошло: сервер OpenSSH (служба sshd не установлена).' };
  const report = await runServiceCommand('doctor', m.deps);
  assert.match(report.message, /\[ok\]\s+ChatGPT: проверки общего доступа: Проверено: codex\. Не прошло: сервер OpenSSH/);
});
