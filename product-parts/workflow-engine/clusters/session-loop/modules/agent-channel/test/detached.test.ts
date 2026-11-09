// Turn end without holding Stop (spec M8 section 3): the watcher, the detached stop and the outbox.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_SEND_FAILURES, sessionKey } from '../src/index.ts';
import { CWD, KEY, gate, pause, prompt, until, world } from './detached-world.ts';

test('a Stop while the session is busy delivers nothing; an idle session gets the queue as one prompt', async () => {
  const w = world();
  assert.equal((await w.ch.prompt(prompt('задача'))).own, undefined);
  w.ch.enqueue(KEY, 'первое', 'panel');
  w.ch.enqueue(KEY, 'второе', 'review');
  assert.equal(await w.end(), true);
  await pause(30);
  assert.deepEqual([w.sent.length, w.events.length, w.ch.get(KEY)!.state], [0, 0, 'working']);
  w.idle = true;
  await until(() => w.sent.length === 1, 'the queue is sent once the session is idle');
  assert.equal(w.sent[0]!.text, 'первое\n\nвторое');
  assert.deepEqual(w.events.map((event) => [event.origin, event.lastAssistantMessage]), [['user', 'ответ агента']]);
  assert.deepEqual([w.ch.get(KEY)!.state, w.ch.get(KEY)!.pending, w.ch.queued(KEY).length], ['working', 0, 0]);
  // The hook of that prompt is the service's own turn and keeps what the turn began with.
  w.idle = false;
  const reply = await w.ch.prompt(prompt('первое\n\nвторое'));
  assert.deepEqual([reply.own, reply.answer], [true, null]);
  await w.end();
  w.idle = true;
  await until(() => w.events.length === 2, 'the second turn end is heard');
  assert.deepEqual([w.events[1]!.origin, w.events[1]!.sources], ['delivery', ['panel', 'review']]);
  w.ch.close();
});

test('turnEnd is refused for a client whose Stop hook is held; a session outside every project is only noted', async () => {
  const w = world();
  assert.equal(await w.ch.turnEnd({ client: 'codex', sessionId: 's', cwd: CWD, event: 'Stop' }), false);
  assert.equal(w.ch.get(sessionKey('codex', 's')), undefined);
  w.idle = true;
  assert.equal(await w.ch.turnEnd({ client: 'kimi', sessionId: 'elsewhere', cwd: '/tmp/other', event: 'Stop' }), true);
  assert.equal(w.ch.get(sessionKey('kimi', 'elsewhere'))!.note, null);
  w.ch.close();
});

test('one watcher per session: a new notification restarts it and the turn end is processed once', async () => {
  const w = world();
  await w.ch.prompt(prompt('задача'));
  await w.end();
  await w.end();
  await w.end();
  w.idle = true;
  await until(() => w.events.length > 0, 'the turn end is heard');
  await pause(30);
  assert.deepEqual([w.events.length, w.asked.length, w.answersRead], [1, 1, 1]);
  assert.equal(w.ch.get(KEY)!.state, 'waiting');
  w.ch.close();
});

test('an expired watch is picked up by maintain', async () => {
  const w = world(() => ({ kind: 'continue', text: 'продолжай' }), { watchMs: 16 });
  await w.ch.prompt(prompt('задача'));
  await w.end();
  await pause(60);
  w.idle = true;
  await pause(30);
  assert.deepEqual([w.events.length, w.ch.get(KEY)!.state], [0, 'working']);
  await w.ch.maintain();
  assert.deepEqual([w.events.length, w.sent.map((message) => message.text)], [1, ['продолжай']]);
  w.ch.close();
});

