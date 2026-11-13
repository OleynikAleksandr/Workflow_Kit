import assert from 'node:assert/strict';
import { test } from 'node:test';
import { composerData, createInputKeys, effectiveTurn, interruptUrl, isStaleTurn, mayClearDraft } from '../src/composer-model.js';

const event = (at = 10, more = {}) => ({ key: 'Enter', timeStamp: at, ...more });
const turn = { state: 'working', turnRef: 'old', available: true, pending: false, reason: '' };

test('Enter sends in waiting/holding/unknown, working keeps newline; modifiers keep the queue', () => {
  const keys = createInputKeys();
  assert.equal(keys.down(event(), false), 'send');
  assert.equal(keys.down(event(), true), 'native');
  for (const modifier of ['ctrlKey', 'metaKey']) assert.equal(keys.down(event(20, { [modifier]: true }), true), 'send');
  assert.equal(keys.down(event(30, { shiftKey: true }), false), 'native');
  assert.equal(keys.down(event(40, { repeat: true }), false), 'ignore');
  assert.equal(keys.down(event(50, { key: 'a' }), false), 'native');
});

test('IME active/isComposing/229 cannot send; Safari trailing Enter is consumed once', () => {
  const keys = createInputKeys();
  keys.start();
  assert.equal(keys.down(event(1), false), 'native');
  keys.end(10);
  assert.equal(keys.down(event(11), false), 'ignore');
  assert.equal(keys.down(event(12), false), 'send', 'a deliberate following Enter is not swallowed');
  assert.equal(keys.down(event(20, { isComposing: true, ctrlKey: true }), false), 'native');
  assert.equal(keys.down(event(21, { keyCode: 229, metaKey: true }), false), 'native');
  keys.end(30);
  keys.up('Enter');
  assert.equal(keys.down(event(31), false), 'send', 'keyup closes the guard even if there was no trailing keydown');
  keys.end(40);
  assert.equal(keys.down(event(100), false), 'send', 'guard expires');
  keys.end(110);
  keys.down(event(111, { key: 'a' }), false);
  assert.equal(keys.down(event(112), false), 'send', 'another key closes the guard');
});

test('state selection uses exact project/session model and public interruptions; missing telemetry stays absent', () => {
  const state = {
    channel: { interruptions: { p: { 'codex:a:b': turn } }, sessions: [{ projectId: 'p', key: 'codex:holding', state: 'holding' }] },
    providers: { projects: { p: { codex: { sessions: [{ localId: 'other', model: 'Wrong' }, { localId: 'a:b', model: 'Actual model' }] } } } },
  };
  const selected = composerData(state, 'p', 'codex:a:b', 'codex');
  assert.equal(selected.model, 'Actual model');
  assert.deepEqual(selected.turn, turn);
  assert.equal(composerData(state, 'other-project', 'codex:a:b', 'codex').model, '—');
  assert.equal(composerData(state, 'p', 'codex:holding', 'codex').turn.state, 'holding');
  assert.equal(composerData({}, 'p', 'codex:a:b', 'codex').turn.state, 'unknown');
  assert.equal(composerData({}, 'p', 'codex:a:b', 'codex').turn.available, false);
  assert.deepEqual(Object.keys(selected).sort(), ['model', 'turn'], 'no invented effort/mode/context');
});

test('confirmed Stop only overrides its generation; newer drafts survive success', () => {
  assert.equal(effectiveTurn(turn, 'old').state, 'waiting');
  assert.equal(effectiveTurn({ ...turn, turnRef: 'new' }, 'old').state, 'working');
  assert.equal(effectiveTurn(turn, null).state, 'working');
  assert.equal(mayClearDraft(1, 1, 'text', 'text'), true);
  assert.equal(mayClearDraft(1, 2, 'text', 'text'), false);
  assert.equal(mayClearDraft(1, 1, 'text', 'new text'), false);
  assert.equal(isStaleTurn({ code: 'stale-turn' }), true);
  assert.equal(isStaleTurn(new Error('failed')), false);
  assert.equal(interruptUrl('p/1', 'codex:a:b'), '/api/projects/p%2F1/sessions/codex%3Aa%3Ab/interrupt');
});
