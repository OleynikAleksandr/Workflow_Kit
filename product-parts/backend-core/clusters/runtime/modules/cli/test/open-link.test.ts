// POST /api/open-link: the service opens a ChatGPT chat link with `open` on macOS and the project
// link of Kimi Code for a registered project; other links are refused.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import type { CommandRunner } from '#process-supervisor';
import { kimiProjectLink } from '#provider-kimi';
import type { KimiLaunch } from '#provider-kimi';
import { createStubProvider } from '#provider-registry';
import { createApp } from '../src/index.ts';
import { codexAppxScript, openCommands } from '../src/open-link.ts';
import type { App } from '../src/index.ts';

// The app runs with the path rules of the host: macOS commands on macOS and Linux, Windows ones on Windows.
const PLATFORM = process.platform === 'win32' ? 'win32' : 'darwin';
let tmp = '';
let app: App;
let base = '';
const calls: Array<[string, readonly string[]]> = [];
let fail = false;
let kimiInstalled = true;
// The start of the Kimi app with --workspace; null as for Linux, where only the link opens it.
let kimiLaunch: KimiLaunch | null = null;
const launchFolders: string[] = [];
const failing = new Set<string>();
const runner: CommandRunner = async (command, args) => {
  calls.push([command, args]);
  const failed = fail || failing.has(command);
  return { code: failed ? 1 : 0, signal: null, stdout: '', stderr: failed ? 'no app' : '', timedOut: false, startError: null };
};

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-open-link-'));
  app = await createApp({
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' },
    homedir: tmp,
    getInterfaces: () => ({}),
    runCommand: runner,
    platform: PLATFORM,
    kimiApp: async () => kimiInstalled,
    kimiCommand: async (folder) => {
      launchFolders.push(folder);
      return kimiLaunch;
    },
    providers: [() => createStubProvider({ id: 'claude', title: 'Claude', task: 'T000' })],
  });
  base = `http://127.0.0.1:${(await app.start()).port}`;
});

after(async () => {
  await app?.stop();
  await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

async function post(url: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${base}/api/open-link`, {
    method: 'POST',
    headers: { Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

/** The first command that opens a link on the host platform (open on macOS). */
function opener(url: string): { command: string; args: string[] } {
  const first = openCommands(PLATFORM, url, {})?.[0];
  assert.ok(first);
  return first;
}

test('ChatGPT thread and Claude Desktop session links are opened with open; other links are refused without running anything', async () => {
  const thread = 'codex://threads/01a1b764-2649-72d2-b2fe-e8d1d0ca6305';
  const session = 'claude://claude.ai/code/session_01EyVab6pTtGf9vTbJfcu4Qx';
  const openers = new Set([opener(thread).command, opener(session).command]);
  const opened = () => calls.filter(([command]) => openers.has(command));
  if (PLATFORM === 'darwin') assert.deepEqual([...openers], ['open']);
  const ok = await post(thread);
  assert.deepEqual([ok.status, ok.json], [200, { opened: true }]);
  assert.deepEqual(opened(), [[opener(thread).command, opener(thread).args]]);
  const claude = await post(session);
  assert.equal(claude.status, 200);
  for (const bad of ['https://example.com', 'codex://threads/../x', 'claude://claude.ai/code/session_x/../y', 'claude://evil.com/code/session_1', 'file:///etc/passwd', 42]) {
    assert.equal((await post(bad)).status, 400);
  }
  assert.equal(opened().length, 2);
  fail = true;
  const failed = await post('codex://threads/abc');
  assert.equal(failed.status, 502);
  fail = false;
});

test('a Kimi Code link is opened only for the folder of a registered project and only with the app installed', async () => {
  const project = await app.projects.create('kimi-open');
  const link = kimiProjectLink(project.path);
  calls.length = 0;
  const ok = await post(link);
  assert.deepEqual([ok.status, ok.json], [200, { opened: true }]);
  assert.deepEqual(calls, [[opener(link).command, opener(link).args]]);
  assert.equal(opener(link).args.at(-1), link, 'the link goes to the program as one argument');
  // A new session of the project: the link is built again from the registered folder.
  assert.equal((await post(`${link}&new=1`)).status, 200);
  assert.equal(calls.at(-1)?.[1].at(-1), kimiProjectLink(project.path, true));
  calls.length = 0;
  for (const bad of [
    kimiProjectLink(path.dirname(project.path)),
    kimiProjectLink(path.join(project.path, 'inner')),
    `${link}&session=1`,
    `${link}&root=${encodeURIComponent(project.path)}`,
    `${link}#x`,
    'kimi-code://open',
    `kimi-code://run?root=${encodeURIComponent(project.path)}`,
    `kimi-code:open?root=${encodeURIComponent(project.path)}`,
  ]) {
    const refused = await post(bad);
    assert.deepEqual([refused.status, (refused.json['error'] as Record<string, unknown>)?.['code']], [400, 'bad-link'], bad);
  }
  kimiInstalled = false;
  const missing = await post(link);
  kimiInstalled = true;
  assert.deepEqual([missing.status, (missing.json['error'] as Record<string, unknown>)?.['code']], [501, 'no-handler']);
  assert.match(String((missing.json['error'] as Record<string, unknown>)?.['message']), /kimi -S/);
  assert.equal(calls.length, 0, 'nothing runs for a refused link');
});

