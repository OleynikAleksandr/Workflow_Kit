// The model of the agent's question card (spec M33 section 2.5): placement, choice, the answer,
// the card states of every attempt phase, closed questions and refusals of the route; the question
// answered by a message (spec M33 section 2.7).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ANSWERED_BY_MESSAGE_TEXT, ANSWERED_IN_APP_TEXT, CANCELLED_TEXT, SENDING_TEXT, SENT_WAITING_TEXT, UNKNOWN_OUTCOME_TEXT,
  afterError, answerOf, answerUrl, byMessage, cardView, closedPlaces, closedView, emptyChoice, newAttemptId, pendingQuestion, pick, questionsOf, toggleOther, writeOther,
} from '../src/question-model.js';
import type { Question } from '../src/question-model.js';

const COLOR = { id: 'q1', header: 'Color', question: 'Which color?', options: [{ label: 'Blue', description: 'cold' }, { label: 'Red', description: '' }], multiSelect: false, allowOther: true };
const FRUIT = { id: 'q2', header: 'Fruit', question: 'Which fruits?', options: [{ label: 'Apple', description: '' }, { label: 'Plum', description: '' }], multiSelect: true, allowOther: false };
const q = (over: Partial<Question> = {}): Question => ({ id: 't1', at: null, afterMessageId: 'm1', state: 'pending', parts: [COLOR, FRUIT], answerable: true, ...over });

test('questions of a page, the pending one and the places of closed ones', () => {
  assert.equal(questionsOf({ messages: [] }), undefined, 'an old page has none');
  const all = questionsOf({ questions: [q({ id: 'a', state: 'answered', afterMessageId: 'm1' }), { bad: true }, q({ id: 'b', state: 'cancelled', afterMessageId: 'gone' }), q({ id: 'c' })] })!;
  assert.deepEqual(all.map((x) => x.id), ['a', 'b', 'c']);
  assert.equal(pendingQuestion(all)?.id, 'c');
  assert.equal(pendingQuestion([]), null);
  const places = closedPlaces(all, new Set(['m1']));
  assert.deepEqual([...places.entries()].map(([k, v]) => [k, v.map((x) => x.id)]), [['m1', ['a']], ['', ['b']]], 'an unknown message puts it first');
});

test('the choice: a radio replaces, a checkbox toggles, own text replaces a single choice; one click never answers alone', () => {
  const question = q();
  let choice = emptyChoice(question);
  assert.equal(answerOf(question, choice), null);
  choice = pick(choice, COLOR, 'Blue');
  assert.equal(answerOf(question, choice), null, 'every part needs an answer');
  choice = pick(choice, FRUIT, 'Plum');
  choice = pick(choice, FRUIT, 'Apple');
  assert.deepEqual(answerOf(question, choice), { q1: { selected: ['Blue'] }, q2: { selected: ['Apple', 'Plum'] } }, 'labels in the order of the options');
  choice = pick(choice, COLOR, 'Red');
  assert.deepEqual(answerOf(question, choice)?.['q1'], { selected: ['Red'] });
  choice = toggleOther(choice, COLOR, true);
  assert.equal(answerOf(question, choice), null, 'own text on but empty');
  choice = writeOther(choice, COLOR, '  Зелёный ');
  assert.deepEqual(answerOf(question, choice)?.['q1'], { selected: [], other: 'Зелёный' });
  choice = pick(choice, FRUIT, 'Apple');
  choice = pick(choice, FRUIT, 'Plum');
  assert.equal(answerOf(question, choice), null, 'multiSelect needs one label at least');
  assert.equal(answerOf(q({ parts: [] }), {}), null, 'a stub has nothing to answer');
});

test('the card of a pending question in every phase; no button after a hand-out', () => {
  const question = q();
  const ready = pick(pick(emptyChoice(question), COLOR, 'Blue'), FRUIT, 'Apple');
  assert.deepEqual(cardView(question, emptyChoice(question), { phase: 'idle' }), { text: '', tone: '', choosable: true, button: true, active: false, openApp: false });
  assert.equal(cardView(question, ready, { phase: 'idle' }).active, true);
  assert.deepEqual(cardView(question, ready, { phase: 'sending', attemptId: 'a' }), { text: SENDING_TEXT, tone: 'muted', choosable: false, button: true, active: false, openApp: false });
  assert.deepEqual(cardView(question, ready, { phase: 'refused', text: 'Ответ не подходит к вопросу' }), { text: 'Ответ не подходит к вопросу', tone: 'error', choosable: true, button: true, active: true, openApp: false });
  for (const view of [cardView(question, ready, { phase: 'waiting', attemptId: 'a' }), cardView(q({ delivery: 'sent', answerable: false, reason: SENT_WAITING_TEXT }), ready, { phase: 'idle' })]) {
    assert.deepEqual(view, { text: SENT_WAITING_TEXT, tone: 'muted', choosable: false, button: false, active: false, openApp: false });
  }
  const restart = cardView(q({ delivery: 'sent', answerable: false, reason: 'Ответ был отправлен до перезапуска службы…' }), ready, { phase: 'idle' });
  assert.deepEqual([restart.text, restart.button, restart.openApp], ['Ответ был отправлен до перезапуска службы…', false, true]);
  const locked = cardView(q({ answerable: false, reason: 'Ответьте в приложении Claude' }), ready, { phase: 'idle' });
  assert.deepEqual([locked.text, locked.choosable, locked.button, locked.openApp], ['Ответьте в приложении Claude', false, false, true]);
});

