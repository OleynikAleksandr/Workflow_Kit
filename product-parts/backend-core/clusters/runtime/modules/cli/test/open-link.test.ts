// POST /api/open-link: the service opens a ChatGPT chat link with `open` on macOS; other links refused.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import type { CommandRunner } from '#process-supervisor';
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
const runner: CommandRunner = async (command, args) => {
  calls.push([command, args]);
  return { code: fail ? 1 : 0, signal: null, stdout: '', stderr: fail ? 'no app' : '', timedOut: false, startError: null };
};

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-open-link-'));
  app = await createApp({
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' },
    homedir: tmp,
    getInterfaces: () => ({}),
    runCommand: runner,
    platform: PLATFORM,
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
