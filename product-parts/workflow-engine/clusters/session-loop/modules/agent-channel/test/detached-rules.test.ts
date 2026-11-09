// Turn end without holding Stop (spec M8 section 3): lockless sessions, idle listeners, the
// events that are not an answer, holds, archived sessions and prompts of the user.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KEY, pause, prompt, until, world } from './detached-world.ts';

test('a Stop without a live session lock marks the session lockless until a Stop comes with one', async () => {
  const w = world(() => ({ kind: 'continue', text: 'продолжай' }));
  await w.ch.prompt(prompt('задача'));
  w.idle = true;
  await w.end();
  const activity = w.ch.get(KEY)!;
  assert.equal(activity.state, 'waiting');
  assert.equal(activity.note, 'Kimi запущен без замков сессий (`KIMI_CODE_SESSION_LOCK`): автопилот, ревью и сообщения панели для этой сессии выключены');
  w.ch.enqueue(KEY, 'сообщение панели');
  w.ch.wake(KEY);
  await w.ch.flush(KEY);
  await w.ch.maintain();
  await pause(30);
  assert.deepEqual([w.sent.length, w.events.length, w.asked.length], [0, 0, 0]);
  // The user's own prompt still carries the queue, and the note stays.
  const reply = await w.ch.prompt(prompt('вопрос'));
  assert.deepEqual(reply.answer, { message: 'сообщение панели' });
  reply.ack();
  assert.match(w.ch.get(KEY)!.note!, /без замков/);
  w.idle = false;
  await w.end();
  assert.equal(w.ch.get(KEY)!.note, null);
  w.idle = true;
  await until(() => w.sent.length === 1, 'the decider continues once the lock lives');
  assert.deepEqual([w.events.length, w.sent[0]!.text], [1, 'продолжай']);
  w.ch.close();
});

test('idle listeners are awaited before the answer is read and the next message is sent', async () => {
  const w = world();
  w.ch.onIdle(async (key) => {
    await pause(10);
    w.order.push(`idle ${key}`);
  });
  await w.ch.prompt(prompt('задача'));
  w.ch.enqueue(KEY, 'сообщение панели');
  await w.end();
  w.idle = true;
  await until(() => w.sent.length === 1, 'the message is sent');
  assert.deepEqual(w.order, [`idle ${KEY}`, 'answer', 'send']);
  w.ch.close();
});

test('StopFailure and Interrupt do not continue the autopilot; the next Stop does', async () => {
  const w = world(() => ({ kind: 'continue', text: 'бери следующую задачу' }));
  for (const event of ['StopFailure', 'Interrupt'] as const) {
    await w.ch.prompt(prompt('задача'));
    assert.equal(await w.end(event), true);
    w.idle = true;
    await pause(30);
    assert.deepEqual([w.ch.get(KEY)!.state, w.events.length, w.asked.length, w.sent.length], ['waiting', 0, 0, 0]);
    w.idle = false;
  }
  await w.ch.prompt(prompt('задача'));
  await w.end();
  w.idle = true;
  await until(() => w.sent.length === 1, 'the decider text is sent');
  assert.deepEqual([w.asked[0]!.lastAssistantMessage, w.asked[0]!.woken, w.sent[0]!.text], ['ответ агента', false, 'бери следующую задачу']);
  w.idle = false;
  assert.equal((await w.ch.prompt(prompt('бери следующую задачу'))).own, true);
  await w.end();
  w.idle = true;
  await until(() => w.events.length === 2, 'the decider turn ends');
  assert.equal(w.events[1]!.origin, 'decider');
  w.ch.close();
});

