// The paginated Codex history reader (spec M32 sections 2.2-2.4) on the fake daemon: portions per
// turn from item anchors, bounded gaps around items larger than the transport limit, the active
// turn tail, the per-poll budget, legacy and unsupported histories, failures, the cache limits.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { CHAT_PAGE_LIMIT, CHAT_TEXT_MAX_CHARS, ProviderError } from '#provider-registry';
import { HISTORY_CACHE_THREADS, HISTORY_GAP_REASON, HISTORY_POLL_PAGES, HISTORY_UNSUPPORTED_REASON, createHistoryReader } from '../src/index.ts';
import type { HistoryDeps } from '../src/index.ts';
import { createRpcSession, initializeSession } from '../src/rpc.ts';
import { MAX_MESSAGE_BYTES, connectUnixWebSocket } from '../src/ws.ts';
import { startFakeDaemon } from './fake-daemon.ts';
import type { FakeDaemon } from './fake-daemon.ts';

const LIMIT = 64 * 1024;
const user = (id: string, text = `вопрос ${id}`) => ({ type: 'userMessage', id, content: [{ type: 'text', text }] });
const agent = (id: string, text = `ответ ${id}`) => ({ type: 'agentMessage', id, text });
const output = (id: string, bytes: number) => ({ type: 'commandExecution', id, command: 'make', exitCode: 3, aggregatedOutput: 'x'.repeat(bytes) });

let tmp = '';
let daemon: FakeDaemon;
let clock = 0;

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfkh-'));
  daemon = await startFakeDaemon(path.join(tmp, 'h.sock'));
});
after(async () => {
  await daemon.close();
  await rm(tmp, { recursive: true, force: true });
});
beforeEach(() => {
  daemon.calls.length = 0;
  daemon.threads.clear();
  clock = 0;
});

/** withDaemon over the fake with a small message limit: an item of a few hundred KiB is refused. */
function withDaemonOf(target: FakeDaemon, limit = LIMIT): HistoryDeps['withDaemon'] {
  return async (fn) => {
    const session = createRpcSession(await connectUnixWebSocket(target.socketPath, { timeoutMs: 2000, maxFrameBytes: limit, maxMessageBytes: limit }), { timeoutMs: 2000 });
    try {
      return await fn(session, await initializeSession(session));
    } finally {
      session.close();
    }
  };
}

function reader(extra: Partial<HistoryDeps> = {}) {
  const observed: unknown[] = [];
  const history = createHistoryReader({ withDaemon: withDaemonOf(daemon), onThreadRead: (_id, answer) => observed.push(answer), now: () => clock, ...extra });
  return { history, observed, read: (thread: string, limit = CHAT_PAGE_LIMIT) => history.read(`home\np\n${thread}`, thread, limit) };
}

const lists = (from = 0) => daemon.calls.slice(from).filter((c) => c.method === 'thread/turns/list' || c.method === 'thread/items/list');
const itemCalls = (from = 0) => daemon.calls.slice(from).filter((c) => c.method === 'thread/items/list').map((c) => c.params as { turnId: string; cursor: unknown; sortDirection: string; limit: number });

/** Polls until the page is no longer loading; every poll stays within the page budget. */
async function settle(read: () => Promise<Awaited<ReturnType<ReturnType<typeof reader>['read']>>>, polls = 6) {
  for (let n = 1; n <= polls; n += 1) {
    const from = daemon.calls.length;
    const page = await read();
    assert.ok(lists(from).length <= HISTORY_POLL_PAGES, `poll ${n}: ${lists(from).length} pages`);
    if (page.sync?.state !== 'loading') return { page, polls: n };
  }
  throw new Error('still loading');
}

test('an output above the message limit: both short messages of the turn stay, the gap is one bounded range', async () => {
  daemon.threads.set('t-big', { status: 'idle', turns: [{ id: 'turn-1', status: 'failed', items: [user('u1'), output('c1', 300_000), agent('a1')] }] });
  const { read, observed } = reader();
  const { page } = await settle(() => read('t-big'));
  assert.deepEqual(page.messages.map((m) => m.id), ['u1', 'a1']);
  assert.deepEqual(page.sync, { state: 'partial', reason: HISTORY_GAP_REASON, gaps: [{ turnId: 'turn-1', reason: HISTORY_GAP_REASON, afterItemId: 'u1', beforeItemId: 'a1' }], gapCount: 1 });
  assert.ok(observed.every((answer) => answer !== null), 'a refused item never invalidates the Stop snapshot');
  // The next polls do not look at the gap again: one forward read after a1, nothing refused.
  for (let n = 0; n < 2; n += 1) {
    const from = daemon.calls.length;
    const again = await read('t-big');
    assert.deepEqual(again.messages.map((m) => m.id), ['u1', 'a1']);
    assert.deepEqual(itemCalls(from).map((c) => [c.turnId, c.cursor, c.sortDirection]), [['turn-1', { type: 'item', itemId: 'a1' }, 'asc']]);
    assert.equal(daemon.calls.slice(from).filter((c) => c.method === 'initialize').length, 1, 'no reconnect after a refused page');
  }
});

