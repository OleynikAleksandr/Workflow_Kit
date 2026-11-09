// The Kimi Code app and Remote Control: the project link, the check of the app on the three
// OSes (platform injected), the mobile link and the two actions. The fake machine works on every OS.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ProviderError } from '#provider-registry';
import type { RunResult } from '#process-supervisor';
import { KIMI_APP_NAME, KIMI_SCHEME_KEYS, KIMI_SCHEME_MIME, kimiAppFound, kimiProjectLink, parseKimiProjectLink, resumeNote } from '../src/app-link.ts';
import { REMOTE_BUSY_NOTE, REMOTE_OFF_ACTION, REMOTE_ON_ACTION } from '../src/remote.ts';
import { parseRemote } from '../src/shapes.ts';
import { withSessions } from './fake-sessions.ts';

const result = (code: number, stdout = ''): RunResult => ({ code, signal: null, stdout, stderr: '', timedOut: false, startError: null });

test('the project link carries the folder and comes back only in its exact form', () => {
  const link = kimiProjectLink('/Users/me/My project');
  assert.equal(link, 'kimi-code://open?root=%2FUsers%2Fme%2FMy%20project');
  assert.deepEqual(parseKimiProjectLink(link), { root: '/Users/me/My project', fresh: false });
  const windows = kimiProjectLink('C:\\Work\\Проект', true);
  assert.equal(windows.endsWith('&new=1'), true);
  assert.deepEqual(parseKimiProjectLink(windows), { root: 'C:\\Work\\Проект', fresh: true });
  for (const bad of [
    'kimi-code://open',
    'kimi-code://open?',
    'kimi-code://open?root=',
    'kimi-code://open?root=%2Fa&root=%2Fb',
    'kimi-code://open?root=%2Fa&new=2',
    'kimi-code://open?root=%2Fa&new=1&new=1',
    'kimi-code://open?root=%2Fa&session=1',
    'kimi-code://open?root=%2Fa#x',
    'kimi-code://open?root=%2Fa%0Ab',
    'kimi-code://run?root=%2Fa',
    'KIMI-CODE://open?root=%2Fa',
    `kimi-code://open?root=${'a'.repeat(5000)}`,
  ]) {
    assert.equal(parseKimiProjectLink(bad), null, bad);
  }
});

