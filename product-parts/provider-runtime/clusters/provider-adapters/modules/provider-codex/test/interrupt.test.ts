import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgentChannel, parseHookInput } from '#agent-channel';
import type { RpcSession, InitializeResult } from '../src/rpc.ts';
import { createChatParts } from '../src/chat.ts';
import { PROJECT, TARGET, THREAD, answer, deferred, tick, world } from './interrupt-world.ts';

const mutations = (calls: Array<{ method: string }>) => calls.filter((c) => c.method !== 'thread/read' && c.method !== 'initialize');

test('the exact native id is interrupted and terminal thread/read confirms it without a Stop hook', async () => {
  const { w, parts, interrupt } = world();
  const channel = createAgentChannel({ resolveProject: async () => ({ id: PROJECT.id }) });
  try {
    await channel.prompt(parseHookInput('codex', { session_id: THREAD, turn_id: TARGET.nativeTurnId, cwd: PROJECT.path, prompt: 'work' })!);
    const key = `codex:${THREAD}`;
    const ref = channel.interruption(key)!.turnRef!;
    channel.suspend(key);
    const result = await interrupt({ ...TARGET, turnRef: ref });
    assert.deepEqual(result, { status: 'interrupted', stopped: true, proof: 'provider-state', nativeTurnId: TARGET.nativeTurnId });
    assert.deepEqual(mutations(w.calls), [{ method: 'turn/interrupt', params: { threadId: THREAD, turnId: TARGET.nativeTurnId } }]);
    assert.equal(channel.confirmInterrupted(key, ref, result.nativeTurnId!), true);
    assert.equal(channel.get(key)!.state, 'waiting');
    assert.equal(w.closed, 1);
    assert.equal(parts.interruptAvailability(PROJECT, THREAD).available, true);
    await channel.prompt(parseHookInput('codex', { session_id: THREAD, turn_id: 'native-2', cwd: PROJECT.path, prompt: 'next' })!);
    assert.equal(channel.get(key)!.state, 'working');
    assert.equal(channel.interruption(key)!.barrier, false);
  } finally { channel.close(); }
});

test('a matching turn/completed notification is proof even if no updated read is available', async () => {
  const { w, interrupt } = world();
  w.command = () => {
    w.notify('turn/completed', { threadId: THREAD, turn: { id: 'native-1', status: 'interrupted', items: [] } });
    w.read = () => { throw new Error('history temporarily unavailable'); };
    return {};
  };
  assert.equal((await interrupt()).status, 'interrupted');
  assert.equal(w.reads, 3, 'the freshness read may fail; the matching completion remains proof');
});

test('empty successful RPC, another thread and old native completions do not prove Stop', async () => {
  const { w, interrupt } = world(100);
  w.command = () => {
    w.notify('turn/completed', { threadId: 'other', turn: { id: 'native-1', status: 'interrupted' } });
    w.notify('turn/completed', { threadId: THREAD, turn: { id: 'old-native', status: 'interrupted' } });
    return {};
  };
  await assert.rejects(interrupt(), { code: 'interrupt-timeout', status: 504 });
  assert.equal(mutations(w.calls).length, 1);
});

test('a naturally completed expected turn is already-idle and receives no interrupt', async () => {
  const { w, interrupt } = world();
  w.read = () => answer('native-1', 'completed', 'idle');
  assert.deepEqual(await interrupt(), { status: 'already-idle', stopped: true, proof: 'provider-state', nativeTurnId: 'native-1' });
  assert.deepEqual(mutations(w.calls), []);
});

test('native successors before the command and during confirmation are stale; no second interrupt is sent', async () => {
  for (const when of ['before', 'during'] as const) {
    const { w, interrupt } = world();
    if (when === 'before') w.read = () => w.reads === 1 ? answer() : answer('native-2');
    else w.command = () => { w.value = answer('native-2'); return {}; };
    assert.deepEqual(await interrupt(), { status: 'stale', stopped: false });
    assert.equal(mutations(w.calls).length, when === 'before' ? 0 : 1);
  }
});

test('a late old completion cannot win over a successor turn/started notification', async () => {
  const { w, interrupt } = world();
  w.command = () => {
    w.notify('turn/completed', { threadId: THREAD, turn: { id: 'native-1', status: 'interrupted' } });
    w.notify('turn/started', { threadId: THREAD, turn: { id: 'native-2', status: 'inProgress' } });
    return {};
  };
  assert.deepEqual(await interrupt(), { status: 'stale', stopped: false });
});

