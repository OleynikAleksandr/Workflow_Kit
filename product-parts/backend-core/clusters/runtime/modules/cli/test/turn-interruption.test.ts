import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgentChannel, parseHookInput } from '#agent-channel';
import { createHttpServer, createRouter, createStateRegistry } from '#http-server';
import { registerChannelRoutes } from '#agent-channel';
import { createProviderRegistry, createStubProvider, providerCapability, ProviderError } from '#provider-registry';
import type { InterruptResult, Project, Provider } from '#provider-registry';
import { createTurnInterruption } from '../src/turn-interruption.ts';

const KEY = 'alpha:s1';
const PROJECT = { id: 'p', name: 'Test', path: '/fixture', source: 'opened', createdAt: '2026-11-13' } as Project;
const confirmed = (status: 'interrupted' | 'already-idle' = 'interrupted', nativeTurnId = 'n1'): InterruptResult => ({ status, stopped: true, proof: 'provider-event', nativeTurnId });
const prompt = (native = 'n1') => parseHookInput('alpha', { session_id: 's1', turn_id: native, cwd: '/fixture', prompt: native })!;
const stop = (native = 'n1') => ({ ...prompt(native), lastAssistantMessage: 'done' });
function gate<T>() { let open!: (value: T) => void; const promise = new Promise<T>((resolve) => { open = resolve; }); return { promise, open }; }
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function world(started = true, timeoutMs = 1000) {
  const w = { calls: 0, pauses: 0, reviews: 0, lists: 0, available: true, capability: true, archived: false, result: confirmed(), run: null as null | (() => Promise<InterruptResult>) };
  const provider: Provider = {
    ...createStubProvider({ id: 'alpha', title: 'Alpha', task: 'T002' }),
    capabilities: async () => ({ interruptTurn: { available: w.capability } }),
    listSessions: async () => { w.lists += 1; return [{ provider: 'alpha', localId: 's1', title: 'Session', createdAt: '', origin: 'panel', state: 'running', links: {} }]; },
    interruptAvailability: () => ({ available: w.available, reason: w.available ? null : 'Dialog' }),
    interruptTurn: async () => { w.calls += 1; return w.run ? w.run() : w.result; },
  };
  const providers = createProviderRegistry();
  providers.register(provider);
  const channel = createAgentChannel({ resolveProject: async () => ({ id: 'p' }), excluded: () => w.archived });
  if (started) await channel.prompt(prompt());
  await providers.section([PROJECT]);
  const control = createTurnInterruption({ channel, providers, projects: { get: async (id) => id === 'p' ? PROJECT : undefined }, autopilot: { interrupt: async () => { w.pauses += 1; } }, reviews: { interrupted: async () => { w.reviews += 1; } }, timeoutMs });
  return { w, provider, providers, channel, control, ref: () => channel.interruption(KEY)!.turnRef! };
}

test('confirmed interruption changes the channel to waiting without any Stop hook; duplicates do not call the provider', async () => {
  const { w, channel, control, ref } = await world();
  try {
    const expected = ref();
    channel.enqueue(KEY, 'Keep this draft message');
    assert.deepEqual(await control.interrupt('p', KEY, { turnRef: expected }), confirmed());
    assert.equal(channel.get(KEY)!.state, 'waiting');
    assert.notEqual(ref(), expected);
    assert.deepEqual(channel.queued(KEY).map((m) => m.text), ['Keep this draft message']);
    assert.equal(channel.interruption(KEY)!.barrier, true);
    assert.equal(channel.interruption(KEY)!.pending, false);
    assert.equal(channel.interruption(KEY)!.result, 'interrupted');
    await control.interrupt('p', KEY, { turnRef: expected });
    assert.deepEqual([w.calls, w.pauses, w.reviews], [1, 1, 1]);
    const events: unknown[] = [];
    channel.onStop((e) => events.push(e));
    await channel.stop(stop()); // The old native hook is ignored after confirmation.
    assert.deepEqual(events, []);
    assert.equal(channel.get(KEY)!.state, 'waiting');
  } finally { channel.close(); }
});

