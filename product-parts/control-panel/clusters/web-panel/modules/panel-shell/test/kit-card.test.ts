import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KIT_UPDATE_TEXT, kitView } from '../src/kit-card.js';

const st = (entry: Record<string, unknown>) => ({ kitUpdate: { projects: { p1: { bundled: '2.2.4', running: false, checkedAt: null, ...entry } } } });

test('the Kit line: the version, no Kit, or why the state is unknown', () => {
  assert.equal(kitView({}, 'p1'), null);
  assert.equal(kitView(st({}), 'p2'), null);
  assert.deepEqual(kitView(st({ installed: '2.2.4', state: 'KIT_OK', action: 'none' }), 'p1'), { line: 'Kit 2.2.4', missing: false, card: null });
  assert.deepEqual(kitView(st({ installed: null, state: 'GIT_NO_KIT', action: 'none' }), 'p1'), { line: 'Kit не установлен', missing: true, card: null });
  const unknown = kitView(st({ installed: null, state: null, action: 'none', note: 'Kit: Kit не ответил за 60 с (inspect).' }), 'p1')!;
  assert.equal(unknown.line, 'Kit: Kit не ответил за 60 с (inspect).');
  assert.equal(unknown.missing, false);
  assert.equal(kitView(st({ installed: null, state: null, action: 'none' }), 'p1')!.line, 'Kit: версия ещё не проверена');
});

test('an older Kit gets the card with the button; the button is gone while it runs', () => {
  const offer = kitView(st({ installed: '2.2.3', state: 'KIT_OUTDATED', action: 'update' }), 'p1')!;
  assert.equal(offer.line, 'Kit 2.2.3');
  assert.deepEqual(offer.card, { tone: 'muted', title: 'Kit 2.2.3 → 2.2.4', text: KIT_UPDATE_TEXT, lines: [], button: 'Обновить Kit', running: false });
  const running = kitView(st({ installed: '2.2.3', state: 'KIT_OUTDATED', action: 'update', running: true }), 'p1')!;
  assert.deepEqual(running.card, { tone: 'muted', title: 'Kit 2.2.3 → 2.2.4', text: 'Kit обновляется…', lines: [], button: null, running: true });
  // A newer Kit than the app's: the line only, never a downgrade.
  assert.equal(kitView(st({ installed: '2.2.5', state: 'KIT_OK', action: 'none' }), 'p1')!.card, null);
});

test('after the update: the outcome with the hooks lines, or the Kit error with its next step', () => {
  const done = kitView(st({
    installed: '2.2.4',
    state: 'KIT_OK',
    action: 'none',
    last: { from: '2.2.3', to: '2.2.4', commit: 'c0ffee1234', hooks: ['ChatGPT: хуки Kit одобрены'], at: '2026-11-12T12:00:00.000Z' },
  }), 'p1')!;
  assert.deepEqual(done.card, {
    tone: 'ok',
    title: 'Kit обновлён до 2.2.4',
    text: 'Коммит c0ffee1. Сессии, начатые до обновления, получат новый пакет со следующей сессии.',
    lines: ['ChatGPT: хуки Kit одобрены'],
    button: null,
    running: false,
  });
  const failed = kitView(st({
    installed: '2.2.3',
    state: 'KIT_OUTDATED',
    action: 'update',
    error: { code: 'TRANSACTION_PENDING', message: 'A Kit commit transaction is unfinished.', nextAction: 'Run `scripts/workflow repair`.', at: '2026-11-12T12:00:00.000Z' },
  }), 'p1')!;
  assert.deepEqual(failed.card, {
    tone: 'error',
    title: 'Kit 2.2.3 → 2.2.4',
    text: 'Kit не обновлён: A Kit commit transaction is unfinished.',
    lines: ['Следующий шаг: Run `scripts/workflow repair`.'],
    button: 'Обновить Kit',
    running: false,
  });
  const noStep = kitView(st({ installed: '2.2.3', state: 'KIT_OUTDATED', action: 'none', error: { code: 'KIT_TIMEOUT', message: '', nextAction: null } }), 'p1')!;
  assert.equal(noStep.card!.text, 'Kit не обновлён: KIT_TIMEOUT');
  assert.deepEqual(noStep.card!.lines, []);
  assert.equal(noStep.card!.button, null);
});
