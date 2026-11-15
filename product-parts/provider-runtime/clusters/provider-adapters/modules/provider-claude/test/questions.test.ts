// AskUserQuestion in the Claude feed (spec M33 section 2.2, facts T001): pending, answered in every
// format T001 saw, cancelled, sidechain and other tools, and the incremental reader with questions.
import assert from 'node:assert/strict';
import { appendFile, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { questionsOut } from '#provider-registry';
import type { ChatPage } from '#provider-registry';
import { createChatReader, hasOpenQuestion } from '../src/chat.ts';
import { CLAUDE_QUESTION_REASON, QUESTIONS_KEEP, partAnswerOf } from '../src/questions.ts';

let tmp = '';
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-claude-questions-'));
});
after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const AT = '2026-11-15T07:01:15.000Z';
const line = (row: Record<string, unknown>): string => JSON.stringify({ timestamp: AT, ...row });
const user = (uuid: string, content: unknown, extra: Record<string, unknown> = {}): string => line({ type: 'user', uuid, message: { role: 'user', content }, ...extra });
const assistant = (uuid: string, content: unknown, extra: Record<string, unknown> = {}): string => line({ type: 'assistant', uuid, message: { role: 'assistant', content }, ...extra });
const COLOR = { question: 'Which color?', header: 'Color', multiSelect: false, options: [{ label: 'Blue', description: 'Cold' }, { label: 'Red', description: 'Warm' }] };
const FRUIT = { question: 'Which fruits?', header: 'Fruit', multiSelect: true, options: [{ label: 'Apple', description: '' }, { label: 'Plum', description: '' }, { label: 'Pear', description: '' }] };
const ask = (uuid: string, id: string, questions: unknown[], extra: Record<string, unknown> = {}): string =>
  assistant(uuid, [{ type: 'tool_use', id, name: 'AskUserQuestion', input: { questions } }], extra);
const result = (uuid: string, id: string, toolUseResult: unknown, isError = false): string =>
  user(uuid, [{ type: 'tool_result', tool_use_id: id, content: 'x', ...(isError ? { is_error: true } : {}) }], { toolUseResult });

/** A page as the route gives it: questions through the contract normalization. */
async function page(name: string, lines: string[]): Promise<ChatPage> {
  const file = path.join(tmp, `${name}.jsonl`);
  await writeFile(file, `${lines.join('\n')}\n`);
  const raw = await createChatReader().read(file, 100);
  const questions = questionsOut(raw.questions);
  return { ...raw, ...(questions ? { questions } : {}) };
}

test('a call without a result is a pending question after the latest message, not answerable yet', async () => {
  const p = await page('pending', [user('u1', 'Спроси'), assistant('a1', [{ type: 'text', text: 'Сейчас спрошу.' }]), ask('a2', 'toolu_1', [COLOR])]);
  assert.deepEqual(p.messages.map((m) => m.id), ['u1', 'a1'], 'the call is no message');
  assert.deepEqual(p.questions, [{
    id: 'toolu_1', at: AT, afterMessageId: 'a1', state: 'pending', answerable: false, reason: CLAUDE_QUESTION_REASON,
    parts: [{ id: 'q1', header: 'Color', question: 'Which color?', options: COLOR.options, multiSelect: false, allowOther: true }],
  }]);
});

test('answers of every format T001 saw: a label, labels of Desktop, a joined string of the hook, own text, two parts', async () => {
  const p = await page('answered', [
    ask('a1', 't1', [COLOR]), result('r1', 't1', { questions: [COLOR], answers: { 'Which color?': 'Blue' } }),
    ask('a2', 't2', [FRUIT]), result('r2', 't2', { questions: [FRUIT], answers: { 'Which fruits?': ['Apple'] } }),
    ask('a3', 't3', [FRUIT]), result('r3', 't3', { questions: [FRUIT], answers: { 'Which fruits?': 'Apple, Plum' } }),
    ask('a4', 't4', [COLOR]), result('r4', 't4', { questions: [COLOR], answers: { 'Which color?': 'medium' } }),
    ask('a5', 't5', [COLOR, FRUIT]), result('r5', 't5', { questions: [COLOR, FRUIT], answers: { 'Which color?': 'Red', 'Which fruits?': 'Pear' } }),
    // The second result line of the same call (T001: one without a timestamp) changes nothing.
    result('r5b', 't5', { questions: [COLOR, FRUIT], answers: { 'Which color?': 'Blue' } }),
    ask('a6', 't6', [COLOR]), result('r6', 't6', { questions: [COLOR], answers: {} }),
  ]);
  const by = Object.fromEntries((p.questions ?? []).map((q) => [q.id, q]));
  assert.ok(Object.values(by).every((q) => q.state === 'answered' && !q.answerable && q.reason === undefined));
  assert.deepEqual(by['t1']!.answers, { q1: { selected: ['Blue'] } });
  assert.deepEqual(by['t2']!.answers, { q1: { selected: ['Apple'] } });
  assert.deepEqual(by['t3']!.answers, { q1: { selected: ['Apple', 'Plum'] } });
  assert.deepEqual(by['t4']!.answers, { q1: { selected: [], other: 'medium' } });
  assert.deepEqual(by['t5']!.answers, { q1: { selected: ['Red'] }, q2: { selected: ['Pear'] } });
  assert.equal(by['t6']!.answers, undefined, 'an unknown format is answered without answers');
  assert.deepEqual(p.messages, [], 'tool calls and results are no messages');
});

