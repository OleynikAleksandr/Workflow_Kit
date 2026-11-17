// M40 T005 (contract section 3): the decision source of a turn is the user's delivered message
// that began the current generation. A continuation of the autopilot (Stop with a block), a
// reminder, a delivery with a review, a queued message, an old turn and a service message give
// no source.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { USER_MESSAGE_SOURCE, createAgentChannel, parseHookInput, sessionKey } from '../src/index.ts';
import type { AgentChannel, StopDecision } from '../src/index.ts';

const KEY = sessionKey('claude', 's-1');
const at = new Date('2026-11-17T10:00:00.000Z');
const prompt = (text: string, turn = 't-1') => parseHookInput('claude', { session_id: 's-1', hook_event_name: 'UserPromptSubmit', prompt: text, turn_id: turn, cwd: '/p' })!;
const stop = () => parseHookInput('claude', { session_id: 's-1', hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'done', cwd: '/p' })!;

function channel(decision: StopDecision = { kind: 'release' }): AgentChannel & { next: StopDecision } {
  const ch = createAgentChannel({ resolveProject: async () => ({ id: 'p1' }), now: () => at }) as AgentChannel & { next: StopDecision };
  ch.next = decision;
  ch.setDecider(async () => ch.next);
  return ch;
}

async function typed(ch: AgentChannel, text: string, turn = 't-1'): Promise<void> {
  (await ch.prompt(prompt(text, turn))).ack();
}

test('a typed prompt is the source of the turn it began, with its id, text and generation', async () => {
  const ch = channel();
  assert.equal(ch.userSource(KEY), null, 'a session the service has not seen');
  await typed(ch, 'Принимаю результат');
  const source = ch.userSource(KEY)!;
  assert.deepEqual([source.text, source.via, source.at], ['Принимаю результат', 'prompt', at.toISOString()]);
  assert.equal(source.turnRef, ch.interruption(KEY)!.turnRef);
  assert.match(source.id, /^[0-9a-f-]{36}$/u);
  assert.equal(ch.userSource(KEY)!.id, source.id, 'the same message while the turn goes on');
  // The next prompt is another message of another generation.
  (await ch.stop(stop())).ack();
  await typed(ch, 'Закрывай', 't-2');
  const next = ch.userSource(KEY)!;
  assert.notEqual(next.id, source.id);
  assert.notEqual(next.turnRef, source.turnRef);
  assert.equal(next.text, 'Закрывай');
});

test('an automatic continuation and a reminder end the source of the user turn', async () => {
  const ch = channel({ kind: 'continue', text: 'Workflow Kit: autopilot. Continue the workflow.' });
  await typed(ch, 'Принимаю результат');
  assert.ok(ch.userSource(KEY));
  const blocked = await ch.stop(stop());
  assert.ok(ch.userSource(KEY), 'the block is not accepted yet: the user turn is still the current one');
  blocked.ack();
  assert.equal(ch.interruption(KEY)!.origin, 'decider');
  assert.equal(ch.userSource(KEY), null, 'the continuation began a new generation');

  const reminded = channel({ kind: 'hold', reason: 'waiting-for-plan-decision', timeoutAnswer: 'Напоминание: ответьте на вопрос' });
  const short = createAgentChannel({ resolveProject: async () => ({ id: 'p1' }), now: () => at, holdMs: 0 });
  short.setDecider(async () => reminded.next);
  (await short.prompt(prompt('Да, принимаю'))).ack();
  (await short.stop(stop())).ack();
  assert.equal(short.interruption(KEY)!.origin, 'reminder');
  assert.equal(short.userSource(KEY), null);
});

test('a queued panel message is no source until it is delivered; delivered alone it is', async () => {
  const ch = channel();
  await typed(ch, 'Сделай задачу');
  const first = ch.userSource(KEY)!;
  // The user writes in the panel while the agent works: the message waits in the queue.
  const queued = ch.enqueue(KEY, 'Принимаю, закрывай', USER_MESSAGE_SOURCE, 'p1');
  assert.equal(ch.userSource(KEY)!.id, first.id, 'the current turn keeps its own source');
  assert.notEqual(ch.userSource(KEY)!.text, queued.text);
  const reply = await ch.stop(stop());
  assert.equal(ch.userSource(KEY)!.id, first.id, 'not delivered before the answer is accepted');
  reply.ack();
  const delivered = ch.userSource(KEY)!;
  assert.deepEqual([delivered.id, delivered.text, delivered.via], [queued.id, 'Принимаю, закрывай', 'panel']);
  assert.equal(ch.interruption(KEY)!.origin, 'delivery');

  // A refused answer keeps the message in the queue: no new generation, no source change.
  const refused = channel();
  await typed(refused, 'Сделай задачу');
  const before = refused.userSource(KEY)!;
  refused.enqueue(KEY, 'Принимаю', USER_MESSAGE_SOURCE, 'p1');
  (await refused.stop(stop())).nack();
  assert.equal(refused.userSource(KEY)!.id, before.id);
  assert.equal(refused.queued(KEY).length, 1);
});

