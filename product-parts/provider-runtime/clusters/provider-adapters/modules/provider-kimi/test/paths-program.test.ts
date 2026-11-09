// Paths of the Kimi Code home, the program and the answer shapes; OS branches run with the
// platform injected.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KimiError } from '../src/client.ts';
import { envValue, envWithout, kimiHome, kimiPaths, sameFolder } from '../src/paths.ts';
import { compareVersions, parseVersion, readProgram, testedVersion } from '../src/program.ts';
import { parseAuth, parseConfig, parseInstance, parseMeta, parseTrusted, parseWorkspaces } from '../src/shapes.ts';
import { pickWorkspace, workspaceKey } from '../src/workspace.ts';
import { fakeKimi, fixture } from './helpers.ts';

test('Kimi home: KIMI_CODE_HOME, else .kimi-code of the user (macOS, Linux, Windows)', () => {
  assert.equal(kimiHome({}, '/Users/me', 'darwin'), '/Users/me/.kimi-code');
  assert.equal(kimiHome({ KIMI_CODE_HOME: '/data/kimi' }, '/home/me', 'linux'), '/data/kimi');
  assert.equal(kimiHome({ KIMI_CODE_HOME: 'kimi' }, '/home/me', 'linux'), '/home/me/kimi');
  assert.equal(kimiHome({}, 'C:\\Users\\Me', 'win32'), 'C:\\Users\\Me\\.kimi-code');
  assert.equal(kimiHome({ Kimi_Code_Home: 'D:\\kimi' }, 'C:\\Users\\Me', 'win32'), 'D:\\kimi');
  assert.equal(kimiHome({ kimi_code_home: '/other' }, '/home/me', 'linux'), '/home/me/.kimi-code');
});

test('paths inside the home: kimi.exe and backslashes on Windows, kimi and slashes elsewhere', () => {
  const windows = kimiPaths('C:\\Users\\Me\\.kimi-code', 'win32');
  assert.equal(windows.program, 'C:\\Users\\Me\\.kimi-code\\bin\\kimi.exe');
  assert.equal(windows.instances, 'C:\\Users\\Me\\.kimi-code\\server\\instances');
  assert.equal(windows.trustDir, 'C:\\Users\\Me\\.kimi-code\\workspace-trust');
  for (const platform of ['linux', 'darwin'] as const) {
    const posix = kimiPaths('/home/me/.kimi-code', platform);
    assert.equal(posix.program, '/home/me/.kimi-code/bin/kimi');
    assert.equal(posix.token, '/home/me/.kimi-code/server.token');
    assert.equal(posix.locks, '/home/me/.kimi-code/locks/sessions');
  }
});

test('environment names: without case on Windows only', () => {
  assert.equal(envValue({ Path: 'x' }, 'PATH', 'win32'), 'x');
  assert.equal(envValue({ Path: 'x' }, 'PATH', 'linux'), undefined);
  assert.deepEqual(envWithout({ Kimi_Code_Session_Lock: '0', A: '1' }, 'KIMI_CODE_SESSION_LOCK', 'win32'), { A: '1' });
  assert.deepEqual(envWithout({ Kimi_Code_Session_Lock: '0', KIMI_CODE_SESSION_LOCK: '0', A: '1' }, 'KIMI_CODE_SESSION_LOCK', 'linux'), { Kimi_Code_Session_Lock: '0', A: '1' });
});

test('same folder: exact on macOS and Linux, without case and with either slash on Windows', () => {
  assert.equal(sameFolder('C:\\Work\\App', 'c:/work/app/', 'win32'), true);
  assert.equal(sameFolder('C:\\Work\\App', 'C:\\Work\\Apps', 'win32'), false);
  assert.equal(sameFolder('/work/App', '/work/app', 'linux'), false);
  assert.equal(sameFolder('/work/app/', '/work/app', 'linux'), true);
  assert.equal(sameFolder('/work/App', '/work/app', 'darwin'), false);
  assert.equal(sameFolder('/', '/', 'darwin'), true);
});

test('versions: the first x.y.z of the output, numeric order, the tested line 2.5.x', () => {
  assert.equal(parseVersion('2.5.2\n'), '2.5.2');
  assert.equal(parseVersion('kimi-code 2.10.0 (build 7)'), '2.10.0');
  assert.equal(parseVersion('no version'), null);
  assert.ok(compareVersions('2.5.2', '2.5.10') < 0);
  assert.ok(compareVersions('2.10.0', '2.5.2') > 0);
  assert.equal(compareVersions('2.5.2', '2.5.2'), 0);
  assert.equal(testedVersion('2.5.9'), true);
  assert.equal(testedVersion('2.6.0'), false);
});

