import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { PANEL_ASSETS_DIR, STATE_POLL_MS, panelShellMount } from '../src/index.ts';
import { registerSlot, slots } from '../src/slots.js';

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
    'shared-access-card.js',
    'shared-access-model.js',
    'new-project.js',
    'folder-picker.js',
    'folder-roots.js',
    'archive.js',
    'selection.js',
    'press.js',
    'buttons.css',
    'archive.css',
    'view-model.js',
    'providers.js',
    'sidebar.js',
    'menus.js',
    'screens.js',
    'settings.js',
    'card-grid.js',
    'slots.js',
    'session-screen.js',
    'actions.js',
    'layout.css',
    'tree.css',
    'manifest.webmanifest',
    'icons/icon.svg',
    'icons/icon-180.png',
    'icons/icon-192.png',
    'icons/icon-512.png',
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
  assert.match(html, /<link rel="stylesheet" href="layout.css"/);
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

test('the iPad home screen gets a manifest, icons and the standalone mode', async () => {
  const html = await readFile(path.join(PANEL_ASSETS_DIR, 'index.html'), 'utf8');
  assert.match(html, /<link rel="manifest" href="manifest.webmanifest"/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/icon-180.png"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /viewport-fit=cover/);
  const manifest = JSON.parse(await readFile(path.join(PANEL_ASSETS_DIR, 'manifest.webmanifest'), 'utf8')) as {
    display: string;
    start_url: string;
    icons: Array<{ src: string; sizes: string }>;
  };
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.deepEqual(manifest.icons.map((i) => i.sizes).sort(), ['192x192', '512x512', '512x512']);
  for (const [name, size] of [['icon-180.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]] as const) {
    const png = await readFile(path.join(PANEL_ASSETS_DIR, 'icons', name));
    assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG', name);
    assert.equal(png.readUInt32BE(16), size, `${name} width`);
    assert.equal(png.readUInt32BE(20), size, `${name} height`);
  }
  const layout = await readFile(path.join(PANEL_ASSETS_DIR, 'layout.css'), 'utf8');
  assert.match(layout, /grid-template-columns: var\(--sidebar-width, 320px\) 8px minmax\(0, 1fr\)/);
  assert.match(layout, /@media \(max-width: 680px\)/);
  assert.match(layout, /env\(safe-area-inset-bottom\)/);
});

test('the new project screen is loaded and text inputs disable iPad autocapitalization and autocorrection', async () => {
  const app = await readFile(path.join(PANEL_ASSETS_DIR, 'app.js'), 'utf8');
  assert.match(app, /from '\.\/new-project\.js';/);
  const dom = await readFile(path.join(PANEL_ASSETS_DIR, 'dom.js'), 'utf8');
  assert.match(dom, /autocapitalize: 'off'/);
  assert.match(dom, /autocorrect: 'off'/);
  for (const name of ['new-project.js', 'folder-picker.js', 'sidebar.js', 'screens.js', 'settings.js', 'menus.js', 'actions.js']) {
    const source = await readFile(path.join(PANEL_ASSETS_DIR, name), 'utf8');
    assert.doesNotMatch(source, /h\('input', \{ type: 'text'/, `${name} creates text inputs only via plainInput`);
    assert.doesNotMatch(source, /innerHTML/, name);
  }
  const card = await readFile(path.join(PANEL_ASSETS_DIR, 'new-project.js'), 'utf8');
  assert.match(card, /'\/api\/projects\/open'/);
  const actions = await readFile(path.join(PANEL_ASSETS_DIR, 'actions.js'), 'utf8');
  assert.match(actions, /'DELETE'/);
  assert.match(actions, /\/archive`/);
  assert.match(actions, /\/restore`/);
  const picker = await readFile(path.join(PANEL_ASSETS_DIR, 'folder-picker.js'), 'utf8');
  assert.match(picker, /\/api\/folders\?/);
  assert.match(picker, /error\.hint/);
});

test('the settings have no structure or provider cards; the archive and the press feedback are loaded', async () => {
  const app = await readFile(path.join(PANEL_ASSETS_DIR, 'app.js'), 'utf8');
  assert.doesNotMatch(app, /structure-card|provider-cards/);
  assert.match(app, /createArchiveScreen\(/);
  assert.match(app, /installPressFeedback\(\);/);
  const html = await readFile(path.join(PANEL_ASSETS_DIR, 'index.html'), 'utf8');
  for (const css of ['buttons.css', 'archive.css']) assert.ok(html.includes(`href="${css}"`), css);
  const buttons = await readFile(path.join(PANEL_ASSETS_DIR, 'buttons.css'), 'utf8');
  for (const rule of ['.btn:hover:not(:disabled)', 'button.is-pressed', '.just-pressed', '@keyframes wfk-press-ring']) assert.ok(buttons.includes(rule), rule);
});

test('the System card shows the service from service-installer: instance, autostart, launcher, icon, programs', async () => {
  const card = await readFile(path.join(PANEL_ASSETS_DIR, 'system-card.js'), 'utf8');
  for (const label of ["'Служба'", "'Экземпляр'", "'Автозапуск'", "'Запускатель'", "'Значок'", "'Программы'"]) {
    assert.ok(card.includes(label), label);
  }
  for (const field of ['service.version', 'service.instance', 'service.mechanism', 'service.autostartEntry', 'service?.launcher', 'service?.icon', 'service?.programs']) {
    assert.ok(card.includes(field), field);
  }
  // The program names come from the service (system.service.programNames), not from the panel.
  assert.ok(card.includes('service?.programNames'), 'programNames');
  for (const name of ["'node'", "'claude'", "'codex'", "'expect'"]) assert.ok(!card.includes(name), name);
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
  for (const url of ['/project-wizard/project-wizard.js', '/session-view/session-view.js', '/session-chat/session-chat.js']) assert.ok(app.includes(`'${url}'`), url);
  assert.match(app, /registerSlot,/);
  assert.match(app, /extension\.install\(shell\)/);
  assert.match(app, /renderCards\(settings\.cards, state\)/);
  const grid = await readFile(path.join(PANEL_ASSETS_DIR, 'card-grid.js'), 'utf8');
  assert.match(grid, /expandCards\(current\)/);
  assert.match(grid, /node\.remove\(\)/);
});

test('the sessionChat slot is registered and drawn under sessionBody on the session screen', async () => {
  assert.equal(slots.sessionChat, null);
  const definition = { select: () => 1, render: () => null };
  registerSlot('sessionChat', definition);
  assert.equal(slots.sessionChat, definition);
  slots.sessionChat = null;
  registerSlot('sessionSidebar', definition);
  assert.equal(slots.sessionSidebar, definition);
  slots.sessionSidebar = null;
  assert.throws(() => registerSlot('sessionNope' as never, definition), /Unknown panel slot/);
  const screen = await readFile(path.join(PANEL_ASSETS_DIR, 'session-screen.js'), 'utf8');
  assert.match(screen, /\[head, body, chat\]/);
  assert.match(screen, /h\('div', \{ class: 'session-chat' \}\)/);
  assert.match(screen, /slots\.sessionChat/);
  assert.match(screen, /JSON\.stringify\(\[data\.project\.id, data\.session\.key, selected\]\)/);
  assert.match(screen, /host\.firstChild !== node/);
  const app = await readFile(path.join(PANEL_ASSETS_DIR, 'app.js'), 'utf8');
  assert.match(app, /createSessionScreen\(slotContext, \{ resume: handlers.resumeSession \}\)/);
  const html = await readFile(path.join(PANEL_ASSETS_DIR, 'index.html'), 'utf8');
  const chatCss = html.indexOf('href="session-chat/session-chat.css"');
  assert.ok(chatCss > html.indexOf('href="session-view/session-view.css"'), 'session-chat.css after the other styles');
});

/** A minimal DOM for the actions module: elements only collect their children. */
function fakeDocument() {
  const element = () => ({
    className: '',
    hidden: false,
    children: [] as unknown[],
    setAttribute() {},
    append(...c: unknown[]) {
      this.children.push(...c);
    },
    replaceChildren() {},
    addEventListener() {},
  });
  return { createElement: element, createTextNode: (text: string) => ({ text }) };
}

test('an external session is not resumed when its screen opens; «Продолжить» resumes it on purpose (M19 2.3)', async () => {
  const saved = { document: (globalThis as any).document, fetch: globalThis.fetch };
  const posts: string[] = [];
  (globalThis as any).document = fakeDocument();
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    posts.push(`${init.method} ${url}`);
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const { createActions, externalText } = await import('../src/actions.js');
    const { handlers } = createActions({ navigate: () => {}, render: () => {}, route: () => ({ screen: 'home' }), providerNames: () => 'Claude' });
    const row = { key: 'claude:c1', provider: 'claude', providerLabel: 'Claude', resumable: true, external: false, state: 'stopped', links: {}, note: null } as any;
    const external = { ...row, external: true };
    handlers.reviveSession('p1', external);
    assert.deepEqual(posts, [], 'no resume for an external session');
    assert.deepEqual(handlers.sessionStatus(external), { text: 'Сессию ведёт приложение Claude вне панели; сообщения придут агенту с ближайшим хуком', tone: 'muted' });
    assert.equal(externalText({ providerLabel: 'Claude Code' }), 'Сессию ведёт приложение Claude Code вне панели; сообщения придут агенту с ближайшим хуком');
    handlers.resumeSession('p1', external);
    assert.deepEqual(posts, ['POST /api/projects/p1/providers/claude/sessions/c1/resume']);
    assert.equal(handlers.sessionStatus(external).text, 'поднимаем сессию…');
    handlers.resumeSession('p1', external);
    assert.equal(posts.length, 1, 'a pending resume is not repeated');
    handlers.reviveSession('p1', { ...row, key: 'claude:c2' });
    assert.deepEqual(posts.slice(1), ['POST /api/projects/p1/providers/claude/sessions/c2/resume'], 'a session of the panel is resumed as before');
    handlers.reviveSession('p1', { ...row, key: 'claude:c3', state: 'running' });
    handlers.reviveSession('p1', { ...row, key: 'codex:t1', provider: 'codex', resumable: false });
    assert.equal(posts.length, 2, 'running and non-resumable sessions are not resumed');
  } finally {
    (globalThis as any).document = saved.document;
    globalThis.fetch = saved.fetch;
  }
});
