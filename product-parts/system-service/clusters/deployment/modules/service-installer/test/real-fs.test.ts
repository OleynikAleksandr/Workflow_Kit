// The real file system and the real effects, in a temporary HOME. External programs and the
// backend stay fakes: nothing outside the temporary directory is touched.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import { fetchHealth, runServiceCommand, spawnDetachedProcess } from '../src/index.ts';
import type { HealthInfo } from '../src/index.ts';

let tmp = '';

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-installer-'));
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test('install and uninstall on the real file system of a fake HOME', { skip: process.platform === 'win32' }, async () => {
  const home = path.join(tmp, 'home');
  const clone = path.join(tmp, 'clone');
  await mkdir(path.join(clone, 'bin'), { recursive: true });
  await mkdir(path.join(clone, 'product-parts', 'p', 'test'), { recursive: true });
  await writeFile(path.join(clone, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  await writeFile(path.join(clone, 'bin', 'wfk.mjs'), '// entry\n');
  await writeFile(path.join(clone, 'product-parts', 'p', 'test', 'a.test.ts'), '');
  await writeFile(path.join(clone, 'product-parts', 'p', 'index.ts'), '');
  let health: HealthInfo | null = null;
  const deps = {
    platform: 'darwin' as const,
    env: { HOME: home, PATH: '/usr/bin:/bin' },
    homedir: home,
    sourceRoot: clone,
    nodePath: process.execPath,
    uid: 501,
    sleep: async () => undefined,
    health: async () => health,
    kill: () => {
      health = null;
    },
    spawnDetached: async () => undefined,
    run: async (command: string, args: readonly string[]) => {
      if (command === '/bin/launchctl' && args[0] === 'bootstrap') health = { ok: true as const, version: '1.2.3', pid: 1 };
      if (command === '/bin/launchctl' && args[0] === 'bootout') health = null;
      const stdout = args.includes('-c') ? '__WFK_PATH__/usr/bin:/bin__WFK_PATH__' : '';
      return { code: command === '/bin/launchctl' && args[0] === 'print' ? 113 : 0, signal: null, stdout, stderr: '', timedOut: false, startError: null };
    },
  };
  const result = await runServiceCommand('install', deps);
  assert.equal(result.exitCode, 0, result.message);
  const data = path.join(home, 'Library', 'Application Support', 'Workflow Kit');
  assert.deepEqual(await readdir(path.join(data, 'app', '1.2.3', 'product-parts', 'p')), ['index.ts']);
  assert.equal((await stat(path.join(home, '.local', 'bin', 'wfk'))).mode & 0o777, 0o755);
  assert.equal((await stat(path.join(data, 'app', 'current.json'))).mode & 0o777, 0o600);
  assert.equal((await stat(path.join(data, 'config.json'))).mode & 0o777, 0o600);
  assert.equal((await stat(path.join(home, 'Applications', 'Workflow Kit.app', 'Contents', 'MacOS', 'workflow-kit'))).mode & 0o777, 0o755);
  assert.match(await readFile(path.join(home, 'Library', 'LaunchAgents', 'ai.workflowkit.backend.plist'), 'utf8'), /AbandonProcessGroup/);

  const removed = await runServiceCommand('uninstall', deps);
  assert.equal(removed.exitCode, 0, removed.message);
  assert.deepEqual(await readdir(data), ['config.json', 'logs']);
  assert.deepEqual(await readdir(path.join(home, '.local', 'bin')), []);
  assert.deepEqual(await readdir(path.join(home, 'Library', 'LaunchAgents')), []);
});

test('fetchHealth reads /api/health and ignores other answers', async () => {
  let body: unknown = { ok: true, version: '0.1.0', pid: 42, startedAt: 'now' };
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    assert.deepEqual(await fetchHealth(port), { ok: true, version: '0.1.0', pid: 42, startedAt: 'now' });
    body = { hello: 'world' };
    assert.equal(await fetchHealth(port), null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.equal(await fetchHealth(port), null);
  assert.equal(await fetchHealth(0), null);
});

test('spawnDetachedProcess runs a detached program with output appended to the log', async () => {
  const log = path.join(tmp, 'logs', 'detached.log');
  await spawnDetachedProcess(process.execPath, ['-e', 'console.log("hello " + process.env.WFK_TEST)'], { env: { WFK_TEST: 'ok' }, logFile: log });
  let text = '';
  for (let i = 0; i < 100 && !text.includes('hello'); i += 1) {
    await delay(50);
    text = await readFile(log, 'utf8').catch(() => '');
  }
  assert.equal(text, 'hello ok\n');
  if (process.platform !== 'win32') assert.equal((await stat(log)).mode & 0o777, 0o600);
});