test('already-idle still establishes the continuation barrier', async () => {
  const { w, channel, control, ref } = await world();
  try {
    await channel.stop(stop());
    w.result = confirmed('already-idle');
    assert.equal((await control.interrupt('p', KEY, { turnRef: ref() })).status, 'already-idle');
    assert.equal(channel.interruption(KEY)!.barrier, true);
  } finally { channel.close(); }
});

test('a stale turn pauses continuation but never interrupts its successor', async () => {
  const { w, channel, control, ref } = await world();
  try {
    const old = ref();
    await channel.prompt(prompt('n2'));
    const current = ref();
    await assert.rejects(control.interrupt('p', KEY, { turnRef: old }), { code: 'stale-turn', status: 409 });
    assert.equal(w.calls, 0);
    assert.equal(w.pauses, 1);
    assert.equal(ref(), current);
    assert.equal(channel.get(KEY)!.state, 'working');
    assert.equal(channel.interruption(KEY)!.barrier, true);
  } finally { channel.close(); }
});

test('concurrent requests share one pending provider call', async () => {
  const { w, channel, control, ref } = await world();
  const result = gate<InterruptResult>();
  w.run = () => result.promise;
  try {
    const expected = ref();
    const one = control.interrupt('p', KEY, { turnRef: expected });
    const two = control.interrupt('p', KEY, { turnRef: expected });
    await tick();
    assert.equal(channel.interruption(KEY)!.pending, true);
    assert.equal(w.calls, 1);
    result.open(confirmed());
    await Promise.all([one, two]);
    assert.equal(w.calls, 1);
  } finally { channel.close(); }
});

test('a late confirmation and native Stop cannot finish a newer user turn', async () => {
  const { w, channel, control, ref } = await world();
  const done = gate<InterruptResult>();
  w.run = () => done.promise;
  try {
    const request = control.interrupt('p', KEY, { turnRef: ref() });
    await tick();
    await channel.prompt(prompt('n2'));
    const next = ref();
    done.open(confirmed());
    await assert.rejects(request, { code: 'stale-turn' });
    await channel.stop(stop('n1'));
    assert.equal(ref(), next);
    assert.equal(channel.get(KEY)!.state, 'working');
    assert.equal(channel.interruption(KEY)!.barrier, false, 'a new explicit user prompt releases delivery');
  } finally { channel.close(); }
});

test('timeout does not mean success or duplicate an unresolved RPC; a late result cannot change state', async () => {
  const { w, channel, control, ref } = await world(true, 15);
  const done = gate<InterruptResult>();
  w.run = () => done.promise;
  try {
    const expected = ref();
    await assert.rejects(control.interrupt('p', KEY, { turnRef: expected }), { code: 'interrupt-timeout', status: 504 });
    assert.equal(channel.interruption(KEY)!.pending, false);
    assert.equal(channel.interruption(KEY)!.result, 'failed');
    assert.equal(channel.get(KEY)!.state, 'working');
    await assert.rejects(control.interrupt('p', KEY, { turnRef: expected }), { code: 'interrupt-timeout' });
    assert.equal(w.calls, 1);
    done.open(confirmed());
    await tick();
    assert.equal(channel.get(KEY)!.state, 'working');
    assert.equal(ref(), expected);
    w.run = null;
    w.result = confirmed('already-idle');
    await control.interrupt('p', KEY, { turnRef: expected });
    assert.equal(channel.get(KEY)!.state, 'waiting');
  } finally { channel.close(); }
});

