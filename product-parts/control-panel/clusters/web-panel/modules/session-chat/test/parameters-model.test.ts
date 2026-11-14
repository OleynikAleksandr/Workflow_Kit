import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextText, contextWindowText, createParameterPoll, limitTone, menuSections, parametersUrl, percent, safeAccent, safeFont } from '../src/parameters-model.js';
import type { SessionParameters } from '#provider-registry';

test('URLs preserve project, provider and canonical id, including colons', () => {
  assert.equal(parametersUrl('p/a', 'codex', 'codex:s:1'), '/api/projects/p%2Fa/providers/codex/sessions/s%3A1/parameters');
});
test('styles accept provider fonts and hex accent but reject CSS injection', () => {
  assert.equal(safeFont('-apple-system, "SF Pro Text", system-ui'), '-apple-system, "SF Pro Text", system-ui');
  for (const v of ['url(x)', 'a; color:red', 'x'.repeat(201), null]) assert.equal(safeFont(v), null);
  assert.equal(safeAccent('#4c8dff'), '#4c8dff'); assert.equal(safeAccent('red'), null);
  assert.equal(percent(101), 100); assert.equal(percent(-3), 0); assert.equal(percent(NaN), null);
  assert.deepEqual([79, 80, 94, 95].map(limitTone), ['muted', 'warn', 'warn', 'error']);
});
test('partial catalogs retain the inaccessible mode section and selected model/effort', () => {
  const data: SessionParameters = { items: [
    { id: 'model', value: 'a', label: 'A', title: 'Model', tone: 'primary', inRow: true, options: [{ value: 'a', label: 'A' }] },
    { id: 'effort', value: 'high', label: 'High', title: 'Effort', tone: 'muted', inRow: true, options: [{ value: 'high', label: 'High' }] },
    { id: 'mode', value: 'default', label: 'Обычный', title: 'Mode', tone: 'primary', inRow: false, reason: 'Каталог недоступен' },
  ], context: null, limits: [], style: { font: 'system-ui', ring: 'first' }, editable: true, at: '' };
  const sections = menuSections(data);
  assert.deepEqual(sections.map(s => s.title), ['Модель', 'Усилие', 'Режим']);
  assert.equal(sections[0]?.options[0]?.selected, true);
  assert.deepEqual(sections[2], { id: 'mode', title: 'Режим', label: 'Обычный', reason: 'Каталог недоступен', options: [] });
});
test('context text distinguishes missing data from measured zero', () => {
  assert.equal(contextText(null), 'Контекст: нет данных');
  assert.match(contextText({ usedTokens: 31024, windowTokens: 475000, usedPercent: 7 }), /7 %/);
  assert.match(contextText({ usedTokens: 0, windowTokens: 475000, usedPercent: 0 }), /0 %/);
  const threshold = { usedTokens: 78451, windowTokens: 500000, usedPercent: 16, modelWindowTokens: 1000000 };
  assert.equal(contextText(threshold).replace(/\s/g, ' '), 'Контекст: 78 451 из 500 000 (16 %)');
  assert.equal(contextWindowText(threshold)?.replace(/\s/g, ' '), 'Окно модели: 1 000 000 · автосжатие: 500 000');
  assert.equal(contextWindowText({ usedTokens: 1, windowTokens: 475000, usedPercent: 0 }), null);
  assert.equal(contextWindowText(null), null);
});
test('polls only when visible, single flight, stale reads ignored and errors preserve last result', async () => {
  let resolve!: (v: unknown) => void; let reject!: (v: unknown) => void; let calls = 0;
  const values: unknown[] = []; const errors: unknown[] = [];
  const poll = createParameterPoll(() => { calls++; return new Promise((yes, no) => { resolve = yes; reject = no; }); }, v => values.push(v), e => errors.push(e));
  await poll.refresh(); assert.equal(calls, 0);
  poll.visible(true); assert.equal(calls, 1);
  poll.visible(true); assert.equal(calls, 1);
  poll.invalidate(); resolve('stale'); await new Promise(r => setTimeout(r, 0)); assert.deepEqual(values, []);
  const next = poll.refresh(); assert.equal(calls, 2); resolve('fresh'); await next; assert.deepEqual(values, ['fresh']);
  const failed = poll.refresh(); reject('offline'); await failed; assert.deepEqual(values, ['fresh']); assert.deepEqual(errors, ['offline']);
  poll.visible(false); await poll.refresh(); assert.equal(calls, 3);
});
test('M29: a waiting choice shows in the row and marks its option; failures read as one line', async () => {
  const { chosen, failureText, hasPending, shownItem } = await import('../src/parameters-model.js');
  const data: SessionParameters = { items: [
    { id: 'model', value: 'claude-opus-5-5', label: 'Opus 5.5', title: 'model: Opus 5.5', tone: 'primary', inRow: true,
      options: [{ value: 'native:Opus', label: 'Opus 5.5', selected: true }, { value: 'native:Haiku', label: 'Haiku 5.5', selected: false }],
      pending: { value: 'native:Haiku', label: 'Haiku 5.5', note: 'применится, когда Claude закончит ответ' } },
    { id: 'effort', value: 'high', label: 'High', title: 'effort: High', tone: 'muted', inRow: true, options: [{ value: 'high', label: 'High' }, { value: 'low', label: 'Low' }] },
  ], context: null, limits: [], style: { font: 'system-ui', ring: 'last' }, editable: true, at: '',
  failures: [{ field: 'effort', value: 'low', reason: 'Claude не принял изменение', at: '2026-11-14T12:00:00Z' }] };
  assert.equal(hasPending(data), true); assert.equal(hasPending({ ...data, items: [data.items[1]!] }), false); assert.equal(hasPending(null), false);
  assert.deepEqual(shownItem(data.items[0]!), { label: 'Haiku 5.5', pending: true, title: 'model: Opus 5.5 → Haiku 5.5: применится, когда Claude закончит ответ' });
  assert.deepEqual(shownItem(data.items[1]!), { label: 'High', pending: false, title: 'effort: High' });
  assert.equal(chosen(data.items[0], data.items[0]!.options![1]!), true, 'the waiting choice is marked');
  assert.equal(chosen(data.items[0], data.items[0]!.options![0]!), false, 'the confirmed value can be picked to cancel');
  assert.deepEqual(menuSections(data)[0]!.options.map(o => o.selected), [false, true]);
  assert.equal(failureText(data.failures![0]!, data), 'Claude не принял усилие Low', 'a generic reason is not repeated');
  assert.equal(failureText({ ...data.failures![0]!, reason: 'Этого уровня усилия нет у модели' }, data), 'Claude не принял усилие Low: Этого уровня усилия нет у модели');
});
