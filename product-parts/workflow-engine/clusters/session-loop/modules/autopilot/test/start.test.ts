// The plan start under way (spec M11): steps, problems and the repeated start, with a channel
// whose delivery the test controls, and with the real channel fed with Claude hook inputs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgentChannel, parseHookInput } from '#agent-channel';
import type { AgentChannel, HookReply, SessionActivity } from '#agent-channel';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { START_DELIVERY_MS, START_SLOW_MS, createAutopilot } from '../src/index.ts';

const KEY = 'claude:s1';

/** Kit as the autopilot reads it: a plan in a phase the test sets. */
function fakeKit(phase: { value: string }) {
  const view = () => ({ plan: { phase: phase.value, ownerSession: 's1' } });
  const runner = {
    installed: () => true,
    run: async (_root: string, args: string[]) =>
      args[0] === 'autopilot:status' ? { ok: true, result: { head: 'h', revision: 1, proposalPending: false } } : { ok: true, result: {} },
  } as unknown as KitRunner;
  const workflow = {
    get: () => view(),
    refresh: async () => view(),
    status: () => ({ execution: { strategy: 'sequential', ownerSession: 's1' } }),
  } as unknown as WorkflowState;
  return { runner, workflow };
}

/** A channel whose delivery and activity note the test sets. */
function fakeChannel() {
  const fake = {
    sent: [] as string[],
    flushed: 0,
    waiting: true,
    note: null as string | null,
  };
  const channel = {
    list: () => [],
    enqueue: (_key: string, text: string) => ({ id: `m${fake.sent.push(text)}` }),
    waiting: () => fake.waiting,
    get: () => ({ note: fake.note }) as SessionActivity,
    flush: async () => void (fake.flushed += 1),
  } as unknown as AgentChannel;
  return { fake, channel };
}

test('a start goes from sending to delivered and slow, and is gone once Kit records the work', async () => {
  const phase = { value: 'ready' };
  const { runner, workflow } = fakeKit(phase);
  const { fake, channel } = fakeChannel();
  let clock = Date.parse('2026-11-10T10:00:00Z');
  const autopilot = createAutopilot({ runner, workflow, channel, projectPath: async () => '/p', now: () => new Date(clock) });

  assert.deepEqual(await autopilot.start('p', KEY), { owner: KEY });
  assert.equal(fake.sent.length, 1);
  assert.match(fake.sent[0]!, /the user started the plan/);
  assert.deepEqual(autopilot.get(KEY)?.start, { at: '2026-11-10T10:00:00.000Z', messageId: 'm1', step: 'sending', slow: false, problem: null });

  fake.waiting = false;
  clock += 10_000;
  assert.equal(autopilot.get(KEY)?.start?.step, 'delivered');
  clock += START_SLOW_MS;
  assert.equal(autopilot.get(KEY)?.start?.slow, true, 'a long preparation is a hint');
  assert.equal(autopilot.get(KEY)?.start?.problem, null);

  phase.value = 'running';
  assert.equal(autopilot.get(KEY)?.start, null, 'Kit recorded the started work');
  assert.deepEqual(autopilot.section().sessions.map((s) => s.start), [null]);
});

test('a repeated start while a start runs sends nothing again', async () => {
  const { runner, workflow } = fakeKit({ value: 'ready' });
  const { fake, channel } = fakeChannel();
  const autopilot = createAutopilot({ runner, workflow, channel, projectPath: async () => '/p' });
  await autopilot.start('p', KEY);
  assert.deepEqual(await autopilot.start('p', KEY), { owner: KEY, already: true });
  fake.waiting = false;
  assert.deepEqual(await autopilot.start('p', KEY), { owner: KEY, already: true });
  assert.equal(fake.sent.length, 1);
});

test('a start not delivered in time is a problem; the next start retries the same message', async () => {
  const { runner, workflow } = fakeKit({ value: 'ready' });
  const { fake, channel } = fakeChannel();
  let clock = Date.parse('2026-11-10T10:00:00Z');
  const autopilot = createAutopilot({ runner, workflow, channel, projectPath: async () => '/p', now: () => new Date(clock) });
  await autopilot.start('p', KEY);
  clock += START_DELIVERY_MS - 1;
  assert.equal(autopilot.get(KEY)?.start?.problem, null);
  clock += 1;
  assert.deepEqual(autopilot.get(KEY)?.start?.problem, {
    code: 'not-delivered',
    text: 'Агент не получил команду запуска. Проверьте, что сессия открыта, и начните заново.',
  });

  assert.deepEqual(await autopilot.start('p', KEY), { owner: KEY });
  assert.equal(fake.sent.length, 1, 'the waiting message is not queued twice');
  assert.equal(fake.flushed, 1, 'the channel sends it again');
  const start = autopilot.get(KEY)?.start;
  assert.equal(start?.problem, null);
  assert.equal(start?.at, new Date(clock).toISOString(), 'the wait starts anew');
});

test('a message the channel could not deliver is a problem at once, with its reason', async () => {
  const { runner, workflow } = fakeKit({ value: 'ready' });
  const { fake, channel } = fakeChannel();
  const autopilot = createAutopilot({ runner, workflow, channel, projectPath: async () => '/p' });
  await autopilot.start('p', KEY);
  fake.note = 'сообщение не доставлено: сервер Kimi не ответил';
  assert.deepEqual(autopilot.get(KEY)?.start?.problem, {
    code: 'not-delivered',
    text: 'Агент не получил команду запуска: сервер Kimi не ответил. Проверьте, что сессия открыта, и начните заново.',
  });
});

test('a turn begun by the start that ends without started work holds the Stop; the next start sends anew', async () => {
  const { runner, workflow } = fakeKit({ value: 'ready' });
  const channel = createAgentChannel({ resolveProject: async () => ({ id: 'p' }), holdMs: 20_000 });
  const autopilot = createAutopilot({ runner, workflow, channel, projectPath: async () => '/p' });
  channel.setDecider((context) => autopilot.decide(context));
  const stop = () => channel.stop(parseHookInput('claude', { session_id: 's1', cwd: '/p', hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'ok' })!);
  const settle = async (promise: Promise<HookReply>) => {
    const reply = await promise;
    reply.ack();
    return (reply.answer as { reason?: string } | null)?.reason ?? null;
  };
  const holding = async (reason: string) => {
    for (let i = 0; i < 300 && channel.get(KEY)?.holdReason !== reason; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(channel.get(KEY)?.holdReason, reason);
  };
  try {
    // The button is pressed while the agent works: the message waits for its Stop.
    await autopilot.start('p', KEY);
    assert.equal(autopilot.get(KEY)?.start?.step, 'sending');
    assert.match((await settle(stop())) ?? '', /the user started the plan/);
    assert.equal(autopilot.get(KEY)?.start?.step, 'delivered');

    // The agent ends that turn without task:start.
    const held = stop();
    await holding('waiting-for-plan-start');
    assert.deepEqual(autopilot.get(KEY)?.start?.problem, {
      code: 'turn-ended',
      text: 'Агент закончил ход, не начав первую задачу. Посмотрите его ответ в чате и начните заново.',
    });
    assert.equal(autopilot.get(KEY)?.enabled, false, 'the autopilot does not go on by itself');

    // «Начать заново»: a new message.
    assert.deepEqual(await autopilot.start('p', KEY), { owner: KEY });
    assert.match((await settle(held)) ?? '', /the user started the plan/);
    assert.equal(autopilot.get(KEY)?.start?.problem, null);
  } finally {
    channel.close();
  }
});