test('two large outputs: the message between them is inside the unread range, the turn edges are read', async () => {
  daemon.threads.set('t-two', { status: 'idle', turns: [{ id: 'turn-1', status: 'completed', items: [user('u1'), output('c1', 300_000), agent('m1'), output('c2', 300_000), agent('a1')] }] });
  const { read } = reader();
  const { page } = await settle(() => read('t-two'));
  assert.deepEqual(page.messages.map((m) => m.id), ['u1', 'a1']);
  assert.deepEqual(page.sync?.gaps, [{ turnId: 'turn-1', reason: HISTORY_GAP_REASON, afterItemId: 'u1', beforeItemId: 'a1' }]);
});

test('an active turn is read from its newest completed item; a finished output is not downloaded again', async () => {
  const items: Record<string, unknown>[] = [user('u1'), output('c1', 20_000), { ...agent('a1'), pending: true }];
  const turn = { id: 'turn-1', status: 'inProgress', items };
  daemon.threads.set('t-live', { status: 'active', turns: [turn] });
  const { read } = reader();
  assert.deepEqual((await read('t-live')).messages.map((m) => m.id), ['u1']);
  for (let n = 0; n < 2; n += 1) {
    const sent = daemon.sentBytes;
    const from = daemon.calls.length;
    assert.deepEqual((await read('t-live')).messages.map((m) => m.id), ['u1']);
    assert.deepEqual(itemCalls(from).map((c) => c.cursor), [{ type: 'item', itemId: 'c1' }]);
    assert.ok(daemon.sentBytes - sent < 5000, `steady poll sent ${daemon.sentBytes - sent} bytes`);
  }
  delete items[2]!['pending'];
  turn.status = 'completed';
  const from = daemon.calls.length;
  const done = await read('t-live');
  assert.deepEqual(done.messages.map((m) => m.id), ['u1', 'a1']);
  assert.deepEqual(done.sync, { state: 'ready' });
  assert.deepEqual(itemCalls(from).map((c) => c.cursor), [{ type: 'item', itemId: 'c1' }]);
});

test('an open gap at the end of an active turn is looked at again after 30 s, not on every poll', async () => {
  const items: Record<string, unknown>[] = [user('u1'), output('c1', 300_000)];
  daemon.threads.set('t-open', { status: 'active', turns: [{ id: 'turn-1', status: 'inProgress', items }] });
  const { read } = reader();
  const { page } = await settle(() => read('t-open'));
  assert.deepEqual(page.sync?.gaps, [{ turnId: 'turn-1', reason: HISTORY_GAP_REASON, afterItemId: 'u1' }]);
  items.push(agent('a1'));
  clock += 10_000;
  let from = daemon.calls.length;
  assert.deepEqual((await read('t-open')).messages.map((m) => m.id), ['u1']);
  assert.deepEqual(itemCalls(from), [], 'an open gap checked 10 s ago is not read');
  clock += 25_000;
  from = daemon.calls.length;
  const later = await read('t-open');
  assert.deepEqual(later.messages.map((m) => m.id), ['u1', 'a1']);
  assert.deepEqual(later.sync?.gaps, [{ turnId: 'turn-1', reason: HISTORY_GAP_REASON, afterItemId: 'u1', beforeItemId: 'a1' }]);
  assert.deepEqual(itemCalls(from).map((c) => [c.cursor, c.sortDirection]).slice(0, 1), [[null, 'desc']], 'the recheck reads from the end of the turn');
});

test('a long history loads over several polls within the page budget and never starts again from zero', async () => {
  // One message per turn: 50 turns of the newest page are not enough, older turns are listed too.
  const turns = Array.from({ length: 60 }, (_, k) => ({ id: `turn-${k}`, status: 'completed', items: [user(`u${k}`), output(`c${k}`, 100)] }));
  daemon.threads.set('t-long', { status: 'idle', turns });
  const { read } = reader();
  const { page, polls } = await settle(() => read('t-long'), 14);
  assert.ok(polls > 1);
  assert.equal(page.messages.length, 60);
  assert.equal(page.messages[0]?.id, 'u0');
  assert.equal(page.messages.at(-1)?.id, 'u59');
  assert.equal(page.truncated, false);
  const fromStart = itemCalls().filter((c) => c.cursor === null).map((c) => c.turnId);
  assert.equal(new Set(fromStart).size, fromStart.length, 'every turn is read from its start once');
  assert.ok(lists().some((c) => c.method === 'thread/turns/list' && (c.params as { cursor?: unknown }).cursor === 't:50'), 'older turns by the opaque cursor');
  const from = daemon.calls.length;
  await read('t-long');
  assert.deepEqual(itemCalls(from).map((c) => c.turnId), ['turn-59'], 'an idle poll reads only the newest turn tail');
});

