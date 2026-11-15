// Connection recovery of the Codex daemon (spec M32 sections 2.5-2.8): the coordinator's backoff,
// cooldown and single probe; the feed and the parameters coming back after the daemon returns on
// injected darwin/linux/win32; no repeated changing RPC; the proxy's early exit; failures that
// are not network failures never start the backoff.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { CHAT_PAGE_LIMIT, ProviderError } from '#provider-registry';
import type { SessionInfo, SharedAccess } from '#provider-registry';
import { createChatParts } from '../src/chat.ts';
import { CodexOffline, RECOVERY_REASON, RECOVERY_RETRY_MAX_MS, UNAVAILABLE_REASON, createConnectionCoordinator, isNetworkFailure } from '../src/connection.ts';
import { createInterruptParts } from '../src/interrupt.ts';
import { createParameterParts } from '../src/parameters.ts';
import { proxyStream, safeStderr } from '../src/proxy.ts';
import { RpcError, TransportError } from '../src/rpc.ts';
import { createCodexRuntime } from '../src/runtime.ts';
import { connectUnixWebSocket, connectWebSocket } from '../src/ws.ts';
import { listenPath, startFakeDaemon } from './fake-daemon.ts';
import type { FakeDaemon } from './fake-daemon.ts';
import { fakeMachine } from './helpers.ts';
import { PROJECT, TARGET, THREAD } from './interrupt-world.ts';

const gone = () => Object.assign(new Error('connect ENOENT /x.sock'), { code: 'ENOENT' });

test('the backoff waits 250 ms, 1 s, 2 s, 4 s, then 10 s; jitter stays within 10 % and 11 s', () => {
  let now = 0;
  let random = 0.5;
  const c = createConnectionCoordinator({ now: () => now, random: () => random });
  const waits: number[] = [];
  for (let n = 0; n < 6; n += 1) {
    assert.equal(c.failed(gone()), true);
    waits.push(c.offline()!.retryAfterMs);
  }
  assert.deepEqual(waits, [250, 1000, 2000, 4000, 10_000, 10_000]);
  assert.equal(c.epoch(), 6);
  random = 1;
  c.failed(gone());
  assert.equal(c.offline()!.retryAfterMs, RECOVERY_RETRY_MAX_MS);
  assert.equal(c.offline()!.state, 'reconnecting');
  now = 30_000;
  assert.deepEqual(c.offline(), { state: 'unavailable', reason: UNAVAILABLE_REASON, retryAfterMs: 0 });
  c.succeeded();
  assert.equal(c.offline(), null);
  c.failed(gone());
  assert.deepEqual(c.offline(), { state: 'reconnecting', reason: RECOVERY_REASON, retryAfterMs: 250 * 1.1 });
});

test('only network failures count: oversize, malformed JSON, protocol, RPC, refused handshake and client close do not', () => {
  const c = createConnectionCoordinator({ now: () => 0, random: () => 0.5 });
  for (const error of [
    new RpcError('thread/items/list', 'frame-too-large', 'too large'),
    new TransportError('malformed-json', 'not JSON'),
    new TransportError('protocol-error', 'bad'),
    new RpcError('thread/read', -32601, 'unsupported'),
    new RpcError('thread/read', 'timeout', 'no answer'),
    new Error('the Codex daemon refused the WebSocket connection (HTTP/1.1 401)'),
    new RpcError('connection', 'closed', 'closed by client'),
  ]) assert.equal(c.failed(error), false, String(error));
  assert.equal(c.epoch(), 0);
  assert.equal(c.offline(), null);
  for (const error of [gone(), new TransportError('connection-lost', 'reset', { errno: 'ECONNRESET' }), new RpcError('thread/read', 'connection-lost', 'lost'), new RpcError('thread/read', 'closed', 'connection closed')]) assert.equal(isNetworkFailure(error), true);
});