test('a target without hook native id is pinned to the cached native id, not a fresh successor', async () => {
  const current = world();
  const result = await current.interrupt({ ...TARGET, nativeTurnId: null });
  assert.ok(result.stopped);
  assert.equal(result.nativeTurnId, 'native-1');
  const successor = world();
  successor.w.read = () => answer('native-2');
  assert.deepEqual(await successor.interrupt({ ...TARGET, nativeTurnId: null }), { status: 'stale', stopped: false });
  assert.deepEqual(mutations(successor.w.calls), []);
});

test('availability is cached and refuses external, unknown, old-version and unavailable-daemon control', async () => {
  const { w, runtime, parts, interrupt } = world();
  assert.equal(parts.interruptAvailability(PROJECT, THREAD).available, true);
  assert.deepEqual(w.calls, []);
  parts.observe(THREAD, answer('native-1', 'inProgress', 'notLoaded'));
  assert.match(parts.interruptAvailability(PROJECT, THREAD).reason!, /внешний процесс/);
  assert.equal((await interrupt()).status, 'unavailable');
  parts.observe(THREAD, answer('native-1', 'inProgress', 'idle'));
  assert.equal(parts.interruptAvailability(PROJECT, THREAD).available, false);
  parts.observe(THREAD, null);
  assert.equal(parts.interruptAvailability(PROJECT, THREAD).available, false);
  parts.observe(THREAD, answer());
  runtime.program.version = '0.166.0';
  assert.equal((await interrupt()).status, 'unavailable');
  runtime.program.version = '0.167.2'; w.daemon = null;
  assert.equal((await interrupt()).status, 'unavailable');
  assert.deepEqual(w.calls, []);
});

test('RPC errors, malformed state and failed turns never masquerade as a successful stop', async () => {
  for (const mode of ['rpc', 'shape', 'failed'] as const) {
    const { w, interrupt } = world();
    if (mode === 'rpc') w.command = () => { throw new Error('daemon refused interrupt'); };
    if (mode === 'shape') w.read = () => ({ thread: { id: THREAD, turns: [] } });
    if (mode === 'failed') w.read = () => answer('native-1', 'failed', 'idle');
    await assert.rejects(interrupt(), { code: 'interrupt-failed', status: 502 });
  }
});

test('a connection finishing after the deadline never sends a late interrupt', async () => {
  const { w, runtime, interrupt } = world(50);
  const connect = deferred<void>();
  const open = runtime.withDaemon;
  runtime.withDaemon = async <T>(run: (session: RpcSession, init: InitializeResult) => Promise<T>, ms?: number): Promise<T> => { await connect.promise; return open(run, ms); };
  await assert.rejects(interrupt(), { code: 'interrupt-timeout' });
  connect.resolve(); await tick();
  assert.deepEqual(mutations(w.calls), []);
});

test('the existing feed read updates availability; a failed read invalidates it without a second RPC', async () => {
  const { w, runtime, parts } = world();
  const chat = createChatParts({ withDaemon: (run, timeout) => runtime.withDaemon(run, timeout), shared: async () => false, log: () => {}, onThreadRead: parts.observe });
  parts.observe(THREAD, null);
  await chat.readMessages(THREAD, 10);
  assert.equal(parts.interruptAvailability(PROJECT, THREAD).available, true);
  assert.equal(w.calls.filter((c) => c.method === 'thread/read').length, 1);
  w.read = () => { throw new Error('lost connection'); };
  await assert.rejects(chat.readMessages(THREAD, 10));
  assert.equal(parts.interruptAvailability(PROJECT, THREAD).available, false);
});


test('a fresh successor in thread/read wins over a late old completion even without turn/started', async () => {
  const { w, interrupt } = world();
  w.command = () => {
    w.value = answer('native-2');
    w.notify('turn/completed', { threadId: THREAD, turn: { id: 'native-1', status: 'interrupted' } });
    return {};
  };
  assert.deepEqual(await interrupt(), { status: 'stale', stopped: false });
});


test('a failed expected turn cannot be reported stopped by a conflicting late completion', async () => {
  const { w, interrupt } = world();
  w.command = () => {
    w.value = answer('native-1', 'failed', 'idle');
    w.notify('turn/completed', { threadId: THREAD, turn: { id: 'native-1', status: 'interrupted' } });
    return {};
  };
  await assert.rejects(interrupt(), { code: 'interrupt-failed' });
});