test('program: the saved path wins, a missing file is "not found", an old version is unsupported', async () => {
  const machine = await fakeKimi();
  try {
    assert.deepEqual({ ...(await readProgram(machine.context(), machine.paths)), checkedAt: null }, { path: null, version: null, installed: false, error: 'Kimi Code не найден', unsupported: null, checkedAt: null });
    await machine.installProgram();
    const found = await readProgram(machine.context(), machine.paths);
    assert.equal(found.path, machine.paths.program);
    assert.equal(found.version, '2.5.2');
    assert.equal(found.unsupported, null);
    machine.version = '2.5.1';
    assert.equal((await readProgram(machine.context(), machine.paths)).unsupported, 'нужна версия Kimi Code не ниже 2.5.2');
    const saved = (await machine.project('saved')).path;
    const config = { port: 0, projectsRoot: machine.home, programs: { kimi: saved } };
    assert.equal((await readProgram(machine.context({ config }), machine.paths)).path, saved);
    const broken = machine.context({ runCommand: async () => ({ code: null, signal: null, stdout: '', stderr: '', timedOut: false, startError: 'EACCES' }) });
    assert.match((await readProgram(broken, machine.paths)).error ?? '', /EACCES/);
  } finally {
    await machine.close();
  }
});

test('shapes: the captured 2.5.2 answers are read; a missing field is a shape error', async () => {
  assert.deepEqual(parseMeta(await fixture('meta')), { serverVersion: '2.5.2', serverId: '01M70X1N2969CFKJV8GGC1AT8C', backend: 'v2' });
  assert.deepEqual(parseAuth(await fixture('auth')), { modelsReady: true });
  assert.deepEqual(parseConfig(await fixture('config')), { defaultModel: 'fake/fake' });
  assert.equal(parseTrusted(await fixture('trust')), true);
  const workspaces = parseWorkspaces(await fixture('workspaces'));
  assert.deepEqual(workspaces.map((item) => [item.root, item.sessionCount]), [['/home/user/kwork', 2], ['/home/user/kwork', 0]]);
  // A fresh install has no default_model key at all.
  assert.deepEqual(parseConfig({ providers: {}, models: {} }), { defaultModel: null });
  assert.deepEqual(parseConfig({ default_model: '' }), { defaultModel: null });
  for (const broken of [() => parseMeta({ server_version: '2.5.2' }), () => parseAuth({}), () => parseConfig({ default_model: 5 }), () => parseWorkspaces({ items: {} }), () => parseTrusted(null)]) {
    assert.throws(broken, (error: unknown) => error instanceof KimiError && error.kind === 'shape');
  }
  assert.deepEqual(parseInstance({ server_id: 's', pid: 7, host: '127.0.0.1', port: 9 }), { serverId: 's', pid: 7, port: 9 });
  assert.equal(parseInstance({ server_id: 's', pid: 7, host: '10.0.0.5', port: 9 }), undefined);
  assert.equal(parseInstance({ server_id: 's', pid: '7', port: 9 }), undefined);
});

test('workspace of a folder: most sessions first, then the smaller id; the key is stable', async () => {
  const items = parseWorkspaces(await fixture('workspaces'));
  assert.equal(pickWorkspace(items, ['/home/user/kwork'], 'linux')?.id, 'wm_d7ee5e9e-2bd6-4b04-8544-27db00055591');
  const equal = items.map((item) => ({ ...item, sessionCount: 1 }));
  assert.equal(pickWorkspace(equal, ['/home/user/kwork'], 'darwin')?.id, 'wm_b71c79ab-a017-4632-b6a3-84fd57e28fab');
  assert.equal(pickWorkspace(items, ['/home/user/KWORK'], 'linux'), undefined);
  assert.equal(pickWorkspace(items.map((item) => ({ ...item, root: 'C:\\Work\\App' })), ['c:/work/app'], 'win32')?.sessionCount, 2);
  assert.match(workspaceKey('/home/user/kwork'), /^workflow-kit:[0-9a-f]{64}$/);
  assert.equal(workspaceKey('/a'), workspaceKey('/a'));
  assert.notEqual(workspaceKey('/a'), workspaceKey('/b'));
});