test('a delivery with a review or a service message gives no source, even next to a user message', async () => {
  for (const sources of [['review'], ['panel'], [USER_MESSAGE_SOURCE, 'review'], ['reminder', USER_MESSAGE_SOURCE]]) {
    const ch = channel();
    await typed(ch, 'Сделай задачу');
    for (const source of sources) ch.enqueue(KEY, source === 'panel' ? 'Workflow Kit: the user accepted the result.' : `text of ${source}`, source, 'p1');
    (await ch.stop(stop())).ack();
    assert.equal(ch.interruption(KEY)!.origin, 'delivery');
    assert.equal(ch.userSource(KEY), null, sources.join('+'));
  }
});

test('a woken session reads the queue in its prompt answer: user messages alone are the source after the ack', async () => {
  const ch = channel();
  await typed(ch, 'Сделай задачу');
  (await ch.stop(stop())).ack();
  const queued = ch.enqueue(KEY, 'Принимаю результат', USER_MESSAGE_SOURCE, 'p1');
  await ch.automaticWake(KEY, async () => true);
  const reply = await ch.prompt(prompt('Workflow Kit: a message waits.', 't-2'));
  assert.equal(ch.userSource(KEY), null, 'the answer is not accepted yet');
  reply.ack();
  assert.equal(ch.userSource(KEY)?.id, queued.id);

  const review = channel();
  await typed(review, 'Сделай задачу');
  (await review.stop(stop())).ack();
  review.enqueue(KEY, 'REVIEW: замечания', 'review', 'p1');
  await review.automaticWake(KEY, async () => true);
  (await review.prompt(prompt('Workflow Kit: a message waits.', 't-2'))).ack();
  assert.equal(review.userSource(KEY), null);
});

test('several user messages of one delivery and panel messages that waited for a typed prompt join the words', async () => {
  const ch = channel();
  await typed(ch, 'Сделай задачу');
  ch.enqueue(KEY, 'Принимаю результат', USER_MESSAGE_SOURCE, 'p1');
  const last = ch.enqueue(KEY, 'И закрывай план', USER_MESSAGE_SOURCE, 'p1');
  (await ch.stop(stop())).ack();
  assert.deepEqual([ch.userSource(KEY)!.id, ch.userSource(KEY)!.text], [last.id, 'Принимаю результат\n\nИ закрывай план']);
  // The user wrote in the panel, then typed in the provider's app: both are the words of this turn.
  const both = channel();
  both.enqueue(KEY, 'Принимаю результат', USER_MESSAGE_SOURCE, 'p1');
  both.enqueue(KEY, 'Workflow Kit: the review is finished.', 'panel', 'p1');
  const reply = await both.prompt(prompt('Ну что там?'));
  assert.equal(both.userSource(KEY)!.text, 'Ну что там?', 'the queue is not delivered before the answer is accepted');
  reply.ack();
  const source = both.userSource(KEY)!;
  assert.deepEqual([source.text, source.via], ['Ну что там?\n\nПринимаю результат', 'prompt']);
});

test('a panel message given directly is the source of its turn; an unknown turn has none', async () => {
  const ch = channel();
  assert.equal(await ch.directTurn(KEY, 'p1', 'Закрывай план', async () => true), true);
  const source = ch.userSource(KEY)!;
  assert.deepEqual([source.text, source.via], ['Закрывай план', 'panel']);
  // A refused direct send begins nothing.
  const refused = channel();
  assert.equal(await refused.directTurn(KEY, 'p1', 'Закрывай план', async () => false), false);
  assert.equal(refused.userSource(KEY), null);
  // A Stop of a turn the service did not see begin (after a restart): unknown origin, no source.
  const restarted = channel();
  (await restarted.stop(stop())).ack();
  assert.equal(restarted.userSource(KEY), null);
  ch.forget(KEY);
  assert.equal(ch.userSource(KEY), null);
});
