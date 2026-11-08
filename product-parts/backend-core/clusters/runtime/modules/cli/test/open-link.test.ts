// POST /api/open-link: the service opens a ChatGPT chat link with `open` on macOS; other links refused.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import type { CommandRunner } from '#process-supervisor';
import { createStubProvider } from '#provider-registry';
import { createApp } from '../src/index.ts';
import type { App } from '../src/index.ts';

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
    platform: 'darwin',
    providers: [() => createStubProvider({ id: 'claude', title: 'Claude', task: 'T000' })],
  });
  base = `http://127.0.0.1:${(await app.start()).port}`;
});

after(async () => {
  await app.stop();
  await rm(tmp, { recursive: true, force: true });
});

async function post(url: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${base}/api/open-link`, {
    method: 'POST',
    headers: { Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

test('ChatGPT thread and Claude Desktop session links are opened with open; other links are refused without running anything', async () => {
  const ok = await post('codex://threads/01a1b764-2649-72d2-b2fe-e8d1d0ca6305');
  assert.deepEqual([ok.status, ok.json], [200, { opened: true }]);
  assert.deepEqual(calls.filter(([command]) => command === 'open'), [['open', ['codex://threads/01a1b764-2649-72d2-b2fe-e8d1d0ca6305']]]);
  const claude = await post('claude://claude.ai/code/session_01EyVab6pTtGf9vTbJfcu4Qx');
  assert.equal(claude.status, 200);
  for (const bad of ['https://example.com', 'codex://threads/../x', 'claude://claude.ai/code/session_x/../y', 'claude://evil.com/code/session_1', 'file:///etc/passwd', 42]) {
    assert.equal((await post(bad)).status, 400);
  }
  assert.equal(calls.filter(([command]) => command === 'open').length, 2);
  fail = true;
  const failed = await post('codex://threads/abc');
  assert.equal(failed.status, 502);
  fail = false;
});