test('validation refuses invalid, foreign, archived and unsupported sessions before effects', async () => {
  const { w, channel, provider, control, ref } = await world();
  try {
    await assert.rejects(control.interrupt('p', KEY, {}), { code: 'invalid-body' });
    await assert.rejects(control.interrupt('other', KEY, { turnRef: ref() }), { code: 'unknown-session' });
    await assert.rejects(control.interrupt('p', 'alpha:other', { turnRef: ref() }), { code: 'unknown-session' });
    w.capability = false;
    await assert.rejects(control.interrupt('p', KEY, { turnRef: ref() }), { code: 'interrupt-not-supported' });
    w.capability = true;
    w.available = false;
    await assert.rejects(control.interrupt('p', KEY, { turnRef: ref() }), { code: 'interrupt-not-supported' });
    w.available = true;
    delete provider.interruptTurn;
    await assert.rejects(control.interrupt('p', KEY, { turnRef: ref() }), { code: 'interrupt-not-supported' });
    assert.equal(channel.interruption(KEY)!.barrier, false);
    w.archived = true;
    await assert.rejects(control.interrupt('p', KEY, { turnRef: 'old' }), { code: 'session-archived' });
    assert.deepEqual([w.calls, w.pauses, w.reviews], [0, 0, 0]);
  } finally { channel.close(); }
});

test('unknown after restart is explicit and the interruption state reuses the existing provider read', async () => {
  const { w, channel, providers, control } = await world(false);
  try {
    const reads = w.lists;
    const state = await control.section();
    assert.deepEqual(state.p?.[KEY], { available: false, reason: 'Состояние текущего хода ещё не подтверждено', turnRef: null, state: 'unknown', pending: false, barrier: false, result: null });
    assert.equal(w.lists, reads);
    await channel.prompt(prompt());
    assert.equal((await control.section()).p?.[KEY]?.available, true);
    providers.get('alpha')!.listSessions = async () => { throw new Error('listing failed'); };
    await providers.section([PROJECT]);
    assert.equal((await control.section()).p?.[KEY]?.available, false);
    assert.match((await control.section()).p?.[KEY]?.reason ?? '', /прочитать/);
  } finally { channel.close(); }
});

test('provider rejection, unconfirmed proof and a wrong native id never produce a successful stop', async () => {
  for (const result of [{ status: 'unavailable', stopped: false, reason: 'Dialog' }, { status: 'interrupted', stopped: true, nativeTurnId: 'n1' }, confirmed('interrupted', 'other')] as InterruptResult[]) {
    const { w, channel, control, ref } = await world();
    w.result = result;
    try {
      await assert.rejects(control.interrupt('p', KEY, { turnRef: ref() }));
      assert.equal(channel.get(KEY)!.state, 'working');
      assert.equal(channel.interruption(KEY)!.barrier, true);
    } finally { channel.close(); }
  }
});

test('the interruption endpoint and state are registered through the channel routes', async () => {
  const { channel, control, ref } = await world();
  try {
    const router = createRouter();
    const state = createStateRegistry();
    registerChannelRoutes({ router, state, channel, interrupt: control.interrupt, interruptions: control.section });
    const route = router.match('POST', '/api/projects/p/sessions/alpha:s1/interrupt');
    assert.equal(route.kind, 'found');
    if (route.kind !== 'found') throw new Error('missing route');
    await route.handler({ params: route.params, body: { turnRef: ref() } } as never);
    assert.equal(((await state.collect()).channel as any).interruptions.p[KEY].state, 'waiting');
  } finally { channel.close(); }
});


test('interruptTurn capability requires explicit opt-in, legacy capabilities retain their default', async () => {
  const provider = createStubProvider({ id: 'alpha', title: 'Alpha', task: 'T002' });
  assert.deepEqual(await providerCapability(provider, 'interruptTurn'), { available: false });
  assert.deepEqual(await providerCapability(provider, 'reviewer'), { available: true });
});

test('a mandatory plan pause failure is not reported as overall success after a confirmed stop', async () => {
  const { channel, providers, ref } = await world();
  const control = createTurnInterruption({ channel, providers, projects: { get: async () => PROJECT }, autopilot: { interrupt: async () => { throw new Error('Kit pause failed'); } }, reviews: { interrupted: async () => undefined } });
  try {
    await assert.rejects(control.interrupt('p', KEY, { turnRef: ref() }), { status: 502, code: 'interrupt-failed' });
    assert.equal(channel.interruption(KEY)!.barrier, true);
    assert.equal(channel.get(KEY)!.state, 'waiting', 'the native stop is still confirmed');
    assert.equal(channel.interruption(KEY)!.result, 'failed');
  } finally { channel.close(); }
});

