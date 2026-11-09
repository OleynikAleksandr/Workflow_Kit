import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
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
  // The stopped service may still finish a write in its data folder (ENOTEMPTY seen in CI).
  await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
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
  assert.equal(system.service.implemented, true);
  assert.equal(system.service.instance, 'development');
  assert.equal(system.service.running, true);
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

async function send(method: string, url: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers = { Origin: base, 'Content-Type': 'application/json' };
  const response = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

interface ProjectsState {
  root: string;
  projects: Array<{ id: string; name: string; path: string; missing: boolean }>;
}

test('projects: create, open by folder list, remove from list, persist across restart', async () => {
  const home = await realpath(tmp);
  await mkdir(path.join(home, 'code', 'existing'), { recursive: true });
  const created = await send('POST', '/api/projects', { name: 'Alpha' });
  assert.equal(created.status, 201);
  const alphaPath = path.join(home, 'WorkflowKitProjects', 'Alpha');
  assert.equal((created.json['project'] as { path: string }).path, alphaPath);
  const bad = await send('POST', '/api/projects', { name: 'a/b' });
  assert.equal(bad.status, 400);
  assert.equal((bad.json['error'] as { code: string }).code, 'invalid-name');

  const top = (await (await fetch(`${base}/api/folders`)).json()) as { path: string; entries: Array<{ name: string; path: string }> };
  assert.equal(top.path, home);
  const codeEntry = top.entries.find((e) => e.name === 'code');
  assert.ok(codeEntry);
  const inner = (await (await fetch(`${base}/api/folders?path=${encodeURIComponent(codeEntry.path)}`)).json()) as {
    entries: Array<{ name: string; path: string }>;
  };
  assert.deepEqual(inner.entries.map((e) => e.name), ['existing']);
  const outside = await fetch(`${base}/api/folders?path=${encodeURIComponent(path.parse(home).root)}`);
  assert.equal(outside.status, 400);
  assert.equal(((await outside.json()) as { error: { code: string } }).error.code, 'outside-home');

  const opened = await send('POST', '/api/projects/open', { path: inner.entries[0]!.path });
  assert.equal(opened.status, 201);
  assert.equal((await send('POST', '/api/projects/open', { path: inner.entries[0]!.path })).status, 200);

  const state = (await (await fetch(`${base}/api/state`)).json()) as { projects: ProjectsState };
  assert.deepEqual(state.projects.projects.map((p) => p.name), ['Alpha', 'existing']);
  assert.equal(state.projects.root, path.join(tmp, 'WorkflowKitProjects'));

  const alphaId = state.projects.projects[0]!.id;
  const removed = await send('DELETE', `/api/projects/${alphaId}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.json['folderKept'], true);
  assert.ok((await stat(alphaPath)).isDirectory());
  assert.equal((await send('DELETE', `/api/projects/${alphaId}`)).status, 404);

  const restarted = await createApp({
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' },
    homedir: tmp,
    getInterfaces: () => ({}),
    osInput: fakeOs,
  });
  const section = (await restarted.state.collect())['projects'] as ProjectsState;
  assert.deepEqual(section.projects.map((p) => p.name), ['existing']);
  const events = await readFile(path.join(tmp, 'data', 'events.jsonl'), 'utf8');
  for (const type of ['service.started', 'project.created', 'project.opened', 'project.removed']) {
    assert.match(events, new RegExp(`"type":"${type.replace('.', '\\.')}"`));
  }
});

test('structure: GET reports "missing", POST installs, the state section shows "ok" then "modified"', async () => {
  const created = await send('POST', '/api/projects', { name: 'Beta' });
  const project = created.json['project'] as { id: string; path: string };
  const url = `/api/projects/${project.id}/structure`;
  const before = (await (await fetch(`${base}${url}`)).json()) as { structure: { status: string } };
  assert.equal(before.structure.status, 'missing');

  const installed = await send('POST', url, {});
  assert.equal(installed.status, 200);
  assert.equal((installed.json['report'] as { status: string }).status, 'ok');
  assert.ok((installed.json['written'] as string[]).includes('agents-section'));
  assert.equal((await send('POST', url, { force: 'yes' })).status, 400);
  assert.equal((await send('POST', '/api/projects/nope/structure', {})).status, 404);

  const agentsFile = path.join(project.path, 'AGENTS.md');
  await writeFile(agentsFile, (await readFile(agentsFile, 'utf8')).replace('### Local data', '### Local data!'));
  const state = (await (await fetch(`${base}/api/state`)).json()) as { structure: { projects: Record<string, { status: string }> } };
  assert.equal(state.structure.projects[project.id]?.status, 'modified');

  await writeFile(path.join(project.path, '.claude', 'settings.json'), '{ broken');
  const refused = await send('POST', url, { force: true });
  assert.equal(refused.status, 409);
  assert.equal((refused.json['error'] as { code: string; files: string[] }).code, 'invalid-json');
  assert.deepEqual((refused.json['error'] as { files: string[] }).files, ['.claude/settings.json']);
  assert.equal(await readFile(path.join(project.path, '.claude', 'settings.json'), 'utf8'), '{ broken');
  assert.match(await readFile(path.join(tmp, 'data', 'events.jsonl'), 'utf8'), /"type":"structure\.installed"/);
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
