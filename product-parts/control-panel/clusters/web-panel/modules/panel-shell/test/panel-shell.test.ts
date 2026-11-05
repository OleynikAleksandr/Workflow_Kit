import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { PANEL_ASSETS_DIR, STATE_POLL_MS, panelShellMount } from '../src/index.ts';

test('the panel files live in the module src directory', async () => {
  const files = ['index.html', 'app.js', 'styles.css', 'controls.css', 'cards.js', 'dom.js', 'api.js', 'system-card.js', 'projects-card.js', 'folder-picker.js'];
  for (const name of files) {
    assert.ok((await stat(path.join(PANEL_ASSETS_DIR, name))).isFile(), name);
  }
  assert.deepEqual(panelShellMount(), { prefix: '/', dir: PANEL_ASSETS_DIR });
});

test('index.html loads the stylesheet and the app module without inline scripts', async () => {
  const html = await readFile(path.join(PANEL_ASSETS_DIR, 'index.html'), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="styles.css"/);
  assert.match(html, /<link rel="stylesheet" href="controls.css"/);
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

test('the projects card is loaded and text inputs disable iPad autocapitalization and autocorrection', async () => {
  const app = await readFile(path.join(PANEL_ASSETS_DIR, 'app.js'), 'utf8');
  assert.match(app, /import '\.\/projects-card\.js';/);
  const dom = await readFile(path.join(PANEL_ASSETS_DIR, 'dom.js'), 'utf8');
  assert.match(dom, /autocapitalize: 'off'/);
  assert.match(dom, /autocorrect: 'off'/);
  for (const name of ['projects-card.js', 'folder-picker.js']) {
    const source = await readFile(path.join(PANEL_ASSETS_DIR, name), 'utf8');
    assert.doesNotMatch(source, /h\('input', \{ type: 'text'/, `${name} creates text inputs only via plainInput`);
    assert.doesNotMatch(source, /innerHTML/, name);
  }
  const card = await readFile(path.join(PANEL_ASSETS_DIR, 'projects-card.js'), 'utf8');
  assert.match(card, /'\/api\/projects\/open'/);
  assert.match(card, /'DELETE'/);
  const picker = await readFile(path.join(PANEL_ASSETS_DIR, 'folder-picker.js'), 'utf8');
  assert.match(picker, /\/api\/folders\?/);
  assert.match(picker, /error\.hint/);
});
