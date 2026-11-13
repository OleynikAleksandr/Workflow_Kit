import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgentChannel, parseHookInput } from '../src/index.ts';
import type { StopDecision } from '../src/index.ts';
import { world, gate, until, pause, prompt as kimiPrompt, KEY } from './detached-world.ts';

const key = 'codex:s';
const hook = (text = 'hello', native: string | null = 'n1') => parseHookInput('codex', { session_id: 's', cwd: '/p', prompt: text, turn_id: native })!;
const channel = (decide: () => StopDecision | Promise<StopDecision> = () => ({ kind: 'release' })) => createAgentChannel({ resolveProject: async () => ({ id: 'p' }), decide });

test('prompt generations are unique, duplicate hooks are stable, and retired native Stop is ignored', async () => {
  const ch = channel();
  try {
    await ch.prompt(hook());
    const first = ch.interruption(key)!.turnRef;
    await ch.prompt(hook());
    assert.equal(ch.interruption(key)!.turnRef, first);
    await ch.prompt(hook('next', 'n2'));
    const second = ch.interruption(key)!.turnRef;
    assert.notEqual(second, first);
    await ch.stop(hook('old', 'n1'));
    assert.equal(ch.get(key)!.state, 'working');
    assert.equal(ch.interruption(key)!.turnRef, second);
  } finally { ch.close(); }
});

test('block generation starts on ack, nack restores queue, repeated ack is idempotent', async () => {
  const ch = channel();
  try {
    await ch.prompt(hook());
    const first = ch.interruption(key)!.turnRef;
    ch.enqueue(key, 'queued');
    const refused = await ch.stop(hook());
    assert.equal(ch.interruption(key)!.turnRef, first);
    refused.nack();
    assert.equal(ch.queued(key)[0]!.text, 'queued');
    const delivered = await ch.stop(hook());
    delivered.ack();
    const next = ch.interruption(key)!.turnRef;
    delivered.ack();
    assert.notEqual(next, first);
    assert.equal(ch.interruption(key)!.turnRef, next);
    await ch.prompt(hook('queued', 'n2'));
    assert.equal(ch.interruption(key)!.turnRef, next, 'echo attaches native id to the accepted block');
  } finally { ch.close(); }
});

test('an early direct prompt proves acceptance despite RPC failure; late echo does not start another generation', async () => {
  const ch = channel();
  try {
    await ch.prompt(hook());
    assert.equal(await ch.directTurn(key, 'p', 'direct', async () => {
      await ch.prompt(hook('direct', 'n2'));
      throw new Error('connection lost after acceptance');
    }), true);
    const accepted = ch.interruption(key)!.turnRef;
    await ch.prompt(hook('direct', 'n2'));
    assert.equal(ch.interruption(key)!.turnRef, accepted);
    assert.equal(ch.interruption(key)!.nativeTurnId, 'n2');
    ch.suspend(key);
    assert.equal(ch.confirmInterrupted(key, accepted!, 'n2'), true);
    await ch.prompt(hook('direct', 'n2'));
    assert.equal(ch.get(key)!.state, 'waiting');
  } finally { ch.close(); }
});

test('suspend invalidates an awaiting decider and releases a held Stop without draining messages', async () => {
  const decision = gate<StopDecision>();
  const ch = channel(() => decision.promise);
  try {
    await ch.prompt(hook());
    const stopping = ch.stop(hook());
    await pause(0);
    ch.suspend(key);
    ch.enqueue(key, 'keep');
    decision.open({ kind: 'continue', text: 'must not run' });
    assert.equal((await stopping).answer, null);
    assert.equal(ch.queued(key).length, 1);
  } finally { ch.close(); }
  const held = channel(() => ({ kind: 'hold', reason: 'user' }));
  try {
    await held.prompt(hook());
    const stopping = held.stop(hook());
    await until(() => held.get(key)?.state === 'holding', 'held');
    held.suspend(key);
    assert.equal((await stopping).answer, null);
    assert.equal(held.get(key)!.state, 'waiting');
  } finally { held.close(); }
});

test('an automatic wake accepted before Stop cannot release its barrier or take the queue', async () => {
  const ch = channel();
  try {
    ch.enqueue(key, 'keep', 'review', 'p');
    await ch.automaticWake(key, async () => true);
    ch.suspend(key);
    const reply = await ch.prompt(hook('wake', 'n1'));
    assert.equal(reply.answer, null);
    assert.equal(ch.interruption(key)!.barrier, true);
    assert.equal(ch.queued(key).length, 1);
    await ch.prompt(hook('explicit user', 'n2'));
    assert.equal(ch.interruption(key)!.barrier, false);
    assert.equal(ch.queued(key).length, 0);
  } finally { ch.close(); }
});

test('detached retry/maintain preserve the message and delivery id across a barrier', async () => {
  const w = world();
  try {
    await w.ch.prompt(kimiPrompt('user'));
    await w.end('Interrupt');
    w.idle = true;
    w.accept = false;
    w.ch.enqueue(KEY, 'keep');
    await until(() => w.sent.length === 1, 'first refused send');
    w.ch.suspend(KEY);
    w.accept = true;
    await w.ch.maintain();
    w.ch.wake(KEY);
    await pause(10);
    assert.equal(w.sent.length, 1);
    assert.equal(w.ch.get(KEY)!.pending, 1);
    w.ch.resumeDelivery(KEY);
    await w.ch.maintain();
    assert.equal(w.sent.length, 2);
    assert.equal(w.sent[0]!.id, w.sent[1]!.id);
    const ref = w.ch.interruption(KEY)!.turnRef;
    await w.ch.prompt(kimiPrompt('keep'));
    assert.equal(w.ch.interruption(KEY)!.turnRef, ref);
    assert.equal(w.ch.get(KEY)!.pending, 0);
  } finally { w.ch.close(); }
});

test('detached accepted prompt arriving after suspend still confirms delivery without releasing the barrier', async () => {
  const w = world();
  const accepted = gate<boolean>();
  try {
    await w.ch.prompt(kimiPrompt('user'));
    await w.end('Interrupt');
    w.idle = true;
    w.accept = accepted.promise;
    w.ch.enqueue(KEY, 'sent once');
    await until(() => w.sent.length === 1, 'send entered');
    w.ch.suspend(KEY);
    await w.ch.prompt(kimiPrompt('sent once'));
    assert.equal(w.ch.interruption(KEY)!.barrier, true);
    assert.equal(w.ch.get(KEY)!.pending, 0);
    accepted.open(true);
    await pause(0);
    await w.ch.maintain();
    assert.equal(w.sent.length, 1);
  } finally { accepted.open(false); w.ch.close(); }
});
