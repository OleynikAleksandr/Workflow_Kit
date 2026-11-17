// M39 T009 (validation 1.5): «Автопилотирование» in «Настройки» — the exact names, the newest
// revision wins, a refused write shows the actual value; the service cards are collapsible.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { AUTOPILOTING_MODES, REVIEW_LABEL, autopilotingOf, newerSettings, refusalOf, settingsOf } from '../src/autopiloting-model.js';
import { PANEL_ASSETS_DIR } from '../src/index.ts';

test('the three modes and the review switch have the names the user agreed on', () => {
  assert.deepEqual(AUTOPILOTING_MODES.map((m) => m.label), ['Выключено', 'После ручного запуска Плана', 'Полный автопилот']);
  assert.deepEqual(AUTOPILOTING_MODES.map((m) => m.mode), ['off', 'after-start', 'full']);
  assert.equal(REVIEW_LABEL, 'Ревью спецификации и плана');
});

test('settings come from the service; a newer revision always wins over an older answer', () => {
  assert.equal(settingsOf({ mode: 'later', review: true, revision: 1 }), null);
  const { settings, error } = autopilotingOf({ autopiloting: { settings: { mode: 'full', review: true, revision: 4 }, error: 'broken' } });
  assert.deepEqual([settings, error], [{ mode: 'full', review: true, revision: 4 }, 'broken']);
  assert.deepEqual(autopilotingOf({}), { settings: null, error: null });
  const mine = { mode: 'after-start' as const, review: false, revision: 5 };
  assert.equal(newerSettings(mine, { mode: 'off', review: false, revision: 4 }), mine, 'an old poll does not undo the write');
  assert.deepEqual(newerSettings(mine, { mode: 'full', review: true, revision: 6 }), { mode: 'full', review: true, revision: 6 }, 'another device');
});

test('a refused write shows the actual value and a short reason', () => {
  const stale = refusalOf({ code: 'settings-stale', message: 'stale', details: { current: { mode: 'full', review: false, revision: 9 } } });
  assert.deepEqual(stale.current, { mode: 'full', review: false, revision: 9 });
  assert.match(stale.text, /на другом устройстве/u);
  const failed = refusalOf({ code: 'network', message: 'Нет связи с бэкендом' });
  assert.deepEqual([failed.current, failed.text], [null, 'Не сохранено: Нет связи с бэкендом. Показано сохранённое значение.']);
});

test('order of «Настройки» and the collapsible «Система» and «Общий доступ к чатам ChatGPT»', async () => {
  const read = (name: string) => readFile(path.join(PANEL_ASSETS_DIR, name), 'utf8');
  const settings = await read('settings.js');
  assert.match(settings, /appearance,\s+autopiloting\.element,[\s\S]*?\barchiveCard,\s+cards,/u);
  assert.match(await read('system-card.js'), /title: 'Система',\s+order: 0,\s+collapsible: true,/u);
  const shared = await read('shared-access-card.js');
  assert.match(shared, /collapsible: true,/u);
  assert.match(shared, /title: `Общий доступ к чатам \$\{p\.label\}`/u);
  const grid = await read('card-grid.js');
  assert.match(grid, /h\('details', \{ class: card\.wide \? 'panel service-card card-wide' : 'panel service-card'/u);
  assert.match(grid, /h\('summary', \{ class: 'service-summary', 'aria-expanded': 'false'/u);
  assert.match(grid, /summary\.setAttribute\('aria-expanded', String\(/u);
  assert.doesNotMatch(grid, /\.open = true|open: ''/u, 'closed on load');
  const css = await read('controls.css');
  assert.match(css, /\.service-card > summary \{[^}]*border-radius: 12px;/u);
  assert.match(await read('app.js'), /settings\.renderState\(state\)/u);
  const card = await read('autopiloting-card.js');
  assert.match(card, /h\('input', \{ type: 'radio', name: 'wfk-autopiloting-mode'/u);
  assert.match(card, /'\/api\/settings\/autopiloting', \{ expectedRevision: known\?\.revision \?\? 0/u);
  assert.doesNotMatch(card, /localStorage/u, 'settings live in the service');
});
