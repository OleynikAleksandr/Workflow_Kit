import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createApp, detectOs, main, panelUrls } from '../src/index.ts';
import type { App, DetectOsInput, SystemSection } from '../src/index.ts';

const tailscaleInterfaces = (): NodeJS.Dict<os.NetworkInterfaceInfo[]> => ({
  utun4: [{ address: '100.101.102.103', netmask: '255.255.255.255', family: 'IPv4', mac: '', internal: false, cidr: null }],
});

const fakeOs: DetectOsInput = {
  platform: 'darwin',
  arch: 'arm64',
  release: '25.0.0',
  osVersion: 'Darwin Kernel',
  readText: async () => '<key>ProductVersion</key>\n\t<string>26.1</string>',
};

let tmp = '';
let app: App;
let base = '';

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-app-'));
  app = await createApp({
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' },
    homedir: tmp,
    getInterfaces: tailscaleInterfaces,
    osInput: fakeOs,
  });
  const bound = await app.start();
  base = `http://127.0.0.1:${bound.port}`;
});

after(async () => {
  await app.stop();
  await rm(tmp, { recursive: true, force: true });
});

test('createApp uses WFK_DATA_DIR, creates it with 0700 and binds WFK_PORT', async () => {
  assert.equal(app.dirs.configDir, path.join(tmp, 'data'));
  if (process.platform !== 'win32') assert.equal((await stat(app.dirs.configDir)).mode & 0o777, 0o700);
  assert.equal(app.config.port, 0);
  assert.notEqual(app.server.port(), 0);
});

test('GET /api/health and GET /api/state expose the "system" section', async () => {
  const health = (await (await fetch(`${base}/api/health`)).json()) as Record<string, unknown>;
  assert.equal(health['ok'], true);
  assert.equal(health['version'], app.version);
  const state = (await (await fetch(`${base}/api/state`)).json()) as { system: SystemSection };
  const system = state.system;
  assert.equal(system.version, app.version);
  assert.equal(system.os.label, 'macOS 26.1 (arm64)');
  assert.equal(system.dataDir, path.join(tmp, 'data'));
  assert.equal(system.dataDirOverridden, true);
  assert.equal(system.service.implemented, false);
  assert.deepEqual(system.addresses, [
    `http://127.0.0.1:${app.server.port()}/`,
    `http://100.101.102.103:${app.server.port()}/`,
  ]);
});

test('the panel shell is served at /', async () => {
  const response = await fetch(`${base}/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<title>Workflow Kit<\/title>/);
  assert.equal((await fetch(`${base}/app.js`)).status, 200);
  assert.equal((await fetch(`${base}/index.ts`)).status, 404);
});

test('serve starts the server and stops on shutdown', async () => {
  let out = '';
  const code = await main(['serve'], {
    stdout: (t) => (out += t),
    stderr: () => undefined,
    app: { env: { WFK_DATA_DIR: path.join(tmp, 'serve'), WFK_PORT: '0' }, homedir: tmp, getInterfaces: () => ({}) },
    waitForShutdown: async (running) => {
      const response = await fetch(`http://127.0.0.1:${running.server.port()}/api/health`);
      assert.equal(response.status, 200);
    },
  });
  assert.equal(code, 0);
  assert.match(out, /Панель: http:\/\/127\.0\.0\.1:\d+\//);
  assert.match(out, /остановлен/);
});

test('detectOs reads Linux and Windows names', async () => {
  const linux = await detectOs({
    ...fakeOs,
    platform: 'linux',
    arch: 'x64',
    readText: async () => 'NAME="Ubuntu"\nPRETTY_NAME="Ubuntu 24.04.1 LTS"\n',
  });
  assert.equal(linux.label, 'Ubuntu 24.04.1 LTS (x64)');
  const bare = await detectOs({ ...fakeOs, platform: 'linux', readText: async () => Promise.reject(new Error('no')) });
  assert.equal(bare.label, 'Linux 25.0.0 (arm64)');
  const windows = await detectOs({ ...fakeOs, platform: 'win32', arch: 'x64', osVersion: 'Windows 11 Pro' });
  assert.equal(windows.label, 'Windows 11 Pro (x64)');
  const mac = await detectOs({ ...fakeOs, readText: async () => '' });
  assert.equal(mac.label, 'macOS Darwin 25.0.0 (arm64)');
});

test('panelUrls brackets IPv6 Tailscale addresses', () => {
  const urls = panelUrls(4747, {
    utun4: [{ address: 'fd7a:115c:a1e0::5', netmask: 'ffff::', family: 'IPv6', mac: '', internal: false, cidr: null, scopeid: 0 }],
  });
  assert.deepEqual(urls, ['http://127.0.0.1:4747/', 'http://[fd7a:115c:a1e0::5]:4747/']);
});
