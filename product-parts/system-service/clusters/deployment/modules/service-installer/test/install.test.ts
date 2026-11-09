import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getServiceStatus, runServiceCommand } from '../src/index.ts';
import { LOGIN_PATH, seedClone, standardMachine } from './fakes.ts';

const MAC_DATA = '/Users/me/Library/Application Support/Workflow Kit';
const MAC_PLIST = '/Users/me/Library/LaunchAgents/ai.workflowkit.backend.plist';

test('macOS install: copy, current.json, programs, launcher, icon, LaunchAgent and start', async () => {
  const m = standardMachine('darwin');
  m.fs.seed('/opt/homebrew/bin/claude', 'x', 0o755);
  m.fs.seed('/opt/homebrew/bin/codex', 'x', 0o755);
  m.fs.seed(`${MAC_DATA}/config.json`, JSON.stringify({ port: 4800, projectsRoot: '/Users/me/P' }));
  const result = await runServiceCommand('install', m.deps);
  assert.equal(result.exitCode, 0, result.message);
  assert.match(result.message, /Workflow Kit 0\.1\.0 установлен .*новая установка/);
  assert.match(result.message, /служба: работает/);

  const app = `${MAC_DATA}/app/0.1.0`;
  assert.ok(m.fs.existsSync(`${app}/bin/wfk.mjs`));
  assert.ok(m.fs.existsSync(`${app}/package.json`));
  assert.ok(m.fs.existsSync(`${app}/product-parts/part/src/index.ts`));
  assert.ok(!m.fs.existsSync(`${app}/product-parts/part/test/index.test.ts`), 'tests are not copied');
  assert.ok(!m.fs.existsSync(`${app}/docs/note.md`), 'only bin, product-parts, package.json');

  const current = JSON.parse(m.fs.readTextSync(`${MAC_DATA}/app/current.json`) ?? '') as Record<string, unknown>;
  assert.equal(current['version'], '0.1.0');
  assert.equal(current['entry'], `${app}/bin/wfk.mjs`);
  assert.equal(current['node'], '/opt/homebrew/bin/node');
  assert.equal(current['mechanism'], 'launchagent');
  assert.equal(current['autostartEntry'], MAC_PLIST);
  assert.equal(m.fs.mode(`${MAC_DATA}/app/current.json`), 0o600);

  const config = JSON.parse(m.fs.readTextSync(`${MAC_DATA}/config.json`) ?? '') as Record<string, unknown>;
  assert.equal(config['port'], 4800, 'other keys stay');
  assert.equal(config['projectsRoot'], '/Users/me/P');
  assert.deepEqual(config['programs'], { node: '/opt/homebrew/bin/node', claude: '/opt/homebrew/bin/claude', codex: '/opt/homebrew/bin/codex' });
  assert.equal(config['loginPath'], LOGIN_PATH['darwin']);

  const launcher = m.fs.readTextSync('/Users/me/.local/bin/wfk') ?? '';
  assert.match(launcher, /^#!\/bin\/sh\n# Workflow Kit launcher/);
  assert.match(launcher, new RegExp(`exec '/opt/homebrew/bin/node' '${app}/bin/wfk.mjs' "\\$@"`));
  assert.equal(m.fs.mode('/Users/me/.local/bin/wfk'), 0o755);

  const icon = '/Users/me/Applications/Workflow Kit.app/Contents';
  assert.match(m.fs.readTextSync(`${icon}/Info.plist`) ?? '', /<string>ai\.workflowkit\.launcher<\/string>/);
  assert.match(m.fs.readTextSync(`${icon}/MacOS/workflow-kit`) ?? '', / open >>'.*\/logs\/open\.log' 2>&1/);
  assert.equal(m.fs.mode(`${icon}/MacOS/workflow-kit`), 0o755);

  const plist = m.fs.readTextSync(MAC_PLIST) ?? '';
  for (const key of ['RunAtLoad', 'KeepAlive', 'AbandonProcessGroup']) assert.match(plist, new RegExp(`<key>${key}</key>\\s*<true/>`));
  assert.match(plist, /<string>\/opt\/homebrew\/bin\/node<\/string>/);
  assert.match(plist, /<key>PATH<\/key>\s*<string>\/opt\/homebrew\/bin:\/usr\/bin:\/bin<\/string>/);

  const launchctl = m.lines().filter((line) => line.startsWith('/bin/launchctl'));
  assert.deepEqual(launchctl, [
    '/bin/launchctl bootout gui/501/ai.workflowkit.backend',
    '/bin/launchctl print gui/501/ai.workflowkit.backend',
    '/bin/launchctl print gui/501/ai.workflowkit.backend',
    `/bin/launchctl bootstrap gui/501 ${MAC_PLIST}`,
  ]);
  assert.equal(m.spawned.length, 0, 'launchd starts the service, nothing detached');

  const status = getServiceStatus('darwin', { ...m.deps, serving: true });
  assert.equal(status.implemented, true);
  assert.equal(status.installed, true);
  assert.equal(status.autostart, true);
  assert.equal(status.mechanism, 'launchagent');
  assert.equal(status.version, '0.1.0');
  assert.equal(status.launcher?.present, true);
  assert.equal(status.icon?.present, true);
  assert.equal(status.programs?.['claude'], '/opt/homebrew/bin/claude');
  assert.equal(status.instance, 'default');
  assert.match(status.note, /версия 0\.1\.0, автозапуск: LaunchAgent; эта служба запущена из клона/);
});

test('a repeated install updates the version and keeps one previous copy', async () => {
  const m = standardMachine('darwin');
  assert.equal((await runServiceCommand('install', m.deps)).exitCode, 0);
  for (const version of ['0.2.0', '0.3.0']) {
    seedClone(m.fs, '/src/clone', version);
    const result = await runServiceCommand('install', m.deps);
    assert.equal(result.exitCode, 0, result.message);
    assert.equal(m.backend.health?.version, version, 'the service runs the new version');
  }
  assert.deepEqual(await m.fs.list(`${MAC_DATA}/app`), ['0.2.0', '0.3.0', 'current.json']);
  assert.match(m.fs.readTextSync('/Users/me/.local/bin/wfk') ?? '', /app\/0\.3\.0\/bin\/wfk\.mjs/);
  assert.match(m.fs.readTextSync(MAC_PLIST) ?? '', /app\/0\.3\.0\/bin\/wfk\.mjs/);
  const again = await runServiceCommand('install', m.deps);
  assert.match(again.message, /повторная установка/);
});

test('install refuses to replace a launcher that Workflow Kit did not write', async () => {
  const m = standardMachine('darwin');
  m.fs.seed('/Users/me/.local/bin/wfk', '#!/bin/sh\necho mine\n', 0o755);
  const result = await runServiceCommand('install', m.deps);
  assert.equal(result.exitCode, 1);
  assert.match(result.message, /создан не Workflow Kit/);
  assert.ok(!m.fs.existsSync(`${MAC_DATA}/app`), 'nothing was installed');
  assert.equal(m.fs.readTextSync('/Users/me/.local/bin/wfk'), '#!/bin/sh\necho mine\n');
});

test('the icon of another app is kept, the prototype applet is replaced', async () => {
  const info = '/Users/me/Applications/Workflow Kit.app/Contents/Info.plist';
  const foreign = standardMachine('darwin');
  foreign.fs.seed(info, '<key>CFBundleIdentifier</key><string>com.example.other</string>');
  const refused = await runServiceCommand('install', foreign.deps);
  assert.equal(refused.exitCode, 1);
  assert.match(refused.message, /Workflow Kit\.app уже существует и создан не Workflow Kit/);

  const prototype = standardMachine('darwin');
  prototype.fs.seed(info, '<key>CFBundleIdentifier</key><string>com.workflowkit.launcher</string>');
  prototype.fs.seed('/Users/me/Applications/Workflow Kit.app/Contents/Resources/Scripts/main.scpt', 'applet');
  const replaced = await runServiceCommand('install', prototype.deps);
  assert.equal(replaced.exitCode, 0, replaced.message);
  assert.match(prototype.fs.readTextSync(info) ?? '', /ai\.workflowkit\.launcher/);
  assert.ok(!prototype.fs.existsSync('/Users/me/Applications/Workflow Kit.app/Contents/Resources/Scripts/main.scpt'));
});

test('macOS uninstall removes autostart, launcher, icon and app copies, the data stays', async () => {
  const m = standardMachine('darwin');
  await runServiceCommand('install', m.deps);
  m.fs.seed(`${MAC_DATA}/projects.json`, '[]');
  const result = await runServiceCommand('uninstall', m.deps);
  assert.equal(result.exitCode, 0, result.message);
  assert.match(result.message, /служба остановлена/);
  for (const gone of [MAC_PLIST, '/Users/me/.local/bin/wfk', '/Users/me/Applications/Workflow Kit.app', `${MAC_DATA}/app`]) {
    assert.ok(!m.fs.existsSync(gone), gone);
  }
  assert.ok(m.fs.existsSync(`${MAC_DATA}/projects.json`));
  assert.ok(m.fs.existsSync(`${MAC_DATA}/config.json`));
  assert.equal(m.backend.health, null);
  const status = getServiceStatus('darwin', m.deps);
  assert.equal(status.installed, false);
  assert.equal(status.autostart, false);
});

test('Linux with systemd: user unit with KillMode=process, enable and restart', async () => {
  const m = standardMachine('linux', { env: { XDG_CONFIG_HOME: '/home/me/.cfg', XDG_DATA_HOME: '/home/me/.data' } });
  m.fs.seed('/usr/bin/expect', 'x', 0o755);
  const result = await runServiceCommand('install', m.deps);
  assert.equal(result.exitCode, 0, result.message);
  const unitFile = '/home/me/.cfg/systemd/user/workflow-kit.service';
  const unit = m.fs.readTextSync(unitFile) ?? '';
  assert.match(unit, /^KillMode=process$/m);
  assert.match(unit, /^ExecStart="\/usr\/bin\/node" "\/home\/me\/\.data\/workflow-kit\/app\/0\.1\.0\/bin\/wfk\.mjs" "serve"$/m);
  assert.match(unit, /^Environment="PATH=\/usr\/bin:\/home\/me\/\.local\/bin:\/bin"$/m);
  assert.match(unit, /^WantedBy=default\.target$/m);
  const systemctl = m.lines().filter((line) => line.startsWith('systemctl'));
  assert.deepEqual(systemctl, [
    'systemctl --user show-environment',
    'systemctl --user daemon-reload',
    'systemctl --user enable workflow-kit.service',
    'systemctl --user restart workflow-kit.service',
  ]);
  assert.match(m.fs.readTextSync('/home/me/.data/applications/workflow-kit.desktop') ?? '', /^Exec="\/home\/me\/\.local\/bin\/wfk" open$/m);
  const config = JSON.parse(m.fs.readTextSync('/home/me/.cfg/workflow-kit/config.json') ?? '') as { programs: Record<string, string> };
  assert.equal(config.programs['expect'], '/usr/bin/expect');
  assert.equal(getServiceStatus('linux', m.deps).mechanism, 'systemd-user');

  const removed = await runServiceCommand('uninstall', m.deps);
  assert.equal(removed.exitCode, 0, removed.message);
  assert.ok(!m.fs.existsSync(unitFile));
  assert.ok(m.lines().includes('systemctl --user disable workflow-kit.service'));
  assert.ok(m.lines().includes('systemctl --user stop workflow-kit.service'));
});

test('Linux without systemd: XDG autostart and a detached service', async () => {
  const m = standardMachine('linux', {
    extra: (command, args) => (command === 'systemctl' && args[1] === 'show-environment' ? { code: 1, stderr: 'no user bus' } : undefined),
  });
  const result = await runServiceCommand('install', m.deps);
  assert.equal(result.exitCode, 0, result.message);
  const autostart = m.fs.readTextSync('/home/me/.config/autostart/workflow-kit.desktop') ?? '';
  assert.match(autostart, /^Exec="\/usr\/bin\/node" "\/home\/me\/\.local\/share\/workflow-kit\/app\/0\.1\.0\/bin\/wfk\.mjs" service start$/m);
  assert.match(autostart, /^X-WorkflowKit-Managed=true$/m);
  assert.equal(m.spawned.length, 1);
  const spawn = m.spawned[0];
  assert.deepEqual(spawn?.args, ['/home/me/.local/share/workflow-kit/app/0.1.0/bin/wfk.mjs', 'serve']);
  assert.equal(spawn?.env['PATH'], `/usr/bin:${(LOGIN_PATH['linux'] ?? '').replace(':/usr/bin', '')}`);
  assert.equal(spawn?.env['CLAUDECODE'], undefined, 'no CLAUDE* in the service environment');
  assert.equal(spawn?.logFile, '/home/me/.local/state/workflow-kit/logs/service.log');
  assert.equal(getServiceStatus('linux', m.deps).mechanism, 'xdg-autostart');

  const pid = m.backend.health?.pid;
  const stop = await runServiceCommand('stop', m.deps);
  assert.equal(stop.message, 'служба остановлена');
  assert.deepEqual(m.killed, [pid]);
});

test('Windows: wfk.cmd, hidden Run value, user PATH, Start menu shortcut', async () => {
  const m = standardMachine('win32');
  const result = await runServiceCommand('install', m.deps);
  assert.equal(result.exitCode, 0, result.message);
  const data = 'C:\\Users\\me\\AppData\\Local\\Workflow Kit';
  const entry = `${data}\\app\\0.1.0\\bin\\wfk.mjs`;
  assert.equal(
    m.fs.readTextSync(`${data}\\wfk.cmd`),
    `@echo off\r\nrem Workflow Kit launcher (wfk install)\r\n"C:\\Program Files\\nodejs\\node.exe" "${entry}" %*\r\n`,
  );
  // Git Bash launcher and the hook launcher next to wfk.cmd (spec M5 section 6).
  assert.equal(
    m.fs.readTextSync(`${data}\\wfk`),
    `#!/bin/sh\n# Workflow Kit launcher (wfk install)\nexec 'C:/Program Files/nodejs/node.exe' 'C:/Users/me/AppData/Local/Workflow Kit/app/0.1.0/bin/wfk.mjs' "$@"\n`,
  );
  assert.match(m.fs.readTextSync(`${data}\\wfk.mjs`) ?? '', /await import\("file:\/\/\/C:\/Users\/me\/AppData\/Local\/Workflow%20Kit\/app\/0\.1\.0\/bin\/wfk\.mjs"\);/);
  const serviceVbs = m.fs.readTextSync(`${data}\\wfk-service.vbs`) ?? '';
  assert.match(serviceVbs, /shell\.Run """C:\\Program Files\\nodejs\\node\.exe"" ""C:\\Users\\me\\AppData\\Local\\Workflow Kit\\app\\0\.1\.0\\bin\\wfk\.mjs"" service start", 0, False/);
  const reg = m.calls.find((call) => call.command === 'C:\\Windows\\System32\\reg.exe');
  assert.deepEqual(reg?.args, [
    'add',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    '/v',
    'WorkflowKit',
    '/t',
    'REG_SZ',
    '/d',
    `"C:\\Windows\\System32\\wscript.exe" "${data}\\wfk-service.vbs"`,
    '/f',
  ]);
  const scripts = m.calls.filter((call) => call.command.endsWith('powershell.exe')).map((call) => call.args.at(-1) ?? '');
  assert.equal(scripts.length, 2);
  assert.match(scripts[0] ?? '', /\$d = 'C:\\Users\\me\\AppData\\Local\\Workflow Kit'.*SetEnvironmentVariable\('Path'/);
  assert.match(scripts[1] ?? '', /CreateShortcut\('C:\\Users\\me\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Workflow Kit\.lnk'\)/);
  assert.match(m.fs.readTextSync(`${data}\\wfk-open.vbs`) ?? '', /"" open", 0, False/);
  assert.deepEqual(m.spawned[0]?.args, [entry, 'serve']);
  const status = getServiceStatus('win32', m.deps);
  assert.equal(status.mechanism, 'hkcu-run');
  assert.equal(status.autostart, true);
  assert.equal(status.icon?.present, true);

  const removed = await runServiceCommand('uninstall', m.deps);
  assert.equal(removed.exitCode, 0, removed.message);
  assert.ok(m.lines().some((line) => line.startsWith('C:\\Windows\\System32\\reg.exe delete HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v WorkflowKit /f')));
  for (const gone of [`${data}\\wfk.cmd`, `${data}\\wfk`, `${data}\\wfk.mjs`, `${data}\\wfk-service.vbs`, `${data}\\wfk-open.vbs`, `${data}\\app`]) assert.ok(!m.fs.existsSync(gone), gone);
  assert.ok(!m.fs.existsSync('C:\\Users\\me\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Workflow Kit.lnk'));
  assert.match(m.calls.at(-1)?.args.at(-1) ?? '', /\$_ -ne \$d/);
});

test('a development instance (WFK_DATA_DIR) gets the copy and the service, no launcher, icon or autostart', async () => {
  const m = standardMachine('darwin', { env: { WFK_DATA_DIR: '/tmp/wfk-dev', WFK_PORT: '4999' } });
  const result = await runServiceCommand('install', m.deps);
  assert.equal(result.exitCode, 0, result.message);
  assert.match(result.message, /экземпляр разработки/);
  assert.ok(m.fs.existsSync('/tmp/wfk-dev/app/0.1.0/bin/wfk.mjs'));
  assert.ok(!m.fs.existsSync('/Users/me/.local/bin/wfk'));
  assert.ok(!m.fs.existsSync(MAC_PLIST));
  assert.ok(!m.fs.existsSync('/Users/me/Applications/Workflow Kit.app'));
  assert.ok(!m.lines().some((line) => line.startsWith('/bin/launchctl')), 'launchd is never touched');
  assert.equal(m.spawned[0]?.env['WFK_DATA_DIR'], '/tmp/wfk-dev');
  const status = getServiceStatus('darwin', m.deps);
  assert.equal(status.instance, 'development');
  assert.equal(status.autostart, false);
  const removed = await runServiceCommand('uninstall', m.deps);
  assert.equal(removed.exitCode, 0, removed.message);
  assert.ok(!m.fs.existsSync('/tmp/wfk-dev/app'));
});