test('a closed question: the proven answer, the app, an unknown outcome without the panel choice, a cancel', () => {
  const answered = q({ state: 'answered', answers: { q1: { selected: [], other: 'Зелёный' }, q2: { selected: ['Apple', 'Plum'] } } });
  assert.deepEqual(closedView(answered), { answers: [{ header: 'Color', text: 'Зелёный' }, { header: 'Fruit', text: 'Apple, Plum' }], note: '' });
  assert.deepEqual(closedView(q({ state: 'answered' })), { answers: [], note: ANSWERED_IN_APP_TEXT });
  assert.deepEqual(closedView(q({ state: 'answered' }), { phase: 'done', outcome: 'unknown' }), { answers: [], note: UNKNOWN_OUTCOME_TEXT });
  assert.deepEqual(closedView(q({ state: 'answered' }), { phase: 'waiting', attemptId: 'a' }), { answers: [], note: UNKNOWN_OUTCOME_TEXT });
  assert.deepEqual(closedView(q({ state: 'cancelled' })), { answers: [], note: CANCELLED_TEXT });
});

test('refusals of the route: retry with the same attempt only after a network error, a new attempt only when nothing was handed out', () => {
  assert.deepEqual(afterError({ status: 0, code: 'network', message: 'Нет связи с бэкендом' }, 'a1'), { attempt: { phase: 'sending', attemptId: 'a1' }, repoll: false, retry: true });
  assert.deepEqual(afterError({ status: 409, code: 'question-stale', message: 'x' }, 'a1'), { attempt: { phase: 'idle' }, repoll: true, retry: false });
  for (const code of ['question-timeout', 'question-sent']) assert.deepEqual(afterError({ status: 504, code, message: 'x' }, 'a1').attempt, { phase: 'waiting', attemptId: 'a1' });
  for (const code of ['question-invalid', 'question-unavailable', 'question-failed']) {
    assert.deepEqual(afterError({ status: 400, code, message: 'Ответ не подходит к вопросу' }, 'a1').attempt, { phase: 'refused', text: 'Ответ не подходит к вопросу' });
  }
  assert.equal(afterError({ status: 404, code: 'unsupported', message: 'нет' }, 'a1').attempt.phase, 'refused');
});

test('the answer URL and the attempt id', () => {
  assert.equal(answerUrl('/api/projects/p/providers/claude/sessions/s%201/messages', 'toolu_1'), '/api/projects/p/providers/claude/sessions/s%201/questions/toolu_1/answer');
  assert.match(newAttemptId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(newAttemptId(), newAttemptId());
});

test('a question answered by a message: placed after its message, never the waiting one, the answer route and lines (M34)', () => {
  const asked = q({ id: 'async:a1', afterMessageId: 'm1', parts: [{ ...COLOR, header: '' }], reply: 'message' });
  assert.equal(byMessage(asked), true);
  assert.equal(pendingQuestion([asked]), null, 'it does not make the agent wait');
  assert.equal(pendingQuestion([q({ id: 'b' }), asked])?.id, 'b', 'a blocking one still stands at the end');
  const places = closedPlaces([asked, q({ id: 'c', state: 'answered', afterMessageId: 'm2' })], new Set(['m1', 'm2']));
  assert.deepEqual([...places.entries()].map(([k, v]) => [k, v.map((x) => x.id)]), [['m1', ['async:a1']], ['m2', ['c']]]);
  // The same attempt phases as a blocking question.
  assert.equal(cardView(asked, pick(emptyChoice(asked), asked.parts[0]!, 'Blue'), { phase: 'idle' }).active, true);
  assert.equal(cardView(asked, emptyChoice(asked), { phase: 'sending', attemptId: 'x' }).text, SENDING_TEXT);
  assert.equal(cardView({ ...asked, delivery: 'sent', answerable: false }, emptyChoice(asked), { phase: 'idle' }).text, SENT_WAITING_TEXT);
  const header = COLOR.question;
  assert.deepEqual(closedView({ ...asked, state: 'answered', answerable: false, answers: { q1: { selected: ['Blue'] } } }, { phase: 'done', outcome: 'accepted' }), { answers: [{ header, text: 'Blue' }], note: '' });
  assert.deepEqual(closedView({ ...asked, state: 'answered', answerable: false, answers: { q1: { selected: [], other: 'Зелёный' } } }), { answers: [{ header, text: 'Зелёный' }], note: '' });
  assert.deepEqual(closedView({ ...asked, state: 'answered', answerable: false }), { answers: [], note: ANSWERED_BY_MESSAGE_TEXT });
  assert.deepEqual(closedView({ ...asked, state: 'answered', answerable: false }, { phase: 'done', outcome: 'accepted' }), { answers: [], note: ANSWERED_BY_MESSAGE_TEXT });
});
