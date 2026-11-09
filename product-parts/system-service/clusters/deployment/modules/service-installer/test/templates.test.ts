import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LAUNCHER_MARK as CLI_LAUNCHER_MARK } from '#cli';
import { LAUNCHER_MARK, serviceLayout } from '../src/index.ts';
import { addUserPathScript, loginPathCommands, parseLoginPath, parseRegQuery, removeUserPathScript } from '../src/commands.ts';
import { findProgram, mergePath } from '../src/programs.ts';
import { desktopExecArg, isOwnLauncher, launchAgentPlist, posixLauncher, systemdQuote, windowsLauncher } from '../src/templates.ts';

test('the launcher mark is the one the cli module uses for wfk link', () => {
  assert.equal(LAUNCHER_MARK, CLI_LAUNCHER_MARK);
  assert.ok(isOwnLauncher(posixLauncher('/n', '/e')));
  assert.ok(isOwnLauncher(windowsLauncher('C:\\n.exe', 'C:\\e')));
  assert.ok(isOwnLauncher('#!/bin/sh\n# Workflow Kit launcher (wfk link: development clone)\n'));
  assert.ok(!isOwnLauncher('#!/bin/sh\necho other\n'));
});

test('quoting: shell, plist XML, systemd and desktop Exec', () => {
  assert.equal(posixLauncher("/a b/node", "/it's/wfk.mjs"), `#!/bin/sh\n# Workflow Kit launcher (wfk install)\nexec '/a b/node' '/it'\\''s/wfk.mjs' "$@"\n`);
  const plist = launchAgentPlist({ node: '/n', entry: '/a&b/<e>', workingDir: '/w', path: '/bin', logFile: '/l' });
  assert.match(plist, /<string>\/a&amp;b\/&lt;e&gt;<\/string>/);
  assert.equal(systemdQuote('/a "b"/100%/$HOME\\x'), '"/a \\"b\\"/100%%/$$HOME\\\\x"');
  assert.equal(desktopExecArg('/a b/$x%'), '"/a b/\\\\$x%%"');
  assert.equal(windowsLauncher('C:\\100%\\node.exe', 'C:\\e'), '@echo off\r\nrem Workflow Kit launcher (wfk install)\r\n"C:\\100%%\\node.exe" "C:\\e" %*\r\n');
});

test('layout for the three OS on a fake HOME', () => {
  const mac = serviceLayout({ platform: 'darwin', env: {}, homedir: '/Users/me' });
  assert.equal(mac.appRoot, '/Users/me/Library/Application Support/Workflow Kit/app');
  assert.equal(mac.launcher, '/Users/me/.local/bin/wfk');
  assert.equal(mac.icon, '/Users/me/Applications/Workflow Kit.app');
  assert.equal(mac.launchAgentPlist, '/Users/me/Library/LaunchAgents/ai.workflowkit.backend.plist');
  const linux = serviceLayout({ platform: 'linux', env: { XDG_DATA_HOME: 'relative' }, homedir: '/home/me' });
  assert.equal(linux.appRoot, '/home/me/.local/share/workflow-kit/app');
  assert.equal(linux.icon, '/home/me/.local/share/applications/workflow-kit.desktop');
  assert.equal(linux.systemdUnitFile, '/home/me/.config/systemd/user/workflow-kit.service');
  assert.equal(linux.xdgAutostartFile, '/home/me/.config/autostart/workflow-kit.desktop');
  assert.equal(linux.serviceLog, '/home/me/.local/state/workflow-kit/logs/service.log');
  const win = serviceLayout({ platform: 'win32', env: { LOCALAPPDATA: 'D:\\Local' }, homedir: 'C:\\Users\\me' });
  assert.equal(win.launcher, 'D:\\Local\\Workflow Kit\\wfk.cmd');
  assert.equal(win.icon, 'C:\\Users\\me\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Workflow Kit.lnk');
  assert.equal(win.serviceVbs, 'D:\\Local\\Workflow Kit\\wfk-service.vbs');
  const dev = serviceLayout({ platform: 'darwin', env: { WFK_DATA_DIR: '/tmp/dev' }, homedir: '/Users/me' });
  assert.equal(dev.development, true);
  assert.equal(dev.currentFile, '/tmp/dev/app/current.json');
});

test('login PATH, PATH merge and program lookup', () => {
  const [interactive, login] = loginPathCommands('/bin/zsh');
  assert.deepEqual(interactive?.args.slice(0, 3), ['-i', '-l', '-c']);
  assert.deepEqual(login?.args.slice(0, 2), ['-l', '-c']);
  assert.equal(parseLoginPath('motd\n__WFK_PATH__/a:/b__WFK_PATH__'), '/a:/b');
  assert.equal(parseLoginPath('no markers'), null);
  assert.equal(mergePath('darwin', '/a:/b', '/b:/c', ''), '/a:/b:/c');
  assert.equal(mergePath('win32', 'C:\\A;C:\\b', 'c:\\a;D:\\x'), 'C:\\A;C:\\b;D:\\x');
  const executables = new Set(['/b/claude', 'C:\\Tools\\codex.CMD'.toLowerCase()]);
  const isExecutable = (file: string): boolean => executables.has(file) || executables.has(file.toLowerCase());
  assert.equal(findProgram('claude', '/a:relative:/b', { platform: 'darwin', env: {}, isExecutable }), '/b/claude');
  assert.equal(findProgram('codex', 'C:\\Tools', { platform: 'win32', env: { PATHEXT: '.EXE;.CMD' }, isExecutable }), 'C:\\Tools\\codex.cmd');
  assert.equal(findProgram('expect', '/a', { platform: 'linux', env: {}, isExecutable }), null);
});

test('Windows registry and PATH helpers', () => {
  const out = '\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\r\n    WorkflowKit    REG_SZ    "C:\\Windows\\System32\\wscript.exe" "C:\\x.vbs"\r\n';
  assert.equal(parseRegQuery(out), '"C:\\Windows\\System32\\wscript.exe" "C:\\x.vbs"');
  assert.equal(parseRegQuery('nothing'), null);
  assert.match(addUserPathScript("C:\\it's"), /\$d = 'C:\\it''s'/);
  assert.match(removeUserPathScript('C:\\x'), /Where-Object \{ \$_ -ne '' -and \$_ -ne \$d \}/);
});