test('archiving during asynchronous validation refuses Stop before effects', async () => {
  const { channel, providers, provider, ref, w, control } = await world();
  const listed = gate<void>();
  const read = provider.listSessions;
  provider.listSessions = async (project) => { await listed.promise; return read(project); };
  try {
    const request = control.interrupt('p', KEY, { turnRef: ref() });
    await tick();
    w.archived = true;
    listed.open();
    await assert.rejects(request, { code: 'session-archived' });
    assert.deepEqual([w.calls, w.pauses, w.reviews], [0, 0, 0]);
  } finally { listed.open(); channel.close(); }
});

test('HTTP interruption errors preserve adapter timeout and hint while retaining failure, unavailable and stale contracts', async () => {
  const cases = [
    { error: new ProviderError('interrupt-timeout', 'Claude confirmation timed out', { status: 504, hint: 'Check the terminal, then retry.' }), status: 504, code: 'interrupt-timeout', hint: 'Check the terminal, then retry.' },
    { error: new ProviderError('interrupt-timeout', 'No confirmation'), status: 504, code: 'interrupt-timeout' },
    { error: new ProviderError('transport-failed', 'Disconnected', { status: 504 }), status: 502, code: 'interrupt-failed' },
    { error: new Error('Unexpected adapter error'), status: 502, code: 'interrupt-failed' },
    { error: Object.assign(new Error('Not a ProviderError'), { code: 'interrupt-timeout', status: 504 }), status: 502, code: 'interrupt-failed' },
    { result: { status: 'unavailable', stopped: false, reason: 'Dialog' } as InterruptResult, status: 409, code: 'interrupt-not-supported' },
    { result: { status: 'stale', stopped: false } as InterruptResult, status: 409, code: 'stale-turn' },
  ];
  for (const entry of cases) {
    const { w, channel, control, ref } = await world();
    if (entry.error) w.run = async () => { throw entry.error; };
    else w.result = entry.result!;
    const router = createRouter();
    registerChannelRoutes({ router, state: createStateRegistry(), channel, interrupt: control.interrupt });
    const server = createHttpServer({ router, staticMounts: [], getInterfaces: () => ({}) });
    try {
      const { port } = await server.listen(0);
      const origin = `http://127.0.0.1:${port}`;
      const expected = ref();
      channel.enqueue(KEY, 'preserved queue');
      const response = await fetch(`${origin}/api/projects/p/sessions/alpha%3As1/interrupt`, {
        method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ turnRef: expected }),
      });
      const body = await response.json() as { error: { code: string; message: string; hint?: string } };
      assert.equal(response.status, entry.status, body.error.message);
      assert.equal(body.error.code, entry.code);
      if (entry.hint) assert.equal(body.error.hint, entry.hint);
      if (entry.code === 'interrupt-timeout') assert.ok(body.error.hint, 'timeout without an adapter hint has a fallback');
      assert.equal(channel.interruption(KEY)!.barrier, true);
      assert.equal(channel.interruption(KEY)!.pending, false);
      assert.equal(channel.interruption(KEY)!.result, entry.code === 'stale-turn' ? 'stale' : 'failed');
      assert.equal(channel.get(KEY)!.state, 'working');
      assert.equal(ref(), expected);
      assert.equal(channel.queued(KEY)[0]!.text, 'preserved queue');
      if (entry.code === 'interrupt-timeout') {
        w.run = null;
        await control.interrupt('p', KEY, { turnRef: expected });
        assert.equal(w.calls, 2, 'settled adapter timeout permits an explicit retry');
        assert.equal(channel.get(KEY)!.state, 'waiting');
      }
    } finally { await server.close(); channel.close(); }
  }
});
