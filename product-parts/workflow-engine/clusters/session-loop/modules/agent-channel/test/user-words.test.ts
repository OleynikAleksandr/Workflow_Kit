// M39 T005: the channel keeps the words the user really wrote to a session (the source of a
// direct instruction); service, review and reminder messages never count.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { USER_MESSAGE_SOURCE, createAgentChannel, parseHookInput, sessionKey } from '../src/index.ts';
import { USER_WORDS_KEPT, createUserWords } from '../src/user-words.ts';

const at = new Date('2026-11-16T10:00:00.000Z');
const channel = () => createAgentChannel({ resolveProject: async () => ({ id: 'p1' }), now: () => at });
const prompt = (text: string, turn = 't-1') =>
  parseHookInput('claude', { session_id: 's-1', hook_event_name: 'UserPromptSubmit', prompt: text, turn_id: turn, cwd: '/p' })!;

test('a prompt the user typed is kept with its time; the panel user message too', async () => {
  const ch = channel();
  const key = sessionKey('claude', 's-1');
  assert.deepEqual(ch.userWords(key), []);
  const reply = await ch.prompt(prompt('Да, составляй спецификацию и план'));
  reply.ack();
  const [typed] = ch.userWords(key);
  assert.equal(typed!.text, 'Да, составляй спецификацию и план');
  assert.equal(typed!.via, 'prompt');
  assert.equal(typed!.at, at.toISOString());
  ch.enqueue(key, 'Сделай заодно README', USER_MESSAGE_SOURCE, 'p1');
  assert.deepEqual(ch.userWords(key).map((w) => [w.via, w.text]), [['prompt', 'Да, составляй спецификацию и план'], ['panel', 'Сделай заодно README']]);
});

test('service, review and reminder messages never count as the user words', async () => {
  const ch = channel();
  const key = sessionKey('claude', 's-1');
  await ch.prompt(prompt('hello'));
  ch.enqueue(key, 'Workflow Kit: продолжай по плану.', 'panel', 'p1');
  ch.enqueue(key, 'REVIEW: APPROVED, начинай', 'review', 'p1');
  ch.enqueue(key, 'Напоминание: составляй спецификацию', 'reminder', 'p1');
  assert.deepEqual(ch.userWords(key).map((w) => w.text), ['hello']);
});

test('a panel message given directly is noted; forget drops the words', async () => {
  const ch = channel();
  const key = sessionKey('claude', 's-1');
  ch.noteUserWords(key, 'Да, делай план');
  assert.equal(ch.userWords(key)[0]!.via, 'panel');
  ch.forget(key);
  assert.deepEqual(ch.userWords(key), []);
});

test('the store keeps the last texts and skips empty ones', () => {
  const store = createUserWords();
  for (let i = 0; i < USER_WORDS_KEPT + 2; i += 1) store.record('k', { text: `m${i}`, at: 'x', via: 'prompt', turnId: null });
  store.record('k', { text: '   ', at: 'x', via: 'prompt', turnId: null });
  assert.deepEqual(store.list('k').map((w) => w.text), ['m2', 'm3', 'm4', 'm5', 'm6']);
});
