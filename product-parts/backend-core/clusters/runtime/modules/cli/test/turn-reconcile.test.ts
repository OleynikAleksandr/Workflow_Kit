// M28: a Claude turn interrupted without a Stop hook ends in the channel; its queue goes at once.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgentChannel, parseHookInput, USER_MESSAGE_SOURCE } from '#agent-channel';
import { createStubProvider } from '#provider-registry';
import type { Project, Provider, ProviderTurnState } from '#provider-registry';
import { reconcileTurns, TURN_SETTLE_MS } from '../src/session-wiring.ts';

const PROJECT = { id: 'p', name: 'Test', path: '/fixture', source: 'opened', createdAt: '2026-11-14' } as Project;
const KEY = 'alpha:s1';
const prompt = () => parseHookInput('alpha', { session_id: 's1', cwd: '/fixture', prompt: 'hello' })!;

async function world() {
  let turn: ProviderTurnState | null = null; let now = Date.now(); const woken: string[] = [];
  const provider: Provider = { ...createStubProvider({ id: 'alpha', title: 'Alpha', task: 'T004' }), turnState: async () => turn };
  const channel = createAgentChannel({ resolveProject: async () => ({ id: 'p' }) });
  (await channel.prompt(prompt())).ack();
  const run = () => reconcileTurns({ channel, providers: { get: (id: string) => id === 'alpha' ? provider : undefined }, projects: { get: async () => PROJECT }, wake: (k) => woken.push(k), now: () => now });
  return { channel, woken, run, set: (t: ProviderTurnState | null) => { turn = t; }, advance: (ms: number) => { now += ms; }, now: () => now };
}

/** An interruption 10 ms after the channel's turn start; the test clock starts after it (slow CI). */
function afterStart(w: Awaited<ReturnType<typeof world>>): number {
  const at = Date.parse(w.channel.get(KEY)!.turnStartedAt!) + 10;
  if (w.now() < at) w.advance(at - w.now());
  return at;
}
test('an interruption without a Stop hook ends the turn without a barrier and wakes the queue', async () => {
  const w = await world();
  assert.equal(w.channel.get(KEY)?.state, 'working');
  w.channel.enqueue(KEY, 'queued during the turn', 'panel', 'p');
  w.set({ state: 'idle', at: afterStart(w), source: 'interrupt' });
  await w.run(); assert.equal(w.channel.get(KEY)?.state, 'working', 'not before the settle time');
  w.advance(TURN_SETTLE_MS + 20); await w.run();
  assert.equal(w.channel.get(KEY)?.state, 'waiting');
  assert.equal(w.channel.interruption(KEY)?.barrier, false);
  assert.deepEqual(w.woken, [KEY]);
});
test('an older idle, a working state or no provider state keep the turn', async () => {
  for (const turn of [null, { state: 'working', at: Date.now() + 5, source: 'hook' }, { state: 'idle', at: Date.now() - 60_000, source: 'hook' }] as const) {
    const w = await world(); w.set(turn as ProviderTurnState | null); w.advance(TURN_SETTLE_MS * 4); await w.run();
    assert.equal(w.channel.get(KEY)?.state, 'working'); assert.deepEqual(w.woken, []);
  }
});
test('a lost Stop hook (hook idle newer than the turn) ends it too; an empty queue wakes nothing', async () => {
  const w = await world(); w.set({ state: 'idle', at: afterStart(w), source: 'hook' }); w.advance(TURN_SETTLE_MS + 50); await w.run();
  assert.equal(w.channel.get(KEY)?.state, 'waiting'); assert.deepEqual(w.woken, []);
});
test('M28 T010: an unconfirmed Stop (barrier) still ends the interrupted turn; only the user queue is delivered', async () => {
  const w = await world();
  w.channel.enqueue(KEY, 'queued during the turn', USER_MESSAGE_SOURCE, 'p');
  const ref = w.channel.interruption(KEY)!.turnRef!;
  w.channel.suspend(KEY, 'p'); w.channel.interruptionPending(KEY, ref, true); w.channel.interruptionPending(KEY, ref, false, 'failed');
  assert.equal(w.channel.interruption(KEY)?.barrier, true);
  w.set({ state: 'idle', at: afterStart(w), source: 'interrupt' }); w.advance(TURN_SETTLE_MS + 20); await w.run();
  assert.equal(w.channel.get(KEY)?.state, 'waiting', 'the barrier no longer keeps working');
  assert.equal(w.channel.interruption(KEY)?.barrier, false, 'the user message released it');
  assert.deepEqual(w.woken, [KEY]);
});
test('M28 T010: under a barrier a service message stays held; a Stop still in flight keeps the turn', async () => {
  const w = await world();
  w.channel.enqueue(KEY, 'autopilot continue', 'autopilot', 'p');
  const ref = w.channel.interruption(KEY)!.turnRef!;
  w.channel.suspend(KEY, 'p'); w.channel.interruptionPending(KEY, ref, true);
  w.set({ state: 'idle', at: afterStart(w), source: 'interrupt' }); w.advance(TURN_SETTLE_MS + 20); await w.run();
  assert.equal(w.channel.get(KEY)?.state, 'working', 'the Stop in flight decides');
  w.channel.interruptionPending(KEY, ref, false, 'failed'); await w.run();
  assert.equal(w.channel.get(KEY)?.state, 'waiting');
  assert.equal(w.channel.interruption(KEY)?.barrier, true, 'automatic continuation stays held');
  assert.deepEqual(w.woken, []);
});
