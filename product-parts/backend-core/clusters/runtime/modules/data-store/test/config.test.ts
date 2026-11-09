import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ConfigError, DEFAULT_PORT, configFile, loadConfig, parsePort, resolveDataDirs } from '../src/index.ts';
import type { DataDirs } from '../src/index.ts';

let tmp = '';
let dirs: DataDirs;
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-config-'));
  dirs = resolveDataDirs({ platform: process.platform, env: { WFK_DATA_DIR: tmp }, homedir: tmp });
});
after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test('a missing config.json gives the defaults', async () => {
  const config = await loadConfig({ dirs, env: {}, homedir: '/home/u' });
  assert.equal(config.port, DEFAULT_PORT);
  assert.equal(config.projectsRoot, path.join('/home/u', 'WorkflowKitProjects'));
  assert.deepEqual(config.programs, {});
});

test('config.json values are read and WFK_PORT overrides the port', async () => {
  await writeFile(configFile(dirs), JSON.stringify({ port: 5000, projectsRoot: '/p', programs: { node: '/n', bad: 1 } }));
  const fromFile = await loadConfig({ dirs, env: {} });
  assert.equal(fromFile.port, 5000);
  assert.equal(fromFile.projectsRoot, '/p');
  assert.deepEqual(fromFile.programs, { node: '/n' });
  const overridden = await loadConfig({ dirs, env: { WFK_PORT: '0' } });
  assert.equal(overridden.port, 0);
});

test('invalid ports are rejected', () => {
  assert.equal(parsePort('4747', 'x'), 4747);
  assert.equal(parsePort(65535, 'x'), 65535);
  for (const bad of ['65536', '-1', 'abc', '47.5', '', 1.5]) {
    assert.throws(() => parsePort(bad, 'WFK_PORT'), ConfigError, String(bad));
  }
});