test('kimiAppFound: the folder of the app on macOS', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wfk-kimi-app-'));
  try {
    const check = { platform: 'darwin' as const, env: {}, homedir: root, runCommand: async () => assert.fail('no program runs on macOS') };
    const folders = [path.join(root, 'system'), path.join(root, 'user')];
    assert.equal(await kimiAppFound({ ...check, appFolders: folders }), false);
    await mkdir(path.join(root, 'user', KIMI_APP_NAME), { recursive: true });
    assert.equal(await kimiAppFound({ ...check, appFolders: folders }), true);
    // Applications of the user is searched by default.
    await mkdir(path.join(root, 'Applications', KIMI_APP_NAME), { recursive: true });
    assert.equal(await kimiAppFound({ ...check, appFolders: [path.join(root, 'system'), path.posix.join(root, 'Applications')] }), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('kimiAppFound: the handler of the scheme on Linux and the registry key on Windows', async () => {
  const calls: Array<[string, readonly string[]]> = [];
  const runner = (answers: RunResult[]) => async (command: string, args: readonly string[]) => {
    calls.push([command, args]);
    return answers.shift() ?? result(1);
  };
  const linux = { platform: 'linux' as const, env: { PATH: '/usr/bin' }, homedir: '/home/me' };
  assert.equal(await kimiAppFound({ ...linux, runCommand: runner([result(0, 'kimi-code.desktop\n')]) }), true);
  assert.deepEqual(calls.pop(), ['xdg-mime', ['query', 'default', KIMI_SCHEME_MIME]]);
  assert.equal(await kimiAppFound({ ...linux, runCommand: runner([result(0, '\n')]) }), false, 'no handler is an empty answer');
  assert.equal(await kimiAppFound({ ...linux, runCommand: runner([result(1, 'kimi-code.desktop')]) }), false);
  assert.equal(await kimiAppFound({ ...linux, runCommand: async () => ({ ...result(0, 'x'), code: null, startError: 'ENOENT' }) }), false, 'xdg-mime is not installed');
  assert.equal(await kimiAppFound({ ...linux, runCommand: async () => Promise.reject(new Error('broken')) }), false);

  calls.length = 0;
  const windows = { platform: 'win32' as const, env: { systemroot: 'D:\\Win' }, homedir: 'C:\\Users\\me' };
  assert.equal(await kimiAppFound({ ...windows, runCommand: runner([result(1), result(0, 'HKEY_CLASSES_ROOT\\kimi-code')]) }), true);
  assert.deepEqual(calls, KIMI_SCHEME_KEYS.map((key) => ['D:\\Win\\System32\\reg.exe', ['query', key]]));
  calls.length = 0;
  assert.equal(await kimiAppFound({ ...windows, env: {}, runCommand: runner([]) }), false);
  assert.deepEqual(calls.map(([command]) => command), ['C:\\Windows\\System32\\reg.exe', 'C:\\Windows\\System32\\reg.exe']);
});

test('parseRemote keeps only an exact address of a device', () => {
  const state = (url: unknown): string | null => parseRemote({ enabled: true, state: 'on', url }).url;
  assert.equal(state('https://code-rc.kimi.com/devices/dev_1-A/'), 'https://code-rc.kimi.com/devices/dev_1-A/');
  for (const bad of [
    'http://code-rc.kimi.com/devices/dev_1/',
    'https://code-rc.kimi.com/devices/dev_1',
    'https://code-rc.kimi.com/devices/dev_1/?token=1',
    'https://code-rc.kimi.com/devices/dev_1/#x',
    'https://code-rc.kimi.com/devices/a/b/',
    'https://user:pass@code-rc.kimi.com/devices/dev_1/',
    'https://code-rc.kimi.com.evil.example/devices/dev_1/',
    'https://evil.example/https://code-rc.kimi.com/devices/dev_1/',
    'https://code-rc.kimi.com/devices/dev_1/\n',
    7,
    undefined,
  ]) {
    assert.equal(state(bad), null, String(bad));
  }
  assert.deepEqual(parseRemote({ enabled: false, state: 'off', conflict: { device_name: 'other' } }), { enabled: false, state: 'off', url: null, conflict: true });
  assert.throws(() => parseRemote({ state: 'on' }));
  assert.throws(() => parseRemote({ enabled: 'yes', state: 'on' }));
});

test('sessions link to the project in the app once the app was checked', async () => {
  await withSessions(async ({ project, provider, advance }) => {
    const first = await provider.createSession!(project, { title: 'Work' });
    assert.deepEqual([first.links, first.note], [{}, undefined], 'nothing is said before the first check');
    await provider.refresh!();
    advance(6000);
    const desktop = kimiProjectLink(project.path);
    assert.deepEqual((await provider.listSessions(project)).map((item) => [item.links, item.note]), [[{ desktop }, undefined]]);
    assert.deepEqual((await provider.createSession!(project, { title: 'More' })).links, { desktop });
  });
});

test('without the app a session carries the command that continues it in a terminal', async () => {
  await withSessions(
    async ({ api, project, provider, advance }) => {
      await provider.createSession!(project, { title: 'Work' });
      await provider.refresh!();
      const second = await provider.createSession!(project, { title: 'More' });
      assert.deepEqual([second.links, second.note], [{}, resumeNote('session_2')]);
      api.sessions.get('session_1')!.archived = true;
      advance(6000);
      const list = await provider.listSessions(project);
      assert.deepEqual(list.map((item) => [item.localId, item.links]), [['session_2', {}], ['session_1', {}]]);
      assert.equal(list[0]?.note, resumeNote('session_2'));
      assert.match(list[1]?.note ?? '', /; продолжить: `kimi -S session_1` в терминале проекта$/, 'the note follows the other notes');
    },
    { appFound: async () => false },
  );
});

test('Remote Control: the two actions, the mobile link, a server without the route', async () => {
  await withSessions(async ({ api, project, provider, advance, seen }) => {
    const remote = async (): Promise<Array<[string, boolean, string | undefined]>> => (await provider.actions(null)).filter((action) => action.id.startsWith('kimi-remote')).map((action) => [action.id, action.enabled, action.reason]);
    // No server yet: turning on is offered (it starts the server), turning off is not.
    assert.deepEqual(await remote(), [[REMOTE_ON_ACTION, true, undefined], [REMOTE_OFF_ACTION, false, 'Remote Control Kimi выключен']]);
    assert.equal(seen(/remote-control/).length, 0, 'a stopped server is not started to ask');
    await provider.createSession!(project, { title: 'Work' });
    assert.deepEqual((await provider.listSessions(project))[0]?.links, {});

    await provider.runAction(REMOTE_ON_ACTION, null);
    assert.deepEqual(seen(/^POST \/api\/v1\/remote-control$/).map((request) => request.body), [{ enabled: true }]);
    assert.deepEqual(await remote(), [[REMOTE_ON_ACTION, false, 'Remote Control Kimi уже включён'], [REMOTE_OFF_ACTION, true, undefined]]);
    advance(6000);
    assert.deepEqual((await provider.listSessions(project))[0]?.links, { mobile: 'https://code-rc.kimi.com/devices/dev_1/' });
    assert.equal((await provider.actions(null)).every((action) => action.id === 'remove-kimi-hook' || Boolean(action.confirm)), true);

    // An address of another form is not shown.
    api.remote.url = 'https://code-rc.kimi.com/devices/dev_1/?next=https://evil.example';
    advance(6000);
    assert.deepEqual((await provider.listSessions(project))[0]?.links, {});

    await provider.runAction(REMOTE_OFF_ACTION, null);
    assert.deepEqual(seen(/^POST \/api\/v1\/remote-control$/).map((request) => request.body), [{ enabled: true }, { enabled: false }]);
    assert.deepEqual(await remote(), [[REMOTE_ON_ACTION, true, undefined], [REMOTE_OFF_ACTION, false, 'Remote Control Kimi выключен']]);

    // An older server has no such route: no link, the answer is reused for a while.
    api.remote.supported = false;
    advance(6000);
    const before = seen(/^GET \/api\/v1\/remote-control$/).length;
    assert.deepEqual((await provider.listSessions(project))[0]?.links, {});
    await remote();
    assert.equal(seen(/^GET \/api\/v1\/remote-control$/).length, before + 1);
  });
});

test('Remote Control run by another application: code 40928 gives the note until the next check', async () => {
  await withSessions(async ({ api, provider }) => {
    api.fail(/^POST \/api\/v1\/remote-control$/, 40928, 1);
    await assert.rejects(provider.runAction(REMOTE_ON_ACTION, null), (error: unknown) => error instanceof ProviderError && error.code === 'kimi-remote-busy' && error.status === 409 && error.message === REMOTE_BUSY_NOTE);
    assert.match((await provider.status()).note ?? '', new RegExp(REMOTE_BUSY_NOTE));
    assert.match((await provider.refresh!()).note ?? '', /^(?!.*Remote Control)/, 'the check forgets the note');
    // Another refusal is an error of its own; a success clears the note of the conflict.
    api.fail(/^POST \/api\/v1\/remote-control$/, 50001, 1);
    await assert.rejects(provider.runAction(REMOTE_ON_ACTION, null), (error: unknown) => error instanceof ProviderError && error.code === 'kimi-remote' && error.message.startsWith('Kimi не включил Remote Control: '));
    api.fail(/^POST \/api\/v1\/remote-control$/, 40928, 1);
    await assert.rejects(provider.runAction(REMOTE_ON_ACTION, null), ProviderError);
    await provider.runAction(REMOTE_ON_ACTION, null);
    assert.doesNotMatch((await provider.status()).note ?? '', /Remote Control/);
    await assert.rejects(provider.runAction('kimi-remote-x', null), (error: unknown) => error instanceof ProviderError && error.code === 'unknown-action');
  });
});

test('a conflict the server reports gives the note while it lasts', async () => {
  await withSessions(async ({ api, project, provider, advance }) => {
    await provider.createSession!(project, { title: 'Work' });
    api.remote.conflict = true;
    advance(6000);
    await provider.listSessions(project);
    assert.match((await provider.status()).note ?? '', new RegExp(REMOTE_BUSY_NOTE));
    api.remote.conflict = false;
    advance(6000);
    await provider.listSessions(project);
    assert.doesNotMatch((await provider.status()).note ?? '', /Remote Control/);
  });
});