test('a hold lasts until a wake or a new message; a hold with timeoutAnswer sends the reminder', async () => {
  const held = world((_context, calls) => (calls === 1 ? { kind: 'hold', reason: 'waiting-for-mode-choice' } : { kind: 'continue', text: 'путь выбран' }));
  await held.ch.prompt(prompt('задача'));
  await held.end();
  held.idle = true;
  await until(() => held.ch.get(KEY)!.state === 'holding', 'the slot is held');
  assert.deepEqual([held.ch.get(KEY)!.holdReason, held.ch.get(KEY)!.holdUntil, held.sent.length], ['waiting-for-mode-choice', null, 0]);
  await held.ch.flush(KEY);
  await held.ch.maintain();
  assert.equal(held.asked.length, 1, 'only a wake asks the decider again');
  held.ch.wake(KEY);
  await until(() => held.sent.length === 1, 'the wake continues');
  assert.deepEqual([held.asked[1]!.woken, held.sent[0]!.text], [true, 'путь выбран']);
  held.ch.close();

  const queued = world(() => ({ kind: 'hold', reason: 'waiting' }));
  await queued.ch.prompt(prompt('задача'));
  await queued.end();
  queued.idle = true;
  await until(() => queued.ch.get(KEY)!.state === 'holding', 'the slot is held');
  queued.ch.enqueue(KEY, 'ответ пользователя');
  await until(() => queued.sent.length === 1, 'a new message ends the hold');
  assert.deepEqual([queued.sent[0]!.text, queued.asked.length], ['ответ пользователя', 1]);
  queued.ch.close();

  const reminded = world(() => ({ kind: 'hold', reason: 'waiting', timeoutAnswer: 'напоминание' }), { holdMs: 30 });
  await reminded.ch.prompt(prompt('задача'));
  await reminded.end();
  reminded.idle = true;
  await until(() => reminded.ch.get(KEY)!.state === 'holding', 'the slot is held');
  assert.notEqual(reminded.ch.get(KEY)!.holdUntil, null);
  await until(() => reminded.sent.length === 1, 'the reminder is sent');
  assert.equal(reminded.sent[0]!.text, 'напоминание');
  reminded.idle = false;
  await reminded.ch.prompt(prompt('напоминание'));
  await reminded.end();
  reminded.idle = true;
  await until(() => reminded.events.length === 2, 'the reminder turn ends');
  assert.equal(reminded.events[1]!.origin, 'reminder');
  reminded.ch.close();
});

test('a session archived in the panel gets no message', async () => {
  const w = world(() => ({ kind: 'continue', text: 'продолжай' }));
  w.archived = true;
  await w.ch.prompt(prompt('задача'));
  w.ch.enqueue(KEY, 'сообщение панели');
  await w.end();
  w.idle = true;
  await until(() => w.events.length === 1, 'the turn end is still heard');
  await w.ch.flush(KEY);
  await w.ch.maintain();
  assert.deepEqual([w.sent.length, w.asked.length, w.ch.queued(KEY).length], [0, 0, 1]);
  w.archived = false;
  await w.ch.flush(KEY);
  assert.equal(w.sent.length, 1);
  w.ch.close();
});

test('an accepted prompt without its hook leaves a note and is not sent again', async () => {
  const w = world(undefined, { confirmMs: 20 });
  w.idle = true;
  w.ch.enqueue(KEY, 'сообщение панели', 'panel', 'p1');
  await until(() => w.ch.get(KEY)!.note !== null, 'the note appears');
  assert.equal(w.ch.get(KEY)!.note, 'хук Kit не работает в Kimi (перезапустите Kimi Code)');
  await w.ch.maintain();
  assert.deepEqual([w.sent.length, w.ch.get(KEY)!.state], [1, 'working']);
  w.ch.close();
});

test('a user prompt takes an unsent delivery as the hook answer and drops an unsent decider text', async () => {
  const w = world();
  w.idle = true;
  w.accept = false;
  w.ch.enqueue(KEY, 'замечания', 'review', 'p1');
  await until(() => w.sent.length === 1, 'the send was refused');
  w.idle = false;
  const reply = await w.ch.prompt(prompt('мой вопрос'));
  assert.deepEqual([reply.own, reply.answer], [undefined, { message: 'замечания' }]);
  reply.ack();
  await w.end();
  w.idle = true;
  await until(() => w.events.length === 1, 'the turn end is heard');
  assert.deepEqual([w.events[0]!.origin, w.events[0]!.sources, w.sent.length], ['user', ['review'], 1]);
  w.ch.close();

  const decided = world((_context, calls) => (calls === 1 ? { kind: 'continue', text: 'продолжай' } : { kind: 'release' }));
  decided.accept = false;
  await decided.ch.prompt(prompt('задача'));
  await decided.end();
  decided.idle = true;
  await until(() => decided.sent.length === 1, 'the decider text was refused');
  decided.idle = false;
  assert.equal((await decided.ch.prompt(prompt('мой вопрос'))).answer, null);
  decided.accept = true;
  await decided.end();
  decided.idle = true;
  await until(() => decided.events.length === 2, 'the user turn ends');
  await decided.ch.maintain();
  assert.equal(decided.sent.length, 1, 'the old decider text is gone');
  decided.ch.close();
});
