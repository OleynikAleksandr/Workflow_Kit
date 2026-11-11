// M17 2.1: wfk serve keeps the launcher directory on its PATH on every OS (platform injected).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withLauncherDir } from '../src/service-path.ts';

test('macOS and Linux: ~/.local/bin is appended once', () => {
  for (const platform of ['darwin', 'linux'] as const) {
    const env: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin' };
    assert.equal(withLauncherDir(env, platform, '/home/me'), '/home/me/.local/bin', platform);
    assert.equal(env['PATH'], '/usr/bin:/bin:/home/me/.local/bin');
    assert.equal(withLauncherDir(env, platform, '/home/me'), null, `${platform}: already there`);
    assert.equal(env['PATH'], '/usr/bin:/bin:/home/me/.local/bin');
  }
});

test('Windows: the data directory with wfk.cmd goes into Path, compared without case', () => {
  const env: NodeJS.ProcessEnv = { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', Path: 'C:\\Windows;C:\\Windows\\System32' };
  assert.equal(withLauncherDir(env, 'win32', 'C:\\Users\\me'), 'C:\\Users\\me\\AppData\\Local\\Workflow Kit');
  assert.equal(env['Path'], 'C:\\Windows;C:\\Windows\\System32;C:\\Users\\me\\AppData\\Local\\Workflow Kit');
  assert.equal(env['PATH'], undefined, 'the existing key is kept');
  const lower: NodeJS.ProcessEnv = { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', Path: 'c:\\users\\me\\appdata\\local\\workflow kit;C:\\Windows' };
  assert.equal(withLauncherDir(lower, 'win32', 'C:\\Users\\me'), null);
  assert.equal(lower['Path'], 'c:\\users\\me\\appdata\\local\\workflow kit;C:\\Windows');
});

test('a development instance (WFK_DATA_DIR) keeps its PATH; no PATH at all gets the directory', () => {
  const dev: NodeJS.ProcessEnv = { WFK_DATA_DIR: '/tmp/wfk-dev', PATH: '/usr/bin' };
  assert.equal(withLauncherDir(dev, 'linux', '/home/me'), null);
  assert.equal(dev['PATH'], '/usr/bin');
  const bare: NodeJS.ProcessEnv = {};
  withLauncherDir(bare, 'linux', '/home/me');
  assert.equal(bare['PATH'], '/home/me/.local/bin');
});
