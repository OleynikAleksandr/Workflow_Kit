// The conversation of a Claude session from its transcript (spec M18 section 2.2): which lines are
// messages and the incremental reader (appends, a split line, a replaced file, the page limit).
import assert from 'node:assert/strict';
import { appendFile, chmod, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import type { ProviderError } from '#provider-registry';
import { chatMessageOfLine, createChatReader } from '../src/chat.ts';

let tmp = '';
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-claude-chat-'));
});
after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const AT = '2026-11-12T07:01:15.000Z';
const user = (uuid: string, content: unknown, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ type: 'user', uuid, timestamp: AT, message: { role: 'user', content }, ...extra });
const assistant = (uuid: string, content: unknown, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ type: 'assistant', uuid, timestamp: AT, message: { role: 'assistant', content }, ...extra });

test('a user line is a message as a string or as text parts; tool results and service texts are not', () => {
  assert.deepEqual(chatMessageOfLine(user('u1', 'Привет')), { id: 'u1', role: 'user', text: 'Привет', at: AT });
  const parts = user('u2', [{ type: 'text', text: 'строка 1' }, { type: 'tool_result', tool_use_id: 't', content: 'x' }, { type: 'text', text: 'строка 2' }]);
  assert.equal(chatMessageOfLine(parts)?.text, 'строка 1\nстрока 2');
  assert.equal(chatMessageOfLine(user('u3', [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }])), null);
  assert.equal(chatMessageOfLine(user('u4', 'x', { isMeta: true })), null);
  assert.equal(chatMessageOfLine(user('u5', 'x', { isSidechain: true })), null);
  // The summary of a compacted context (M19 section 2.4); false keeps the line.
  assert.equal(chatMessageOfLine(user('u6', 'This session is being continued…', { isCompactSummary: true })), null);
  assert.equal(chatMessageOfLine(user('u7', 'обычная', { isCompactSummary: false }))?.text, 'обычная');
  for (const tag of ['<local-command-stdout>ok</local-command-stdout>', '<command-name>/clear</command-name>', '<command-message>m</command-message>', '<task-notification>t</task-notification>', '  <system-reminder>r</system-reminder>']) {
    assert.equal(chatMessageOfLine(user('u6', tag)), null, tag);
  }
  assert.equal(chatMessageOfLine(user('u7', [{ type: 'text', text: '<system-reminder>r</system-reminder>' }, { type: 'text', text: 'вопрос' }]))?.text, 'вопрос');
  assert.equal(chatMessageOfLine(user('u8', 'Stop hook feedback: очередь'))?.text, 'Stop hook feedback: очередь', 'the Stop hook answer stays');
  const noTime = JSON.stringify({ type: 'user', uuid: 'u9', message: { content: 'без времени' } });
  assert.equal(chatMessageOfLine(noTime)?.at, null);
  assert.equal(chatMessageOfLine(JSON.stringify({ type: 'user', message: { content: 'без id' } })), null);
});

test('an assistant line keeps only its text parts; thinking and tool calls alone are not a message', () => {
  const line = assistant('a1', [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'Готово.' }, { type: 'tool_use', id: 't', name: 'Bash', input: {} }]);
  assert.deepEqual(chatMessageOfLine(line), { id: 'a1', role: 'assistant', text: 'Готово.', at: AT });
  assert.equal(chatMessageOfLine(assistant('a2', [{ type: 'tool_use', id: 't', name: 'Bash', input: {} }])), null);
  assert.equal(chatMessageOfLine(assistant('a3', [{ type: 'text', text: '  ' }])), null);
  assert.equal(chatMessageOfLine(assistant('a4', [{ type: 'text', text: 'x' }], { isSidechain: true })), null);
  // Service records and broken lines.
  assert.equal(chatMessageOfLine('{"type":"attachment","uuid":"x"}'), null);
  assert.equal(chatMessageOfLine('{"type":"user", broken'), null);
  assert.equal(chatMessageOfLine(JSON.stringify({ type: 'queue-operation', content: '"type":"user"' })), null);
});

test('the reader follows appends, a line split between reads, a replaced file and a missing one', async () => {
  const file = path.join(tmp, 'grow.jsonl');
  const reader = createChatReader();
  assert.deepEqual(await reader.read(file, 100), { messages: [], truncated: false }, 'no file yet: an empty page');
  assert.deepEqual(await reader.read(null, 100), { messages: [], truncated: false }, 'no transcript in the hook journal');
  await writeFile(file, `${user('u1', 'один')}\n${JSON.stringify({ type: 'system', content: 'x'.repeat(1000) })}\n`);
  assert.deepEqual((await reader.read(file, 100)).messages.map((m) => m.text), ['один']);
  // Half a line (cut inside a Cyrillic character), then the rest.
  const second = Buffer.from(`${assistant('a1', [{ type: 'text', text: 'ответ два' }])}\n`);
  const cut = second.indexOf(Buffer.from('два')) + 1;
  await appendFile(file, second.subarray(0, cut));
  assert.deepEqual((await reader.read(file, 100)).messages.map((m) => m.text), ['один']);
  await appendFile(file, second.subarray(cut));
  assert.deepEqual((await reader.read(file, 100)).messages.map((m) => m.text), ['один', 'ответ два']);
  // A new file under the same path is read from the start.
  const replacement = path.join(tmp, 'replacement.jsonl');
  await writeFile(replacement, `${user('n1', 'новый файл')}\n`);
  await rename(replacement, file);
  assert.deepEqual((await reader.read(file, 100)).messages.map((m) => m.id), ['n1']);
  await rm(file);
  assert.deepEqual(await reader.read(file, 100), { messages: [], truncated: false });
});

test('the reader keeps the newest messages and marks the page truncated', async () => {
  const file = path.join(tmp, 'long.jsonl');
  const lines = Array.from({ length: 7 }, (_, i) => user(`u${i}`, `m${i}`));
  await writeFile(file, `${lines.join('\n')}\n`);
  const reader = createChatReader({ keep: 5 });
  const page = await reader.read(file, 100);
  assert.deepEqual(page.messages.map((m) => m.text), ['m2', 'm3', 'm4', 'm5', 'm6']);
  assert.equal(page.truncated, true);
  const short = await reader.read(file, 2);
  assert.deepEqual(short.messages.map((m) => m.text), ['m5', 'm6']);
  assert.equal(short.truncated, true);
  const small = path.join(tmp, 'small.jsonl');
  await writeFile(small, `${lines.slice(0, 3).join('\n')}\n`);
  assert.deepEqual(await createChatReader({ keep: 5 }).read(small, 100).then((p) => [p.messages.length, p.truncated]), [3, false]);
  assert.deepEqual(await createChatReader({ keep: 5 }).read(small, 2).then((p) => [p.messages.length, p.truncated]), [2, true]);
});

test('an unreadable transcript is chat-unavailable', { skip: process.platform === 'win32' || process.getuid?.() === 0 ? 'POSIX permissions only' : false }, async () => {
  const dir = path.join(tmp, 'locked');
  await mkdir(dir);
  const file = path.join(dir, 'locked.jsonl');
  await writeFile(file, `${user('u1', 'x')}\n`);
  await chmod(file, 0o000);
  try {
    await assert.rejects(createChatReader().read(file, 100), (error: ProviderError) => error.code === 'chat-unavailable' && /^Claude не отдал переписку: /.test(error.message));
  } finally {
    await chmod(file, 0o644);
  }
  const notFile = path.join(tmp, 'dir.jsonl');
  await mkdir(notFile);
  await assert.rejects(createChatReader().read(notFile, 100), (error: ProviderError) => error.code === 'chat-unavailable');
});