test('a refused delivery is retried with the same id and content; five failures in a row leave a note', async () => {
  const w = world();
  w.idle = true;
  w.accept = false;
  // A message queued for a waiting slot is flushed at once.
  w.ch.enqueue(KEY, 'замечания', 'review', 'p1');
  await until(() => w.sent.length === 1, 'the message is sent at once');
  assert.deepEqual([w.ch.get(KEY)!.state, w.ch.get(KEY)!.pending, w.ch.get(KEY)!.note], ['waiting', 1, null]);
  for (let i = 1; i < MAX_SEND_FAILURES; i += 1) await w.ch.maintain();
  assert.equal(w.sent.length, MAX_SEND_FAILURES);
  assert.equal(new Set(w.sent.map((message) => `${message.id}|${message.text}`)).size, 1);
  assert.match(w.ch.get(KEY)!.note!, /^сообщение не доставлено: провайдер не принял сообщение$/);
  await w.ch.maintain();
  assert.equal(w.sent.length, MAX_SEND_FAILURES, 'maintain stops retrying');
  // A new message starts the count anew; the unsent one goes first, unchanged, the new one waits.
  w.accept = new Error('нет связи');
  w.ch.enqueue(KEY, 'ещё одно', 'panel');
  await until(() => w.sent.length === MAX_SEND_FAILURES + 1, 'a new message retries the delivery');
  assert.equal(w.sent.at(-1)!.id, w.sent[0]!.id);
  assert.deepEqual([w.ch.get(KEY)!.pending, w.ch.queued(KEY).length], [2, 1]);
  w.accept = true;
  w.ch.wake(KEY);
  await until(() => w.ch.get(KEY)!.state === 'working', 'the wake delivers it');
  assert.deepEqual([w.sent.at(-1)!.text, w.ch.get(KEY)!.note, w.ch.queued(KEY).length], ['замечания', null, 1]);
  w.ch.close();
});

test('the hook of the sent prompt may come before the answer of the send: the turn keeps its origin and sources', async () => {
  const w = world();
  w.idle = true;
  const answer = gate<boolean>();
  w.accept = answer.promise;
  w.ch.enqueue(KEY, 'замечания ревью', 'review', 'p1');
  await until(() => w.sent.length === 1, 'the send began');
  w.idle = false;
  const reply = await w.ch.prompt(prompt(' замечания ревью\n'));
  assert.equal(reply.own, true);
  // A refusal that comes after the hook does not bring the message back.
  answer.open(false);
  await pause(20);
  assert.deepEqual([w.ch.get(KEY)!.state, w.ch.get(KEY)!.pending, w.ch.get(KEY)!.note], ['working', 0, null]);
  await w.ch.maintain();
  assert.equal(w.sent.length, 1);
  await w.end();
  w.idle = true;
  await until(() => w.events.length === 1, 'the turn end is heard');
  assert.deepEqual([w.events[0]!.origin, w.events[0]!.sources], ['delivery', ['review']]);
  w.ch.close();
});

test('a failed lastAnswer is not an agent answer: nobody hears it, the session carries a note', async () => {
  const w = world(() => ({ kind: 'continue', text: 'продолжай' }));
  await w.ch.prompt(prompt('задача'));
  w.answer = new Error('журнал сессии не читается');
  await w.end();
  w.idle = true;
  await until(() => w.ch.get(KEY)!.state === 'waiting', 'the slot waits');
  assert.deepEqual([w.answersRead, w.events.length, w.asked.length, w.sent.length], [3, 0, 0, 0]);
  assert.equal(w.ch.get(KEY)!.note, 'ответ Kimi не прочитан: журнал сессии не читается');
  // A queued message is still delivered, and the next read answer clears the note.
  w.ch.enqueue(KEY, 'сообщение панели');
  await until(() => w.sent.length === 1, 'the queue is delivered');
  assert.equal(w.ch.get(KEY)!.note, null);
  w.ch.close();
});

test('a turn generation that changed cancels the detached stop: a user prompt wins', async () => {
  const w = world(() => ({ kind: 'continue', text: 'продолжай' }));
  await w.ch.prompt(prompt('задача'));
  const read = gate<string | null>();
  w.answer = read.promise;
  await w.end();
  w.idle = true;
  await until(() => w.answersRead === 1, 'the answer is being read');
  w.idle = false;
  await w.ch.prompt(prompt('новая задача'));
  read.open('поздний ответ');
  await pause(30);
  assert.deepEqual([w.events.length, w.asked.length, w.sent.length, w.ch.get(KEY)!.state], [0, 0, 0, 'working']);
  // The same before the session is idle: the watcher is cancelled.
  await w.end();
  await w.ch.prompt(prompt('ещё задача'));
  w.idle = true;
  await pause(30);
  assert.equal(w.events.length, 0);
  w.ch.close();
});

