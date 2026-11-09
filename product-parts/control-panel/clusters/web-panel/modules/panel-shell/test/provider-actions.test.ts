import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { PANEL_ASSETS_DIR } from '../src/index.ts';
import { providerActionRows } from '../src/provider-actions.js';

test('provider-level actions of every provider, ready or not: only enabled ones, named by the short name', () => {
  const state = {
    providers: {
      providers: [
        {
          id: 'codex',
          title: 'ChatGPT (Codex)',
          label: 'ChatGPT',
          status: { state: 'ready' },
          actions: [
            { id: 'restart-daemon', title: 'Перезапустить демон', scope: 'provider', enabled: true },
            { id: 'start-daemon', title: 'Запустить демон', scope: 'provider', enabled: false, reason: 'уже запущен' },
            { id: 'trust', title: 'Доверить папку', scope: 'project', enabled: true },
          ],
        },
        { id: 'kimi', title: 'Kimi Code', status: { state: 'missing' }, actions: [{ id: 'remove-kimi-hook', title: 'Убрать хук Kit', scope: 'provider', enabled: true, confirm: 'Убрать хук?' }] },
        { id: 'claude', title: 'Claude' },
        { title: 'no id', actions: [{ id: 'x', title: 'X', scope: 'provider', enabled: true }] },
      ],
    },
  };
  assert.deepEqual(providerActionRows(state), [
    { provider: 'codex', id: 'restart-daemon', label: 'ChatGPT: Перезапустить демон', confirm: null },
    { provider: 'kimi', id: 'remove-kimi-hook', label: 'Kimi Code: Убрать хук Kit', confirm: 'Убрать хук?' },
  ]);
  assert.deepEqual(providerActionRows({}), []);
});

test('the project screen offers the provider actions and runs them through the provider route', async () => {
  const screens = await readFile(path.join(PANEL_ASSETS_DIR, 'screens.js'), 'utf8');
  assert.match(screens, /project\.providerActions/);
  assert.match(screens, /handlers\.runProviderAction\(row\)/);
  const actions = await readFile(path.join(PANEL_ASSETS_DIR, 'actions.js'), 'utf8');
  assert.match(actions, /\/api\/providers\/\$\{encodeURIComponent\(action\.provider\)\}\/actions\/\$\{encodeURIComponent\(action\.id\)\}/);
  assert.match(actions, /action-disabled/);
});
