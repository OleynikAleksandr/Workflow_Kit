import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runServiceCommand } from '../src/index.ts';
import { MAC_APP_SOURCE } from '../src/templates.ts';
import { standardMachine } from './fakes.ts';
import type { Handler } from './fakes.ts';

const MAC_DATA = '/Users/me/Library/Application Support/Workflow Kit';
const APP = '/Users/me/Applications/Workflow Kit.app';
const INSTALLED_SOURCE = `${MAC_DATA}/app/0.1.0/${MAC_APP_SOURCE}`;

function machine(extra?: Handler) {
  const m = standardMachine('darwin', extra ? { extra } : {});
  m.fs.seed(`/src/clone/${MAC_APP_SOURCE}`, '// app');
  return m;
}

test('macOS install builds the app with its own window, Dock icon and the Claude | ChatGPT picture', async () => {
  const m = machine();
  const result = await runServiceCommand('install', m.deps);
  assert.equal(result.exitCode, 0, result.message);
  assert.match(result.message, /значок: .*Workflow Kit\.app \(приложение с окном панели\)/);
  const info = m.fs.readTextSync(`${APP}/Contents/Info.plist`) ?? '';
  assert.match(info, /<string>ai\.workflowkit\.launcher<\/string>/, 'the same bundle id: uninstall and reinstall recognise it');
  assert.doesNotMatch(info, /LSUIElement/, 'a regular app: it shows in the Dock');
  assert.match(info, /<key>CFBundleIconFile<\/key>\s*<string>AppIcon<\/string>/);
  assert.match(info, new RegExp(`<key>WFKEntry</key>\\s*<string>${MAC_DATA}/app/0\\.1\\.0/bin/wfk\\.mjs</string>`));
  assert.match(info, /<key>WFKNode<\/key>\s*<string>\/opt\/homebrew\/bin\/node<\/string>/);
  const exe = `${APP}/Contents/MacOS/workflow-kit`;
  const lines = m.lines();
  assert.ok(lines.includes(`/usr/bin/xcrun swiftc -O -o ${exe} ${INSTALLED_SOURCE}`), lines.join('\n'));
  assert.ok(lines.includes(`${exe} --make-iconset ${APP}/Contents/Resources/AppIcon.iconset`));
  assert.ok(lines.includes(`/usr/bin/iconutil -c icns -o ${APP}/Contents/Resources/AppIcon.icns ${APP}/Contents/Resources/AppIcon.iconset`));
  assert.ok(lines.some((line) => line.endsWith(`lsregister -f ${APP}`)));

  const open = await runServiceCommand('open', m.deps);
  assert.equal(open.message, 'панель открыта в приложении Workflow Kit: http://127.0.0.1:4747/');
  assert.equal(m.lines().at(-1), `/usr/bin/open ${APP}`);

  const before = m.lines().length;
  const url = await runServiceCommand('open', m.deps, ['--url-only']);
  assert.equal(url.message, 'панель: http://127.0.0.1:4747/');
  assert.ok(!m.lines().slice(before).some((line) => line.startsWith('/usr/bin/open')), 'the app asks only for the URL');
  assert.equal((await runServiceCommand('open', m.deps, ['--bad'])).exitCode, 1);
});

test('without swiftc the icon is the script that opens a browser window, with the reason', async () => {
  const m = machine((command) => (command === '/usr/bin/xcrun' ? { code: 1, stderr: 'xcrun: error: invalid active developer path' } : undefined));
  const result = await runServiceCommand('install', m.deps);
  assert.equal(result.exitCode, 0, result.message);
  assert.match(result.message, /\(окно браузера\); swiftc: xcrun: error: invalid active developer path/);
  assert.match(m.fs.readTextSync(`${APP}/Contents/Info.plist`) ?? '', /<key>LSUIElement<\/key>/);
  assert.match(m.fs.readTextSync(`${APP}/Contents/MacOS/workflow-kit`) ?? '', / open >>'.*\/logs\/open\.log' 2>&1/);
});

test('a failed picture keeps the app, with the generic icon and a note', async () => {
  const m = machine((command) => (command === '/usr/bin/iconutil' ? { code: 1, stderr: 'Invalid Iconset.' } : undefined));
  const result = await runServiceCommand('install', m.deps);
  assert.match(result.message, /\(приложение с окном панели\); значок без картинки: Invalid Iconset\./);
  assert.ok(!m.fs.existsSync(`${APP}/Contents/Resources/AppIcon.iconset`));
});