test('Esc, an error and a later message cancel; sidechain and other tools give no questions', async () => {
  const p = await page('cancelled', [
    ask('a1', 't1', [COLOR]), result('r1', 't1', 'User rejected tool use', true),
    ask('a2', 't2', [COLOR]), user('u1', '[Request interrupted by user for tool use]'),
    ask('a3', 't3', [COLOR], { isSidechain: true }),
    assistant('a4', [{ type: 'tool_use', id: 't4', name: 'Bash', input: { command: 'ls' } }]),
    ask('a5', 't5', [COLOR]), assistant('a6', [{ type: 'text', text: 'Ладно, без ответа.' }]),
    // An error result of a subagent row does not close the main question; its own result does.
    ask('a7', 't7', [COLOR]), user('r7s', [{ type: 'tool_result', tool_use_id: 't7', content: 'x', is_error: true }], { isSidechain: true }),
    result('r7', 't7', { answers: { 'Which color?': 'Blue' } }),
  ]);
  assert.deepEqual((p.questions ?? []).map((q) => [q.id, q.state]), [['t1', 'cancelled'], ['t2', 'cancelled'], ['t5', 'cancelled'], ['t7', 'answered']]);
  assert.deepEqual(p.messages.map((m) => m.id), ['u1', 'a6'], 'messages stay those of M18');
  const plain = await page('plain', [user('u1', 'x'), assistant('a1', [{ type: 'text', text: 'y' }])]);
  assert.equal('questions' in plain, false, 'a transcript without questions keeps the old page');
});

test('a part answer: arrays, labels, joined labels only for multiSelect, own text', () => {
  const single = { id: 'q1', header: '', question: '', options: [{ label: 'A, B', description: '' }, { label: 'A', description: '' }, { label: 'B', description: '' }], multiSelect: false, allowOther: true };
  assert.deepEqual(partAnswerOf(single, 'A, B'), { selected: ['A, B'] });
  assert.deepEqual(partAnswerOf(single, 'B, A'), { selected: [], other: 'B, A' }, 'not multiSelect: own text');
  assert.deepEqual(partAnswerOf({ ...single, multiSelect: true }, 'B, A'), { selected: ['B', 'A'] });
  assert.deepEqual(partAnswerOf(single, ['A', 'свой']), { selected: ['A'], other: 'свой' });
  assert.equal(partAnswerOf(single, ''), null);
  assert.equal(partAnswerOf(single, []), null);
  assert.equal(partAnswerOf(single, 3), null);
});

test('the reader with questions: a split call, a result appended later, a replaced file, the limit', async () => {
  const file = path.join(tmp, 'grow.jsonl');
  const reader = createChatReader();
  const call = Buffer.from(`${ask('a1', 't1', [{ ...COLOR, question: 'Какой цвет?' }])}\n`);
  const cut = call.indexOf(Buffer.from('цвет')) + 1;
  await writeFile(file, call.subarray(0, cut));
  assert.equal(await hasOpenQuestion(reader, file), false, 'half a line is no question');
  await appendFile(file, call.subarray(cut));
  assert.equal(await hasOpenQuestion(reader, file), true);
  assert.equal((await reader.read(file, 100)).questions?.[0]?.parts[0]?.question, 'Какой цвет?');
  await appendFile(file, `${result('r1', 't1', { answers: { 'Какой цвет?': 'Blue' } })}\n`);
  assert.equal(await hasOpenQuestion(reader, file), false);
  assert.deepEqual((await reader.read(file, 100)).questions?.[0]?.answers, { q1: { selected: ['Blue'] } });
  const replacement = path.join(tmp, 'replacement.jsonl');
  await writeFile(replacement, `${user('n1', 'новый')}\n`);
  await rename(replacement, file);
  assert.equal((await reader.read(file, 100)).questions, undefined, 'a new file starts without questions');
  assert.equal(await hasOpenQuestion(reader, null), false);
  // Many questions: the newest QUESTIONS_KEEP stay, the pending one among them.
  const many = Array.from({ length: QUESTIONS_KEEP + 5 }, (_, i) => [ask(`a${i}`, `t${i}`, [COLOR]), result(`r${i}`, `t${i}`, 'User rejected tool use', true)]).flat();
  const p = await page('many', [...many, ask('last', 'open', [COLOR])]);
  assert.equal(p.questions?.length, QUESTIONS_KEEP);
  assert.equal(p.questions?.at(-1)?.id, 'open');
  assert.equal(p.questions?.at(-1)?.state, 'pending');
  assert.equal(p.questions?.[0]?.id, `t${6}`);
});
