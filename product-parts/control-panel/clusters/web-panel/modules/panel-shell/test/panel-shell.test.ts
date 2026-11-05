import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { PANEL_ASSETS_DIR, STATE_POLL_MS, panelShellMount } from '../src/index.ts';

test('the panel files live in the module src directory', async () => {
  for (const name of ['index.html', 'app.js', 'styles.css', 'cards.js', 'dom.js', 'system-card.js']) {
    assert.ok((await stat(path.join(PANEL_ASSETS_DIR, name))).isFile(), name);
  }
  assert.deepEqual(panelShellMount(), { prefix: '/', dir: PANEL_ASSETS_DIR });
});

test('index.html loads the stylesheet and the app module without inline scripts', async () => {
  const html = await readFile(path.join(PANEL_ASSETS_DIR, 'index.html'), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="styles.css"/);
  assert.match(html, /<script type="module" src="app.js"><\/script>/);
  assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>/);
  assert.doesNotMatch(html, /style="/);
});

test('app.js polls /api/state at the documented interval', async () => {
  const app = await readFile(path.join(PANEL_ASSETS_DIR, 'app.js'), 'utf8');
  assert.equal(STATE_POLL_MS, 3000);
  assert.match(app, new RegExp(`POLL_MS = ${STATE_POLL_MS};`));
  assert.match(app, /fetch\('\/api\/state'/);
});