test('concurrent reads of one thread share one poll', async () => {
  daemon.threads.set('t-one', { status: 'idle', turns: [{ id: 'turn-1', status: 'completed', items: [user('u1'), agent('a1')] }] });
  const { read } = reader();
  const [first, second] = await Promise.all([read('t-one'), read('t-one', 1)]);
  assert.deepEqual(first.messages.map((m) => m.id), ['u1', 'a1']);
  assert.deepEqual(second.messages.map((m) => m.id), ['a1']);
  assert.equal(daemon.calls.filter((c) => c.method === 'thread/read').length, 1);
});

test('legacy history: full turns by thread/turns/list, never thread/items/list', async () => {
  daemon.threads.set('t-old', { status: 'notLoaded', historyMode: 'legacy', turns: [{ id: 'turn-1', status: 'completed', items: [user('u1'), output('c1', 100), agent('a1')] }] });
  const { read } = reader();
  const page = await read('t-old');
  assert.deepEqual(page.messages.map((m) => m.id), ['u1', 'a1']);
  assert.deepEqual(page.sync, { state: 'ready' });
  assert.ok(!daemon.calls.some((c) => c.method === 'thread/items/list'));
  assert.ok(lists().some((c) => (c.params as { itemsView?: string }).itemsView === 'full'));
});

test('an unknown history mode is codex-history-unsupported 502 with sync unavailable and no retry', async () => {
  daemon.threads.set('t-new', { status: 'idle', historyMode: 'sharded', turns: [] });
  const { read, observed } = reader();
  await assert.rejects(read('t-new'), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, 'codex-history-unsupported');
    assert.equal(error.status, 502);
    assert.deepEqual(error.details, { sync: { state: 'unavailable', reason: HISTORY_UNSUPPORTED_REASON } });
    return true;
  });
  assert.deepEqual(observed, [null]);
});

test('a network failure answers the full last snapshot with reconnecting, without one 503', async () => {
  daemon.threads.set('t-gone', { status: 'idle', turns: [{ id: 'turn-1', status: 'completed', items: [user('u1')] }] });
  let down = false;
  const open = withDaemonOf(daemon);
  const gone = () => Promise.reject(Object.assign(new Error('connect ENOENT'), { code: 'ENOENT' }));
  const { read, observed } = reader({ withDaemon: (fn, ms) => (down ? gone() : open(fn, ms)), offline: () => (down ? { state: 'reconnecting', reason: 'Восстанавливаем подключение к Codex…', retryAfterMs: 900 } : null) });
  assert.equal((await read('t-gone')).messages.length, 1);
  down = true;
  assert.deepEqual(await read('t-gone'), { messages: [{ id: 'u1', role: 'user', text: 'вопрос u1', at: null }], truncated: false, sync: { state: 'reconnecting', reason: 'Восстанавливаем подключение к Codex…', retryAfterMs: 900 } });
  assert.equal(observed.at(-1), null);
  await assert.rejects(read('t-never'), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, 'codex-reconnecting');
    assert.equal(error.status, 503);
    assert.deepEqual(error.details, { sync: { state: 'reconnecting', reason: 'Восстанавливаем подключение к Codex…', retryAfterMs: 900 }, retryAfterMs: 900 });
    return true;
  });
  // Not a network failure: the old 502, never the cached page.
  const { read: other } = reader({ withDaemon: (fn, ms) => (down ? Promise.reject(new Error('refused the WebSocket connection')) : open(fn, ms)) });
  down = false;
  await other('t-gone');
  down = true;
  await assert.rejects(other('t-gone'), (error: unknown) => error instanceof ProviderError && error.code === 'chat-unavailable' && error.status === 502);
});

test('a failed items read is a 502 but keeps the status the poll observed for Stop', async () => {
  const refusing = await startFakeDaemon(path.join(tmp, 'i.sock'), { itemsError: 'boom' });
  try {
    refusing.threads.set('t-items', { status: 'active', turns: [{ id: 'turn-1', status: 'inProgress', items: [user('u1')] }] });
    const observed: unknown[] = [];
    const history = createHistoryReader({ withDaemon: withDaemonOf(refusing), onThreadRead: (_id, answer) => observed.push(answer), now: () => clock });
    await assert.rejects(history.read('k', 't-items', 10), (error: unknown) => error instanceof ProviderError && error.code === 'chat-unavailable' && /boom/.test(error.message));
    assert.deepEqual(observed, [{ thread: { id: 't-items', status: { type: 'active' }, historyMode: 'paginated', turns: [{ id: 'turn-1', status: 'inProgress', items: [] }] } }]);
  } finally {
    await refusing.close();
  }
});

