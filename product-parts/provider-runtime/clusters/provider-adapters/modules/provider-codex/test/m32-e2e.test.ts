// M32 T005: end-to-end scenarios of the Codex feed on a real test WebSocket (Unix socket, a named
// pipe on Windows) and, for injected win32, through the real proxyStream with the test relay:
// a history above 16 MiB in total and one item above 16 MiB between two short messages of a turn,
// measured per poll (accepted UTF-8 payload bytes, pages, connections); the steady active turn;
// a replaced socket target with several readers (Mac and iPad tabs share one server downtime);
// Stop after a reconnect; RPC counters: no full-history read, no repeated changing RPC.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';
import { readlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { CHAT_PAGE_LIMIT } from '#provider-registry';
import type { SessionInfo } from '#provider-registry';
import { createChatParts } from '../src/chat.ts';
import { RECOVERY_RETRY_MAX_MS, UNAVAILABLE_REASON } from '../src/connection.ts';
import { HISTORY_GAP_REASON, HISTORY_POLL_BYTES, HISTORY_POLL_MS, HISTORY_POLL_PAGES } from '../src/history-reader.ts';
import { createInterruptParts } from '../src/interrupt.ts';
import { proxyStream } from '../src/proxy.ts';
import type { RpcTransport } from '../src/rpc.ts';
import { createCodexRuntime } from '../src/runtime.ts';
import { MAX_MESSAGE_BYTES, connectUnixWebSocket, connectWebSocket } from '../src/ws.ts';
import type { FakeDaemon, FakeDaemonOptions } from './fake-daemon.ts';
import { fakeMachine } from './helpers.ts';
import { PROJECT, TARGET, THREAD } from './interrupt-world.ts';

const MiB = 1024 * 1024;
const relay = fileURLToPath(new URL('./fixtures/fake-proxy.mjs', import.meta.url));
const spawnRelay = ((_command: string, args: readonly string[], options: SpawnOptions) => spawn(process.execPath, [relay, ...args], options)) as unknown as typeof spawn;
const user = (id: string) => ({ type: 'userMessage', id, content: [{ type: 'text', text: `вопрос ${id}` }] });
const agent = (id: string) => ({ type: 'agentMessage', id, text: `ответ ${id}` });
const output = (id: string, bytes: number) => ({ type: 'commandExecution', id, command: 'make', exitCode: 1, aggregatedOutput: 'x'.repeat(bytes) });

/** A runtime, feed and Stop over a fake daemon whose socket link can be replaced; every poll is metered. */
async function world(platform: NodeJS.Platform, options: FakeDaemonOptions = {}) {
  const machine = await fakeMachine();
  const control = path.join(machine.codexHome, 'app-server-control', 'app-server-control.sock');
  const w = { daemon: await machine.daemon(options) as FakeDaemon, now: 1000, bytes: 0, opened: [] as string[], sentAt: [] as number[], tick: 0 };
  const metered = (transport: RpcTransport): RpcTransport => ({
    ...transport,
    send: (message) => { w.now += w.tick; w.sentAt.push(w.now); transport.send(message); },
    onMessage: (handler) => transport.onMessage((message, bytes) => { w.bytes += bytes ?? 0; handler(message, bytes); }),
  });
  const rt = createCodexRuntime(machine.context({ platform }), {
    isAlive: () => true,
    monotonic: () => w.now,
    random: () => 0.5,
    openDaemon: async (socket, opts) => {
      // The runtime resolved the link (realpath); where that is not possible the link is read here.
      const target = socket === control ? await readlink(control) : socket;
      w.opened.push(target);
      const transport = platform === 'win32'
        ? await connectWebSocket(proxyStream({ command: 'codex.exe', env: { ...process.env } as Record<string, string>, socketPath: target }, spawnRelay), opts)
        : await connectUnixWebSocket(target, opts);
      return metered(transport);
    },
  });
  rt.program = { path: 'codex', installed: true, version: '0.169.0', error: null, unsupported: null, checkedAt: null };
  await rt.daemon();
  const stop = createInterruptParts(rt, { interruptWaitMs: 1500, interruptPollMs: 5 });
  stop.sessions(PROJECT, [{ localId: THREAD } as SessionInfo]);
  const chat = createChatParts({
    withDaemon: (fn, ms) => rt.withDaemon(fn, ms), readDaemon: (fn, ms) => rt.readDaemon(fn, ms),
    offline: () => rt.connection.offline(), serverIdentity: () => rt.connection.identity(),
    shared: async () => true, log: () => undefined, onThreadRead: stop.observe, home: rt.paths.home,
    now: () => w.now, // The provider's feed and its runtime both use performance.now; one clock here.
  });
  /** One metered poll: accepted bytes, list pages and connections of that poll. */
  const poll = async (thread = THREAD, limit = CHAT_PAGE_LIMIT) => {
    const from = w.daemon.calls.length;
    const bytes = w.bytes;
    const opened = w.opened.length;
    const page = await chat.readMessages(thread, limit, PROJECT.id);
    const calls = w.daemon.calls.slice(from);
    return { page, bytes: w.bytes - bytes, pages: calls.filter((c) => c.method === 'thread/turns/list' || c.method === 'thread/items/list').length, connections: w.opened.length - opened, calls };
  };
  /** Every call of every daemon of this world: no full history, every resume without turns. */
  const audit = (daemons: FakeDaemon[]) => {
    for (const call of daemons.flatMap((d) => d.calls)) {
      const params = (call.params ?? {}) as Record<string, unknown>;
      assert.notEqual(params['includeTurns'], true, `${call.method} with includeTurns`);
      if (call.method === 'thread/resume') assert.equal(params['excludeTurns'], true);
      if (call.method === 'thread/turns/list') assert.ok(['notLoaded', 'full', 'summary'].includes(String(params['itemsView'])), 'explicit itemsView');
    }
  };
  return { w, rt, stop, chat, poll, audit, machine };
}

for (const platform of ['darwin', 'linux', 'win32'] as const) {
  test(`${platform}: a history above 16 MiB and an item above 16 MiB in one turn, measured per poll`, { timeout: 120_000 }, async (t) => {
    const { w, rt, stop, poll, audit, machine } = await world(platform);
    try {
      const turns: Record<string, unknown>[] = Array.from({ length: 6 }, (_, k) => ({ id: `turn-${k}`, status: 'completed', items: [user(`u${k}`), output(`c${k}`, 3 * MiB), agent(`a${k}`)] }));
      turns.push({ id: 'turn-6', status: 'completed', items: [user('u6'), output('c6', MAX_MESSAGE_BYTES + MiB), agent('a6')] });
      w.daemon.threads.set(THREAD, { status: 'idle', turns });
      const polls = [];
      let last;
      for (let n = 0; n < 12; n += 1) {
        last = await poll();
        polls.push({ bytes: last.bytes, pages: last.pages });
        assert.ok(last.pages <= HISTORY_POLL_PAGES, `poll ${n}: ${last.pages} pages`);
        assert.ok(last.bytes <= HISTORY_POLL_BYTES, `poll ${n}: ${last.bytes} bytes`);
        if (last.page.sync?.state !== 'loading') break;
      }
      assert.ok(polls.length > 1, 'more than one poll for 34 MiB of history');
      const page = last!.page;
      assert.deepEqual(page.messages.map((m) => m.id), ['u0', 'a0', 'u1', 'a1', 'u2', 'a2', 'u3', 'a3', 'u4', 'a4', 'u5', 'a5', 'u6', 'a6']);
      assert.deepEqual(page.sync?.gaps, [{ turnId: 'turn-6', reason: HISTORY_GAP_REASON, afterItemId: 'u6', beforeItemId: 'a6' }]);
      const available = stop.interruptAvailability(PROJECT, THREAD).available;
      // Idle polls: the gap is not read again, only the newest turn tail, one connection, a few KiB.
      for (let n = 0; n < 3; n += 1) {
        const idle = await poll();
        assert.equal(idle.connections, 1);
        assert.ok(idle.bytes < 16 * 1024, `idle poll ${idle.bytes} bytes`);
        assert.deepEqual(idle.calls.filter((c) => c.method === 'thread/items/list').map((c) => (c.params as { turnId: string }).turnId), ['turn-6']);
        assert.equal(idle.page.sync?.state, 'partial');
        assert.equal(stop.interruptAvailability(PROJECT, THREAD).available, available, 'Stop availability unchanged');
      }
      assert.equal(rt.connection.epoch(), 0, 'refused pages never change the epoch');
      assert.equal(rt.connection.offline(), null, 'no backoff');
      audit([w.daemon]);
      assert.ok(!w.daemon.calls.some((c) => ['turn/start', 'turn/interrupt', 'thread/resume'].includes(c.method)));
      t.diagnostic(`${platform} polls ${JSON.stringify(polls)}`);
    } finally {
      await machine.close();
    }
  });
}

test('a steady active turn: a finished 1 MiB output is downloaded once, the new answer once', async () => {
  const { w, poll, machine } = await world('linux');
  try {
    const items: Record<string, unknown>[] = [user('u1'), output('c1', MiB), { ...agent('a1'), pending: true }];
    const turn = { id: 'turn-1', status: 'inProgress', items };
    w.daemon.threads.set(THREAD, { status: 'active', turns: [turn] });
    const first = await poll();
    assert.ok(first.bytes > MiB);
    for (let n = 0; n < 4; n += 1) {
      const steady = await poll();
      assert.ok(steady.bytes < 8 * 1024, `steady poll ${steady.bytes} bytes`);
      assert.deepEqual(steady.page.messages.map((m) => m.id), ['u1']);
    }
    delete items[2]!['pending'];
    turn.status = 'completed';
    const done = await poll();
    assert.ok(done.bytes < 8 * 1024);
    assert.deepEqual(done.page.messages.map((m) => m.id), ['u1', 'a1']);
  } finally {
    await machine.close();
  }
});

test('the 5 s deadline counts connect, status and items: no request is sent after it', async () => {
  const { w, poll, machine } = await world('darwin');
  try {
    w.daemon.threads.set(THREAD, { status: 'idle', turns: Array.from({ length: 5 }, (_, k) => ({ id: `turn-${k}`, status: 'completed', items: [user(`u${k}`)] })) });
    w.tick = 1200; // Every request takes 1.2 s of the injected monotonic clock.
    const start = w.now;
    const slow = await poll();
    assert.equal(slow.page.sync?.state, 'loading');
    assert.ok(w.sentAt.every((at) => at - start <= HISTORY_POLL_MS), JSON.stringify(w.sentAt.map((at) => at - start)));
    w.tick = 0;
    const rest = await poll();
    assert.equal(rest.page.sync?.state, 'ready', 'the next poll goes on from where the last one stopped');
    assert.equal(rest.page.messages.length, 5);
  } finally {
    await machine.close();
  }
});

test('a replaced socket: several readers and tabs share one downtime, then recover; Stop checks its target again', async () => {
  const { w, rt, stop, chat, poll, audit, machine } = await world('darwin', { interruptMode: 'state' });
  const daemons = [w.daemon];
  try {
    const fill = (d: FakeDaemon, id: string) => {
      d.threads.set(THREAD, { status: 'active', turns: [{ id, status: 'inProgress', items: [user('u1')] }] });
      d.threads.set('thread-two', { status: 'idle', turns: [{ id: 'turn-2', status: 'completed', items: [agent('a2')] }] });
      d.loaded.add(THREAD);
    };
    fill(w.daemon, TARGET.nativeTurnId!);
    assert.equal((await poll()).page.sync?.state, 'ready');
    assert.equal((await poll('thread-two')).page.sync?.state, 'ready');
    assert.equal(stop.interruptAvailability(PROJECT, THREAD).available, true);
    // The daemon is gone: Mac and iPad tabs poll at once; the second thread waits too.
    await w.daemon.close();
    const opened = w.opened.length;
    const [mac, ipad] = await Promise.all([chat.readMessages(THREAD, CHAT_PAGE_LIMIT, PROJECT.id), chat.readMessages(THREAD, CHAT_PAGE_LIMIT, PROJECT.id)]);
    assert.deepEqual(mac, ipad, 'both tabs get the same snapshot and the same server state');
    assert.equal(mac.sync?.state, 'reconnecting');
    assert.deepEqual(mac.messages.map((m) => m.id), ['u1']);
    assert.equal((await chat.readMessages('thread-two', CHAT_PAGE_LIMIT, PROJECT.id)).sync?.state, 'reconnecting');
    assert.equal(w.opened.length - opened, 1, 'one attempt for all readers');
    assert.equal(stop.interruptAvailability(PROJECT, THREAD).available, false, 'no Stop on an old snapshot');
    w.now += 31_000;
    const [late1, late2] = await Promise.all([chat.readMessages(THREAD, CHAT_PAGE_LIMIT, PROJECT.id), chat.readMessages(THREAD, CHAT_PAGE_LIMIT, PROJECT.id)]);
    assert.deepEqual(late1.sync, late2.sync);
    assert.equal(late1.sync?.state, 'unavailable');
    assert.equal(late1.sync?.reason, UNAVAILABLE_REASON);
    assert.ok((late1.sync?.retryAfterMs ?? 99_999) <= RECOVERY_RETRY_MAX_MS);
    // A new daemon behind the same link, with a new turn: the readers recover without reload.
    w.daemon = await machine.daemon({ interruptMode: 'state' });
    daemons.push(w.daemon);
    fill(w.daemon, 'native-2');
    w.now += 11_000;
    const back = await poll();
    assert.equal(back.page.sync?.state, 'ready');
    assert.equal((await poll('thread-two')).page.sync?.state, 'ready');
    assert.equal(rt.connection.offline(), null);
    // Stop of the old turn after the reconnect: two fresh preflight reads find the successor.
    const reads = w.daemon.calls.length;
    assert.deepEqual(await stop.interruptTurn(PROJECT, THREAD, TARGET), { status: 'stale', stopped: false });
    const own = w.daemon.calls.slice(reads);
    assert.ok(own.filter((c) => c.method === 'thread/read').length >= 1);
    assert.ok(!own.some((c) => c.method === 'turn/interrupt' || c.method === 'thread/items/list'));
    audit(daemons);
  } finally {
    await machine.close();
  }
});

test('a lost answer of turn/interrupt is never sent again; the feed and Stop recover afterwards', async () => {
  const { w, rt, stop, poll, audit, machine } = await world('linux', { dropOn: 'turn/interrupt' });
  try {
    w.daemon.threads.set(THREAD, { status: 'active', turns: [{ id: TARGET.nativeTurnId!, status: 'inProgress', items: [user('u1')] }] });
    await poll();
    assert.equal(stop.interruptAvailability(PROJECT, THREAD).available, true);
    await assert.rejects(stop.interruptTurn(PROJECT, THREAD, TARGET));
    assert.equal(rt.connection.offline()?.state, 'reconnecting');
    w.now += 300;
    assert.equal((await poll()).page.sync?.state, 'ready');
    w.now += 20_000;
    await poll();
    assert.equal(w.daemon.calls.filter((c) => c.method === 'turn/interrupt').length, 1);
    // Two fresh preflight reads precede the one interrupt (each a metadata and turns pair).
    const before = w.daemon.calls.slice(0, w.daemon.calls.findIndex((c) => c.method === 'turn/interrupt'));
    const tail = before.slice(before.map((c) => c.method).lastIndexOf('initialize'));
    assert.equal(tail.filter((c) => c.method === 'thread/read').length, 2);
    assert.equal(tail.filter((c) => c.method === 'thread/turns/list').length, 2);
    assert.equal(stop.interruptAvailability(PROJECT, THREAD).available, true, 'a new feed read restores availability');
    audit([w.daemon]);
  } finally {
    await machine.close();
  }
});
