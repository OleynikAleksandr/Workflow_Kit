import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { SESSION_CHAT_ASSETS_DIR, SESSION_CHAT_PREFIX, sessionChatMount } from '../src/index.ts';
import { SEND_MAX_CHARS, TRUNCATED_TEXT, canSend, errorText, localIdOf, mergePage, messagesUrl, roleLabel, sendOutcome, sendUrl, timeLabel, unsupportedText } from '../src/chat-model.js';

const msg = (id: string, role: 'user' | 'assistant', text: string, at: string | null = null) => ({ id, role, text, at });

test('the mount serves the session chat under /session-chat/', async () => {
  assert.equal(SESSION_CHAT_PREFIX, '/session-chat/');
  assert.deepEqual(sessionChatMount(), { prefix: SESSION_CHAT_PREFIX, dir: SESSION_CHAT_ASSETS_DIR });
  const source = await readFile(path.join(SESSION_CHAT_ASSETS_DIR, 'session-chat.js'), 'utf8');
  assert.match(source, /registerSlot\('sessionChat'/);
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML/);
  const css = await readFile(path.join(SESSION_CHAT_ASSETS_DIR, 'session-chat.css'), 'utf8');
  for (const name of ['.sc-card', '.sc-feed', '.sc-msg', '.sc-msg-user', '.sc-msg-agent', '.sc-meta', '.sc-input', '.sc-status']) assert.ok(css.includes(name), name);
  assert.match(css, /white-space: pre-wrap/);
  assert.doesNotMatch(css, /max-height: 60vh/);
  assert.match(css, /min-height: 0/);
});

test('request URLs: the local id after the first colon, every part encoded', () => {
  assert.equal(localIdOf('claude:abc'), 'abc');
  assert.equal(localIdOf('codex:a:b'), 'a:b');
  assert.equal(messagesUrl('p 1', { key: 'claude:abc', provider: 'claude' }), '/api/projects/p%201/providers/claude/sessions/abc/messages');
  assert.equal(messagesUrl('p', { key: 'codex:a:b/c' }), '/api/projects/p/providers/codex/sessions/a%3Ab%2Fc/messages', 'the provider comes from the key when not given');
  assert.equal(sendUrl('p/1', 'kimi:x y'), '/api/projects/p%2F1/sessions/kimi%3Ax%20y/message');
});

test('mergePage: the first page, new messages, no change, changed text and a sliding window', () => {
  const first = mergePage(null, { messages: [msg('1', 'user', 'привет'), msg('2', 'assistant', 'здравствуйте')] });
  assert.deepEqual(first.added, ['1', '2']);
  assert.equal(first.hasNew, true);
  assert.equal(first.changed, true);

  const empty = mergePage(null, { messages: [] });
  assert.deepEqual([empty.messages, empty.hasNew, empty.changed], [[], false, true], 'the first empty page still draws the feed');

  const same = mergePage(first.messages, { messages: [msg('1', 'user', 'привет'), msg('2', 'assistant', 'здравствуйте')] });
  assert.deepEqual([same.added, same.hasNew, same.changed], [[], false, false]);

  const more = mergePage(first.messages, { messages: [...first.messages, msg('3', 'user', 'ещё')] });
  assert.deepEqual([more.added, more.hasNew, more.changed], [['3'], true, true]);

  const edited = mergePage(first.messages, { messages: [msg('1', 'user', 'привет'), msg('2', 'assistant', 'другой текст')] });
  assert.deepEqual([edited.added, edited.hasNew, edited.changed], [[], false, true]);

  const window = mergePage(more.messages, { messages: [...more.messages.slice(1), msg('4', 'assistant', 'ответ')] });
  assert.deepEqual(window.messages.map((m) => m.id), ['2', '3', '4'], 'the page decides what is shown');
  assert.deepEqual(window.added, ['4']);

  const bad = mergePage(null, { messages: [{ id: 1, role: 'user', text: 'x' }, { id: 'a', role: 'system', text: 'x' }, { id: 'b', role: 'assistant', text: 'ok', at: 5 }] });
  assert.deepEqual(bad.messages, [msg('b', 'assistant', 'ok', null)], 'malformed items are dropped, a non-string time is null');
  assert.deepEqual(mergePage([], null).messages, []);
});

test('sendOutcome: sent or queued', () => {
  assert.equal(sendOutcome({ sent: true }), 'Отправлено агенту');
  assert.equal(sendOutcome({ queued: 'q1' }), 'В очереди: агент получит сообщение в конце хода или с вашим следующим сообщением в чате');
});

test('canSend: text present, within the limit and no send under way', () => {
  assert.equal(canSend('текст', false), true);
  assert.equal(canSend('текст', true), false);
  assert.equal(canSend('  \n ', false), false);
  assert.equal(canSend('a'.repeat(SEND_MAX_CHARS), false), true);
  assert.equal(canSend('a'.repeat(SEND_MAX_CHARS + 1), false), false);
});

test('labels: who, when, unsupported, truncated and errors', () => {
  assert.equal(roleLabel('user', 'Claude'), 'Вы');
  assert.equal(roleLabel('assistant', 'ChatGPT'), 'ChatGPT');
  assert.equal(roleLabel('assistant', ''), 'Агент');
  const now = new Date(2026, 10, 12, 18, 0);
  assert.equal(timeLabel(new Date(2026, 10, 12, 9, 5).toISOString(), now), '09:05');
  assert.equal(timeLabel(new Date(2026, 10, 11, 23, 59).toISOString(), now), '11.11 23:59');
  assert.equal(timeLabel(new Date(2025, 0, 2, 7, 3).toISOString(), now), '02.01.2025 07:03');
  assert.equal(timeLabel(null, now), '');
  assert.equal(timeLabel('not a time', now), '');
  assert.equal(unsupportedText('Kimi'), 'Kimi не отдаёт переписку; сообщение агенту можно отправить');
  assert.equal(TRUNCATED_TEXT, 'Показаны последние сообщения; полная переписка — в чате провайдера');
  assert.equal(errorText({ message: 'Сессия не найдена' }), 'Сессия не найдена');
  assert.equal(errorText({ message: 'Нет связи', hint: 'Проверьте службу' }), 'Нет связи. Проверьте службу');
});
