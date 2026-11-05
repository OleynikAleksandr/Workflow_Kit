import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { dataPlatform, ensureDataDirs, listDataDirs, resolveDataDirs } from '../src/index.ts';

test('macOS keeps everything in Application Support', () => {
  const dirs = resolveDataDirs({ platform: 'darwin', env: {}, homedir: '/Users/alice' });
  const root = '/Users/alice/Library/Application Support/Workflow Kit';
  assert.equal(dirs.configDir, root);
  assert.equal(dirs.stateDir, root);
  assert.equal(dirs.appDir, root);
  assert.equal(dirs.logsDir, `${root}/logs`);
  assert.equal(dirs.backupsDir, `${root}/backups`);
  assert.equal(dirs.overridden, false);
});

test('Linux follows XDG variables', () => {
  const env = { XDG_CONFIG_HOME: '/x/config', XDG_STATE_HOME: '/x/state', XDG_DATA_HOME: '/x/data' };
  const dirs = resolveDataDirs({ platform: 'linux', env, homedir: '/home/bob' });
  assert.equal(dirs.configDir, '/x/config/workflow-kit');
  assert.equal(dirs.stateDir, '/x/state/workflow-kit');
  assert.equal(dirs.appDir, '/x/data/workflow-kit');
  assert.equal(dirs.logsDir, '/x/state/workflow-kit/logs');
});

test('Linux falls back to XDG defaults and ignores relative XDG paths', () => {
  const dirs = resolveDataDirs({ platform: 'linux', env: { XDG_CONFIG_HOME: 'relative' }, homedir: '/home/bob' });
  assert.equal(dirs.configDir, '/home/bob/.config/workflow-kit');
  assert.equal(dirs.stateDir, '/home/bob/.local/state/workflow-kit');
  assert.equal(dirs.appDir, '/home/bob/.local/share/workflow-kit');
});

test('Windows uses %LOCALAPPDATA%', () => {
  const env = { LOCALAPPDATA: 'C:\\Users\\Carol\\AppData\\Local' };
  const dirs = resolveDataDirs({ platform: 'win32', env, homedir: 'C:\\Users\\Carol' });
  assert.equal(dirs.configDir, 'C:\\Users\\Carol\\AppData\\Local\\Workflow Kit');
  assert.equal(dirs.logsDir, 'C:\\Users\\Carol\\AppData\\Local\\Workflow Kit\\logs');
});

test('Windows without LOCALAPPDATA falls back to the profile', () => {
  const dirs = resolveDataDirs({ platform: 'win32', env: {}, homedir: 'C:\\Users\\Carol' });
  assert.equal(dirs.configDir, 'C:\\Users\\Carol\\AppData\\Local\\Workflow Kit');
});

test('WFK_DATA_DIR overrides every platform', () => {
  for (const platform of ['darwin', 'linux'] as const) {
    const dirs = resolveDataDirs({ platform, env: { WFK_DATA_DIR: '/tmp/wfk-dev' }, homedir: '/home/x' });
    assert.equal(dirs.configDir, '/tmp/wfk-dev');
    assert.equal(dirs.stateDir, '/tmp/wfk-dev');
    assert.equal(dirs.appDir, '/tmp/wfk-dev');
    assert.equal(dirs.overridden, true);
  }
  const win = resolveDataDirs({ platform: 'win32', env: { WFK_DATA_DIR: 'D:\\wfk' }, homedir: 'C:\\Users\\x' });
  assert.equal(win.configDir, 'D:\\wfk');
});

test('other platforms use the Linux layout', () => {
  assert.equal(dataPlatform('freebsd'), 'linux');
  assert.equal(dataPlatform('darwin'), 'darwin');
});

test('ensureDataDirs creates the directories with mode 0700', { skip: process.platform === 'win32' }, async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-dirs-'));
  try {
    const dirs = resolveDataDirs({ platform: process.platform, env: { WFK_DATA_DIR: path.join(tmp, 'data') }, homedir: tmp });
    await ensureDataDirs(dirs);
    for (const dir of listDataDirs(dirs)) {
      const info = await stat(dir);
      assert.ok(info.isDirectory());
      assert.equal(info.mode & 0o777, 0o700, dir);
    }
    await ensureDataDirs(dirs);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
