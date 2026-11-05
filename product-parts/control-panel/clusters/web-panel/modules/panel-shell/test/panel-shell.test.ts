import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { PANEL_ASSETS_DIR, STATE_POLL_MS, panelShellMount } from '../src/index.ts';

test('the panel files live in the module src directory', async () => {
  const files = [
    'index.html',
    'app.js',
    'styles.css',
    'controls.css',
    'cards.js',
    'dom.js',
    'api.js',
    'system-card.js',
    'projects-card.js',
    'folder-picker.js',
    'structure-card.js',
  ];
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

test('the structure card is loaded and installs through POST /api/projects/:id/structure', async () => {
  const app = await readFile(path.join(PANEL_ASSETS_DIR, 'app.js'), 'utf8');
  assert.match(app, /import '\.\/structure-card\.js';/);
  const card = await readFile(path.join(PANEL_ASSETS_DIR, 'structure-card.js'), 'utf8');
  assert.match(card, /\/structure`/);
  assert.match(card, /state\['structure'\]/);
  for (const label of ["label: 'ok'", "label: 'нет'", "label: 'modified'", "label: 'outdated'", "label: 'newer'", "'Установить'"]) {
    assert.ok(card.includes(label), label);
  }
  assert.doesNotMatch(card, /innerHTML/);
});

test('the System card shows the service from service-installer: instance, autostart, launcher, icon, programs', async () => {
  const card = await readFile(path.join(PANEL_ASSETS_DIR, 'system-card.js'), 'utf8');
  for (const label of ["'Служба'", "'Экземпляр'", "'Автозапуск'", "'Запускатель'", "'Значок'", "'Программы'"]) {
    assert.ok(card.includes(label), label);
  }
  for (const field of ['service.version', 'service.instance', 'service.mechanism', 'service.autostartEntry', 'service?.launcher', 'service?.icon', 'service?.programs']) {
    assert.ok(card.includes(field), field);
  }
  for (const name of ["'node'", "'claude'", "'codex'", "'expect'"]) assert.ok(card.includes(name), name);
  assert.doesNotMatch(card, /innerHTML/);
});

test('card groups expand into one card per item, sorted by order with the plain cards', async () => {
  const cards = await import('../src/cards.js');
  cards.registerCard({ id: 'test-a', title: 'A', order: 5, select: () => 'a', render: () => ({}) as Node });
  cards.registerCardGroup({
    id: 'test-group',
    order: 7,
    items: (state) => (state['items'] as string[]).map((id) => ({ id, title: id.toUpperCase() })),
    select: (state, id) => `${String(state['tag'])}:${id}`,
    render: () => ({}) as Node,
  });
  const expanded = cards.expandCards({ items: ['x', 'y'], tag: 't' }).filter((c) => c.id.startsWith('test-'));
  assert.deepEqual(
    expanded.map((c) => [c.id, c.title, c.order, c.select({ tag: 't' })]),
    [
      ['test-a', 'A', 5, 'a'],
      ['test-group-x', 'X', 7, 't:x'],
      ['test-group-y', 'Y', 7, 't:y'],
    ],
  );
  assert.equal(cards.expandCards({ items: [] }).filter((c) => c.id.startsWith('test-group')).length, 0);
  cards.registerCardGroup({
    id: 'test-group',
    order: 7,
    items: () => {
      throw new Error('boom');
    },
    select: () => null,
    render: () => ({}) as Node,
  });
  const broken = cards.expandCards({}).find((c) => c.id === 'test-group');
  assert.ok(broken);
  assert.throws(() => broken.render(null, {}), /boom/);
});

test('app.js loads panel extensions with the shell helpers and keeps card sections in order', async () => {
  const app = await readFile(path.join(PANEL_ASSETS_DIR, 'app.js'), 'utf8');
  assert.match(app, /export const PANEL_EXTENSIONS = \[/);
  assert.match(app, /extension\.install\(shell\)/);
  assert.match(app, /expandCards\(state\)/);
  assert.match(app, /node\.remove\(\)/);
});