test('the deadline counts from the start of the poll: no items are read without time left', async () => {
  daemon.threads.set('t-late', { status: 'idle', turns: [{ id: 'turn-1', status: 'completed', items: [user('u1')] }] });
  const { read } = reader({ onThreadRead: () => { clock += 4500; } });
  const page = await read('t-late');
  assert.deepEqual(page.messages, []);
  assert.equal(page.sync?.state, 'loading');
  assert.deepEqual(itemCalls(), []);
});

test('an old status is read again before the poll answers', async () => {
  daemon.threads.set('t-slow', { status: 'idle', turns: [{ id: 'turn-1', status: 'completed', items: [user('u1')] }, { id: 'turn-2', status: 'completed', items: [agent('a2')] }] });
  let reads = 0;
  const { read, observed } = reader({ onThreadRead: () => { reads += 1; if (reads === 1) clock += 2500; } });
  assert.equal((await read('t-slow')).messages.length, 2);
  assert.equal(daemon.calls.filter((c) => c.method === 'thread/read').length, 2);
  assert.equal(reads, 2);
  assert.equal(observed.length, 0, 'the extra deps hook replaced the collector');
});

test('the cache keeps at most 64 threads and counts texts in UTF-8 bytes after the shared cut', async () => {
  const long = 'я'.repeat(CHAT_TEXT_MAX_CHARS + 500);
  for (let k = 0; k <= HISTORY_CACHE_THREADS; k += 1) daemon.threads.set(`t-${k}`, { status: 'idle', turns: [{ id: 'turn-1', status: 'completed', items: [agent('a1', k === HISTORY_CACHE_THREADS ? long : 'ok')] }] });
  const { history, read } = reader();
  for (let k = 0; k <= HISTORY_CACHE_THREADS; k += 1) await read(`t-${k}`);
  const usage = history.usage();
  assert.equal(usage.threads, HISTORY_CACHE_THREADS);
  const cut = (await read(`t-${HISTORY_CACHE_THREADS}`)).messages[0]!.text;
  assert.ok(cut.length < long.length);
  assert.equal(usage.bytes, (HISTORY_CACHE_THREADS - 1) * 2 + Buffer.byteLength(cut, 'utf8'));
});

test('an output above the real 16 MiB message limit keeps both messages of the turn', async () => {
  daemon.threads.set('t-huge', { status: 'idle', turns: [{ id: 'turn-1', status: 'completed', items: [user('u1'), output('c1', MAX_MESSAGE_BYTES + 1024), agent('a1')] }] });
  const { read } = reader({ withDaemon: withDaemonOf(daemon, MAX_MESSAGE_BYTES) });
  const { page } = await settle(() => read('t-huge'), 8);
  assert.deepEqual(page.messages.map((m) => m.id), ['u1', 'a1']);
  assert.deepEqual(page.sync?.gaps, [{ turnId: 'turn-1', reason: HISTORY_GAP_REASON, afterItemId: 'u1', beforeItemId: 'a1' }]);
});

test('a bounded gap is checked once more when the turn status changes, then left alone', async () => {
  const turn = { id: 'turn-1', status: 'inProgress', items: [user('u1'), output('c1', 300_000), agent('a1')] };
  daemon.threads.set('t-status', { status: 'active', turns: [turn] });
  const { read } = reader();
  await settle(() => read('t-status'));
  const desc = (from: number) => itemCalls(from).filter((c) => c.sortDirection === 'desc').map((c) => c.cursor);
  let from = daemon.calls.length;
  await read('t-status');
  assert.deepEqual(desc(from), [], 'same status and server: the gap is not read');
  turn.status = 'completed';
  from = daemon.calls.length;
  const page = await read('t-status');
  assert.deepEqual(desc(from).slice(0, 1), [{ type: 'item', itemId: 'a1' }], 'one look from the later side');
  assert.equal(page.sync?.state, 'partial');
  from = daemon.calls.length;
  await read('t-status');
  assert.deepEqual(desc(from), []);
});

test('the cache drops the least recently read threads above its byte limit', async () => {
  for (const k of [1, 2, 3]) daemon.threads.set(`t-b${k}`, { status: 'idle', turns: [{ id: 'turn-1', status: 'completed', items: [agent('a1', 'ы'.repeat(30))] }] });
  const { history, read } = reader({ cacheBytes: 130 });
  await read('t-b1');
  await read('t-b2');
  await read('t-b1');
  await read('t-b3');
  assert.deepEqual(history.usage(), { threads: 2, bytes: 120 });
  const from = daemon.calls.length;
  await read('t-b1');
  assert.ok(!itemCalls(from).some((c) => c.cursor === null), 't-b1 was kept: read from its anchor');
});