test('cooldown refuses at once; one due read makes the probe, the others wait for it', async () => {
  let now = 0;
  const c = createConnectionCoordinator({ now: () => now, random: () => 0.5 });
  const resets: number[] = [];
  c.onReset(() => resets.push(c.epoch()));
  c.failed(gone());
  await assert.rejects(c.admit(5000), (error: unknown) => error instanceof CodexOffline && error.offline.retryAfterMs === 250);
  now = 300;
  const first = await c.admit(5300);
  let second = false;
  const waiting = c.admit(5300).then(() => { second = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(second, false, 'the second read waits for the probe');
  c.succeeded();
  first();
  await waiting;
  assert.equal(second, true);
  // A probe that fails refuses the waiting read.
  c.failed(gone());
  now = 2000;
  const probe = await c.admit(7000);
  const refused = assert.rejects(c.admit(7000), CodexOffline);
  c.failed(gone());
  probe();
  await refused;
  assert.deepEqual(resets, [1, 2, 3]);
  c.observed('a');
  c.observed('a');
  c.observed('b');
  assert.equal(resets.length, 4, 'a new server identity resets positive snapshots');
});

for (const platform of ['darwin', 'linux', 'win32'] as const) {
  test(`${platform}: feed and parameters come back after the daemon returns, without reload and without a storm`, async () => {
    const machine = await fakeMachine();
    let daemon: FakeDaemon = await startFakeDaemon(path.join(machine.root, 'a.sock'));
    const missing = listenPath(path.join(machine.root, 'missing.sock'));
    let target = daemon.socketPath;
    let now = 1000;
    const opened: string[] = [];
    try {
      await mkdir(path.join(machine.codexHome, 'app-server-daemon'), { recursive: true });
      await writeFile(path.join(machine.codexHome, 'app-server-daemon', 'daemon.pid'), JSON.stringify({ pid: process.pid }));
      const rt = createCodexRuntime(machine.context({ platform }), {
        isAlive: () => true,
        monotonic: () => now,
        random: () => 0.5,
        openDaemon: (_socket, options) => { opened.push(target); return connectUnixWebSocket(target, options); },
      });
      rt.program = { path: 'codex', installed: true, version: '0.169.0', error: null, unsupported: null, checkedAt: null };
      const interrupts = createInterruptParts(rt, { interruptWaitMs: 500 });
      interrupts.sessions(PROJECT, [{ localId: THREAD } as SessionInfo]);
      await rt.daemon();
      const chat = createChatParts({ withDaemon: (fn, ms) => rt.withDaemon(fn, ms), readDaemon: (fn, ms) => rt.readDaemon(fn, ms), offline: () => rt.connection.offline(), serverIdentity: () => rt.connection.identity(), shared: async () => false, log: () => undefined, onThreadRead: interrupts.observe });
      const shared = { cached: () => ({ state: 'active', checkedAt: '2000-01-01T00:00:00Z' }) } as unknown as SharedAccess;
      const parameters = createParameterParts(rt, shared);
      const fill = (d: FakeDaemon) => d.threads.set(THREAD, { status: 'active', turns: [{ id: TARGET.nativeTurnId, status: 'inProgress', items: [{ type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'привет' }] }] }] });
      fill(daemon);
      assert.deepEqual((await chat.readMessages(THREAD, CHAT_PAGE_LIMIT)).sync, { state: 'ready' });
      assert.equal(interrupts.interruptAvailability(PROJECT, THREAD).available, true);
      // The socket is gone: the last full snapshot with reconnecting, Stop no longer available.
      await daemon.close();
      target = missing;
      const lost = await chat.readMessages(THREAD, CHAT_PAGE_LIMIT);
      assert.deepEqual(lost.messages.map((m) => m.id), ['u1']);
      assert.deepEqual(lost.sync, { state: 'reconnecting', reason: RECOVERY_REASON, retryAfterMs: 250 });
      assert.equal(interrupts.interruptAvailability(PROJECT, THREAD).available, false);
      // Cooldown: tabs, another thread and the parameters answer at once without a connection.
      const count = opened.length;
      await assert.rejects(chat.readMessages('thread-other', CHAT_PAGE_LIMIT), (error: unknown) => error instanceof ProviderError && error.code === 'codex-reconnecting' && error.status === 503);
      await assert.rejects(parameters.readParameters(THREAD), { code: 'parameters-unavailable' });
      assert.equal((await chat.readMessages(THREAD, CHAT_PAGE_LIMIT)).sync?.state, 'reconnecting');
      assert.equal(opened.length, count);
      // Long outage: unavailable after 30 s, attempts go on with at most 10 s between them.
      for (let step = 0; step < 6; step += 1) {
        now += 11_000;
        await chat.readMessages(THREAD, CHAT_PAGE_LIMIT);
      }
      const late = await chat.readMessages(THREAD, CHAT_PAGE_LIMIT);
      assert.equal(late.sync?.state, 'unavailable');
      assert.ok((late.sync?.retryAfterMs ?? 99_999) <= RECOVERY_RETRY_MAX_MS);
      assert.ok(opened.length - count <= 6, `${opened.length - count} attempts in 66 s`);
      // The daemon is back at a new socket target: the next due read connects, nothing to reload.
      daemon = await startFakeDaemon(path.join(machine.root, 'b.sock'));
      fill(daemon);
      target = daemon.socketPath;
      now += 11_000;
      assert.deepEqual((await chat.readMessages(THREAD, CHAT_PAGE_LIMIT)).sync, { state: 'ready' });
      assert.equal(rt.connection.offline(), null);
      assert.equal(interrupts.interruptAvailability(PROJECT, THREAD).available, true);
      assert.equal((await parameters.readParameters(THREAD)).editable !== undefined, true);
    } finally {
      await daemon.close();
      await machine.close();
    }
  });
}