test('a Kimi project opens through the start of the app with --workspace (no empty chat); the link is the fallback and asks for a new chat', async () => {
  const project = await app.projects.create('kimi-workspace');
  const link = kimiProjectLink(project.path);
  kimiLaunch = { command: 'kimi-start', args: [`--workspace=${project.path}`] };
  calls.length = 0;
  launchFolders.length = 0;
  try {
    assert.equal((await post(link)).status, 200);
    assert.deepEqual(calls, [['kimi-start', [`--workspace=${project.path}`]]], 'the start of the app goes first and is enough');
    assert.deepEqual(launchFolders, [project.path], 'the registered folder, not the one of the request');
    // The start failed: the link opens the project.
    calls.length = 0;
    failing.add('kimi-start');
    assert.equal((await post(link)).status, 200);
    assert.deepEqual(calls.map(([command]) => command), ['kimi-start', opener(link).command]);
    assert.equal(calls.at(-1)?.[1].at(-1), link);
    failing.delete('kimi-start');
    // A new session asks for a new chat: only the link with new=1 does that.
    calls.length = 0;
    launchFolders.length = 0;
    assert.equal((await post(`${link}&new=1`)).status, 200);
    assert.deepEqual(launchFolders, []);
    assert.deepEqual(calls, [[opener(link).command, [...opener(link).args.slice(0, -1), kimiProjectLink(project.path, true)]]]);
  } finally {
    kimiLaunch = null;
    failing.clear();
  }
});

test('Windows (spec M5 section 7): claude:// through rundll32, codex:// through the AppX app, rundll32 as the fallback', () => {
  const env = { SystemRoot: 'C:\\Windows' };
  const claude = 'claude://claude.ai/code/session_01Ab';
  assert.deepEqual(openCommands('win32', claude, env), [{ command: 'C:\\Windows\\System32\\rundll32.exe', args: ['url.dll,FileProtocolHandler', claude] }]);
  const codex = 'codex://threads/01a1-b2';
  const [appx, fallback] = openCommands('win32', codex, env) ?? [];
  assert.equal(appx?.command, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(appx?.args.at(-1), codexAppxScript(codex));
  assert.match(codexAppxScript(codex), /Get-AppxPackage -Name 'OpenAI\.Codex'.*exit 3.*shell:AppsFolder.*-ArgumentList 'codex:\/\/threads\/01a1-b2'$/);
  assert.deepEqual(fallback?.args, ['url.dll,FileProtocolHandler', codex]);
  assert.equal(openCommands('linux', codex, env), null);
  // The project link of Kimi Code: open, xdg-open and rundll32 by platform.
  const kimi = kimiProjectLink('/home/me/app');
  assert.deepEqual(openCommands('darwin', kimi, env), [{ command: 'open', args: [kimi] }]);
  assert.deepEqual(openCommands('linux', kimi, env), [{ command: 'xdg-open', args: [kimi] }]);
  assert.deepEqual(openCommands('win32', kimi, env), [{ command: 'C:\\Windows\\System32\\rundll32.exe', args: ['url.dll,FileProtocolHandler', kimi] }]);
});

test('POST /api/system/shutdown asks wfk serve to stop (loopback, Origin as for every change)', async () => {
  let requested = false;
  void app.shutdownRequested.then(() => (requested = true));
  const refused = await fetch(`${base}/api/system/shutdown`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(refused.status, 403);
  const response = await fetch(`${base}/api/system/shutdown`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}' });
  assert.deepEqual([response.status, await response.json()], [200, { stopping: true }]);
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(requested, true);
});
