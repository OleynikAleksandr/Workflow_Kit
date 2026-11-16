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
    text: 'Коммит c0ffee1. Сессии, начатые до обновления, получат новые хуки и пакет со следующей сессии.',
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

test('the Kit structure (M38): the arrow, the files kept by hand, the outcome and a skipped structure', () => {
  const structure = (installable: boolean, kept: string[] = []) => ({ status: installable ? 'outdated' : 'ok', installed: 3, version: 4, installable, kept });
  // A fresh Kit with an outdated structure: the card for the structure alone.
  const only = kitView(st({ installed: '2.2.4', state: 'KIT_OK', action: 'update', structure: structure(true, ['.workflow-kit/templates/module.md']) }), 'p1')!;
  assert.deepEqual(only.card, {
    tone: 'muted',
    title: 'Структура Kit 3 → 4',
    text: KIT_UPDATE_TEXT,
    lines: ['Изменено вручную, не обновится: .workflow-kit/templates/module.md'],
    button: 'Обновить Kit',
    running: false,
  });
  assert.match(KIT_UPDATE_TEXT, /структуру/);
  // An older Kit and an older structure: both arrows; an older version alone counts as an older Kit.
  const both = kitView(st({ installed: '2.2.3', state: 'KIT_OK', action: 'update', structure: structure(true) }), 'p1')!;
  assert.equal(both.card!.title, 'Kit 2.2.3 → 2.2.4, структура 3 → 4');
  assert.deepEqual(both.card!.lines, []);
  assert.equal(kitView(st({ installed: '2.2.3', state: 'KIT_OUTDATED', action: 'update', structure: structure(false) }), 'p1')!.card!.title, 'Kit 2.2.3 → 2.2.4');
  const running = kitView(st({ installed: '2.2.4', state: 'KIT_OK', action: 'update', structure: structure(true), running: true }), 'p1')!;
  assert.deepEqual([running.card!.title, running.card!.text, running.card!.button], ['Структура Kit 3 → 4', 'Kit обновляется…', null]);

  // After: the structure alone, the Kit and the structure, a skipped structure.
  const files = ['.claude/settings.json', '.workflow-kit/manifest.json'];
  const structureDone = kitView(st({
    installed: '2.2.4',
    state: 'KIT_OK',
    action: 'none',
    structure: structure(false),
    last: { from: '2.2.4', to: '2.2.4', commit: 'abc1234def', hooks: [], structure: { from: 3, to: 4, files }, structureNote: null, at: '2026-11-16T12:00:00.000Z' },
  }), 'p1')!;
  assert.deepEqual(structureDone.card, {
    tone: 'ok',
    title: 'Структура Kit обновлена до 4',
    text: 'Коммит abc1234. Сессии, начатые до обновления, получат новые хуки и пакет со следующей сессии.',
    lines: ['Структура Kit 3 → 4: .claude/settings.json, .workflow-kit/manifest.json'],
    button: null,
    running: false,
  });
  const bothDone = kitView(st({
    installed: '2.2.4',
    state: 'KIT_OK',
    action: 'none',
    last: { from: '2.2.3', to: '2.2.4', commit: 'abc1234def', hooks: ['ChatGPT: хуки Kit одобрены'], structure: { from: 3, to: 4, files }, structureNote: null, at: '2026-11-16T12:00:00.000Z' },
  }), 'p1')!;
  assert.equal(bothDone.card!.title, 'Kit обновлён до 2.2.4');
  assert.deepEqual(bothDone.card!.lines, ['ChatGPT: хуки Kit одобрены', 'Структура Kit 3 → 4: .claude/settings.json, .workflow-kit/manifest.json']);
  const note = 'Структура Kit не обновлена: файлы изменены и не закоммичены: AGENTS.md';
  const kitWithNote = kitView(st({
    installed: '2.2.4',
    state: 'KIT_OK',
    action: 'update',
    last: { from: '2.2.3', to: '2.2.4', commit: 'abc1234def', hooks: [], structure: null, structureNote: note, at: '2026-11-16T12:00:00.000Z' },
  }), 'p1')!;
  assert.deepEqual([kitWithNote.card!.tone, kitWithNote.card!.title, kitWithNote.card!.lines], ['ok', 'Kit обновлён до 2.2.4', [note]]);
  const skipped = kitView(st({
    installed: '2.2.4',
    state: 'KIT_OK',
    action: 'update',
    structure: structure(true),
    last: { from: '2.2.4', to: '2.2.4', commit: null, hooks: [], structure: null, structureNote: note, at: '2026-11-16T12:00:00.000Z' },
  }), 'p1')!;
  assert.deepEqual(skipped.card, { tone: 'error', title: 'Структура Kit не обновлена', text: note, lines: [], button: 'Обновить Kit', running: false });
});