test('a changing RPC whose answer is lost is never sent again; the reads recover on their own', async () => {
  const machine = await fakeMachine();
  const daemon = await startFakeDaemon(path.join(machine.root, 'c.sock'), { dropOn: 'turn/start' });
  let now = 0;
  try {
    const rt = createCodexRuntime(machine.context({ platform: 'linux' }), { monotonic: () => now, random: () => 0.5, openDaemon: (_s, options) => connectUnixWebSocket(daemon.socketPath, options) });
    const chat = createChatParts({ withDaemon: (fn, ms) => rt.withDaemon(fn, ms), readDaemon: (fn, ms) => rt.readDaemon(fn, ms), offline: () => rt.connection.offline(), shared: async () => true, log: () => undefined });
    daemon.threads.set(THREAD, { status: 'idle', turns: [{ id: 'turn-1', status: 'completed', items: [{ type: 'agentMessage', id: 'a1', text: 'ok' }] }] });
    daemon.loaded.add(THREAD);
    assert.equal(await chat.sendDirect(THREAD, 'сделай'), false);
    assert.equal(rt.connection.offline()?.state, 'reconnecting', 'a lost answer is a network failure');
    now += 300;
    assert.deepEqual((await chat.readMessages(THREAD, CHAT_PAGE_LIMIT)).sync, { state: 'ready' });
    now += 20_000;
    await chat.readMessages(THREAD, CHAT_PAGE_LIMIT);
    assert.equal(daemon.calls.filter((c) => c.method === 'turn/start').length, 1);
  } finally {
    await daemon.close();
    await machine.close();
  }
});

test('an item too large for the transport changes neither the epoch nor the backoff', async () => {
  const machine = await fakeMachine();
  const daemon = await startFakeDaemon(path.join(machine.root, 'e.sock'));
  try {
    const rt = createCodexRuntime(machine.context({ platform: 'win32' }), { openDaemon: (_s, options) => connectUnixWebSocket(daemon.socketPath, { ...options, maxFrameBytes: 64 * 1024, maxMessageBytes: 64 * 1024 }) });
    const chat = createChatParts({ withDaemon: (fn, ms) => rt.withDaemon(fn, ms), readDaemon: (fn, ms) => rt.readDaemon(fn, ms), offline: () => rt.connection.offline(), shared: async () => false, log: () => undefined });
    daemon.threads.set(THREAD, { status: 'idle', turns: [{ id: 'turn-1', status: 'completed', items: [{ type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'q' }] }, { type: 'commandExecution', id: 'c1', aggregatedOutput: 'x'.repeat(300_000) }, { type: 'agentMessage', id: 'a1', text: 'a' }] }] });
    let page = await chat.readMessages(THREAD, CHAT_PAGE_LIMIT);
    for (let n = 0; n < 4 && page.sync?.state === 'loading'; n += 1) page = await chat.readMessages(THREAD, CHAT_PAGE_LIMIT);
    assert.equal(page.sync?.state, 'partial');
    assert.equal(rt.connection.epoch(), 0);
    assert.equal(rt.connection.offline(), null);
  } finally {
    await daemon.close();
    await machine.close();
  }
});

test('an early exit of the Windows proxy keeps its exit code and a safe stderr line', async () => {
  const script = "process.stderr.write('boot\\nerror: socket gone token=sk-abcdefghijklmnopqrstuvwxyz0123456789\\n'); process.exit(3)";
  const spawnRelay = ((_command: string, _args: readonly string[], options: object) => spawn(process.execPath, ['-e', script], options)) as unknown as typeof spawn;
  await assert.rejects(connectWebSocket(proxyStream({ command: 'codex.exe', env: { ...process.env } as Record<string, string>, socketPath: 'x' }, spawnRelay), { timeoutMs: 5000 }), (error: unknown) => {
    assert.ok(error instanceof TransportError);
    assert.equal(error.code, 'connection-lost');
    assert.match(error.message, /proxy ended \(exit code 3\): error: socket gone token …/);
    assert.doesNotMatch(error.message, /sk-abc/);
    assert.equal(isNetworkFailure(error), true);
    return true;
  });
  assert.equal(safeStderr('a\u0007b ' + 'k'.repeat(40)), ': a b …');
});
