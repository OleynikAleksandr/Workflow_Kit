import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextText, createParameterPoll, limitTone, menuSections, parametersUrl, percent, safeAccent, safeFont } from '../src/parameters-model.js';
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
