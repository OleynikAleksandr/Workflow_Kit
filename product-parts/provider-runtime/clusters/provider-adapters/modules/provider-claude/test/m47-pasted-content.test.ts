// M47 T002: Claude 2.1.328 keeps a long paste in the user's transcript line wrapped in
// <pasted_content id="…"> (recorded live on 19.11.2026: a 7-line bracketed paste). The conversation
// shows the user's text without the wrapper, so the panel message and its line are equal.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatMessageOfLine, unwrapPasted } from '../src/chat.ts';

const PANEL_TEXT = 'Сделай маленькую утилиту на Node.js без зависимостей: `node wc.mjs <файл>` печатает число строк,\nслов и символов файла. Нужна спецификация и план из трёх задач:\n1) код утилиты;\n2) тест на node:test (пустой файл, файл с кириллицей, отсутствующий файл → код выхода 1);\n3) задача поставки (delivery): `npm pack` и запись имени архива в docs/release.md.\nПеред первой задачей спроси меня через AskUserQuestion, какое имя дать команде: «wc» или «счётчик».\nЭто проверка записи: ничего не делай, ответь одним словом: ок.';
/** The recorded user line of Claude 2.1.328, fields the reader needs and the recorded shape. */
const RECORDED = JSON.stringify({
  type: 'user', uuid: 'b9f1c6de-0000-4000-8000-000000000001', timestamp: '2026-11-19T17:44:10.000Z', isSidechain: false,
  promptSource: 'user', origin: { kind: 'human' }, userType: 'external', version: '2.1.328',
  message: { role: 'user', content: `\n\n<pasted_content id="4ec3">\n${PANEL_TEXT}\n</pasted_content id="4ec3">\n` },
});

test('the recorded wrapped line of Claude 2.1.328 is the text the panel sent', () => {
  const message = chatMessageOfLine(RECORDED);
  assert.equal(message?.role, 'user');
  assert.equal(message?.text, PANEL_TEXT);
});

test('typed text around a paste stays; two pastes are both unwrapped', () => {
  assert.equal(unwrapPasted('Смотри:\n\n<pasted_content id="a1">\nстрока 1\nстрока 2\n</pasted_content id="a1">\n'), 'Смотри:\n\nстрока 1\nстрока 2');
  assert.equal(unwrapPasted('<pasted_content id="x">\nA\n</pasted_content id="x">\n и \n<pasted_content id="y">\nB\n</pasted_content id="y">'), 'A\n и \nB');
});

test('a text without a pair is not changed: other ids, an open tag alone, plain text, an assistant line', () => {
  for (const text of [
    'Обычное сообщение\n\n',
    '<pasted_content id="a">\nне закрыто',
    '<pasted_content id="a">\nA\n</pasted_content id="b">',
    'речь о теге <pasted_content> в документации',
  ]) assert.equal(unwrapPasted(text), text, text);
  const assistant = JSON.stringify({ type: 'assistant', uuid: 'a1', timestamp: '2026-11-19T17:44:11.000Z', message: { role: 'assistant', content: [{ type: 'text', text: '<pasted_content id="q">\nцитата\n</pasted_content id="q">' }] } });
  assert.equal(chatMessageOfLine(assistant)?.text, '<pasted_content id="q">\nцитата\n</pasted_content id="q">', 'only the user\'s lines are unwrapped');
});
