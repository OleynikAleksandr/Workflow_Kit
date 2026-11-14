// M29 3.1: a session the service can wake is never held by its Stop hook.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { USER_MESSAGE_SOURCE, createAgentChannel, parseHookInput } from '../src/index.ts';
import type { HookInput, SessionRef, StopContext, StopDecision } from '../src/index.ts';

const SID = 'cd718965-ec3f-44fe-93e8-33d1c6848a88';
const KEY = `claude:${SID}`;
const stop = (over: Partial<HookInput> = {}): HookInput => ({
  ...parseHookInput('claude', { session_id: SID, cwd: '/home/u/Projects/demo', hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'Жду кнопку' })!,
  panelProcess: true, ...over,
});
const prompt = (text: string): HookInput => ({
  ...parseHookInput('claude', { session_id: SID, cwd: '/home/u/Projects/demo', hook_event_name: 'UserPromptSubmit', prompt: text })!,
  panelProcess: true,
});
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function world(decide: (context: StopContext) => StopDecision, opts: { supports?: boolean; holdMs?: number } = {}) {
  const woken: SessionRef[] = []; const contexts: StopContext[] = [];
  const ch = createAgentChannel({
    resolveProject: async () => ({ id: 'p1' }),
    decide: (context) => { contexts.push(context); return decide(context); },
    holdMs: opts.holdMs ?? 5_000,
    release: { supports: () => opts.supports ?? true, wake: (ref) => woken.push(ref) },
  });
  return { ch, woken, contexts };
}

test('a hold of a releasable session ends the Stop hook at once and keeps the reason', async () => {
  const { ch, woken } = world(() => ({ kind: 'hold', reason: 'waiting-for-plan-start' }));
  const started = Date.now();
  const reply = await ch.stop(stop());
  assert.ok(Date.now() - started < 1000, 'the hook is not held');
  assert.equal(reply.answer, null);
  const activity = ch.get(KEY)!;
  assert.equal(activity.state, 'holding');
  assert.equal(activity.holdReason, 'waiting-for-plan-start');
  assert.ok(activity.holdUntil);
  assert.deepEqual(woken, []);
});

test('a queued message wakes the released session; its prompt hook takes the queue', async () => {
  const { ch, woken } = world(() => ({ kind: 'hold', reason: 'waiting-for-plan-decision' }));
  await ch.stop(stop());
  ch.enqueue(KEY, 'Workflow Kit: пользователь выбрал план', 'panel', 'p1');
  assert.equal(woken.length, 1);
  assert.equal(woken[0]!.key, KEY);
  await ch.automaticWake(KEY, async () => true);
  const reply = await ch.prompt(prompt('Workflow Kit: wake'));
  assert.match(JSON.stringify(reply.answer), /пользователь выбрал план/);
  reply.ack();
  assert.equal(ch.get(KEY)!.state, 'working');
  assert.equal(ch.get(KEY)!.holdReason, null);
});

test('wake asks the decider again: continue is queued and the session woken', async () => {
  let ready = false;
  const { ch, woken, contexts } = world(() => (ready ? { kind: 'continue', text: 'Workflow Kit: начни T001' } : { kind: 'hold', reason: 'waiting-for-plan-start' }));
  await ch.stop(stop());
  ready = true;
  ch.wake(KEY);
  await tick();
  assert.equal(contexts.at(-1)!.woken, true);
  assert.equal(contexts.at(-1)!.lastAssistantMessage, 'Жду кнопку');
  assert.equal(woken.length, 1);
  assert.equal(ch.get(KEY)!.state, 'waiting');
  assert.equal(ch.get(KEY)!.pending, 1);
  assert.deepEqual(ch.get(KEY)!.queued, [], 'service text is not shown as a user bubble');
});

test('wake with a hold keeps the deadline; release ends the hold without a wake', async () => {
  let next: StopDecision = { kind: 'hold', reason: 'a' };
  const { ch, woken } = world(() => next);
  await ch.stop(stop());
  const until = ch.get(KEY)!.holdUntil;
  next = { kind: 'hold', reason: 'b' };
  ch.wake(KEY); await tick();
  assert.equal(ch.get(KEY)!.holdReason, 'b');
  assert.equal(ch.get(KEY)!.holdUntil, until);
  next = { kind: 'release' };
  ch.wake(KEY); await tick();
  assert.equal(ch.get(KEY)!.state, 'waiting');
  assert.deepEqual(woken, []);
});

test('at the hold time a timeoutAnswer is queued as reminder and wakes; without it the hold just ends', async () => {
  const a = world(() => ({ kind: 'hold', reason: 'waiting-for-review', timeoutAnswer: 'Workflow Kit: ревью идёт' }), { holdMs: 20 });
  await a.ch.stop(stop());
  await tick(60);
  assert.equal(a.ch.get(KEY)!.state, 'waiting');
  assert.equal(a.ch.get(KEY)!.pending, 1);
  assert.equal(a.woken.length, 1);
  const b = world(() => ({ kind: 'hold', reason: 'waiting-for-plan-start' }), { holdMs: 20 });
  await b.ch.stop(stop());
  await tick(60);
  assert.equal(b.ch.get(KEY)!.state, 'waiting');
  assert.equal(b.ch.get(KEY)!.holdReason, null);
  assert.equal(b.woken.length, 0);
});

test('a user prompt ends the released hold and its timer', async () => {
  const { ch, woken } = world(() => ({ kind: 'hold', reason: 'waiting-for-plan-start', timeoutAnswer: 'напоминание' }), { holdMs: 30 });
  await ch.stop(stop());
  (await ch.prompt(prompt('вопрос из Desktop'))).ack();
  assert.equal(ch.get(KEY)!.state, 'working');
  assert.equal(ch.get(KEY)!.holdReason, null);
  await tick(70);
  assert.equal(ch.get(KEY)!.pending, 0, 'no reminder after the user took the turn');
  assert.deepEqual(woken, []);
});

test('under a Stop barrier nothing is woken; the user message releases it as before', async () => {
  const { ch, woken } = world(() => ({ kind: 'hold', reason: 'waiting-for-plan-start' }));
  await ch.stop(stop());
  ch.suspend(KEY, 'p1');
  assert.equal(ch.get(KEY)!.state, 'waiting');
  ch.enqueue(KEY, 'autopilot', 'autopilot', 'p1');
  ch.wake(KEY); await tick();
  assert.deepEqual(woken, []);
  ch.enqueue(KEY, 'моё сообщение', USER_MESSAGE_SOURCE, 'p1');
  assert.deepEqual(woken, []);
});

test('without release support the Stop hook is held as before', async () => {
  const { ch } = world(() => ({ kind: 'hold', reason: 'waiting-for-plan-start' }), { supports: false });
  let answered = false;
  const pending = ch.stop(stop()).then((reply) => { answered = true; return reply; });
  await tick(30);
  assert.equal(answered, false);
  assert.equal(ch.get(KEY)!.state, 'holding');
  ch.enqueue(KEY, 'Workflow Kit: старт', 'panel', 'p1');
  const reply = await pending;
  assert.match(JSON.stringify(reply.answer), /старт/);
});

test('a session outside any project is never released', async () => {
  const woken: SessionRef[] = [];
  const ch = createAgentChannel({
    resolveProject: async () => undefined,
    decide: () => ({ kind: 'hold', reason: 'x' }),
    holdMs: 30,
    release: { supports: () => true, wake: (ref) => woken.push(ref) },
  });
  const started = Date.now();
  await ch.stop(stop());
  assert.ok(Date.now() - started >= 25, 'held until the hold time');
});
