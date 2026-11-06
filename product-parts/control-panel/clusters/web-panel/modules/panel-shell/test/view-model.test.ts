import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  deviceLink,
  filterProjects,
  formatElapsed,
  indicators,
  ownerObjective,
  parseRoute,
  projectLists,
  projectTree,
  routeHash,
  sessionKey,
  sessionsLabel,
  shortPath,
  statusLine,
  themeAttribute,
  settingsExit,
} from '../src/view-model.js';

const NOW = Date.parse('2026-11-06T08:10:00Z');

function state(): Record<string, unknown> {
  return {
    system: { version: '0.1.0', addresses: ['http://127.0.0.1:4747/', 'http://100.81.163.123:4747/'] },
    projects: {
      root: '/Users/u/VSCODE',
      home: '/Users/u',
      projects: [
        { id: 'p2', name: 'Workflow_Pilot', path: '/Users/u/VSCODE/Workflow_Pilot', missing: false },
        { id: 'p1', name: 'F001', path: '/Users/u/VSCODE/F001', missing: false },
        { id: 'p3', name: 'Old', path: '/Users/u/Old', missing: true, archivedAt: '2026-11-01T00:00:00Z' },
      ],
    },
    providers: {
      providers: [
        { id: 'codex', status: { state: 'ready', label: 'готов' } },
        { id: 'claude', status: { state: 'not-installed', label: 'не установлен' } },
      ],
      projects: {
        p1: {
          codex: { sessions: [{ provider: 'codex', localId: 't1', title: 'Новая сессия', createdAt: '2026-11-06T08:07:00Z', links: { desktop: 'codex://t1' } }] },
          claude: { sessions: [{ provider: 'claude', localId: 'c1', title: 'Проверка', createdAt: '2026-11-05T17:40:00Z', links: {}, note: 'ссылки нет' }] },
        },
      },
    },
    titles: { projects: { p1: { 'codex:t1': { name: 'Склад — анализ остатков', source: 'agent' } } } },
    channel: { sessions: [{ key: 'codex:t1', state: 'working', lastStopAt: null }, { key: 'claude:c1', state: 'waiting', lastStopAt: '2026-11-05T17:50:00Z' }] },
    setup: { runs: [{ status: 'succeeded', provider: 'claude', startedAt: '2026-11-06T08:00:00Z' }, { status: 'running', provider: 'codex', startedAt: '2026-11-06T08:09:44Z' }] },
  };
}

test('routes round-trip through the hash; unknown hashes are the home screen', () => {
  const routes = [
    { screen: 'home' },
    { screen: 'settings' },
    { screen: 'archive' },
    { screen: 'new', mode: 'create' },
    { screen: 'new', mode: 'open' },
    { screen: 'project', projectId: 'p 1' },
    { screen: 'session', projectId: 'p1', key: 'codex:t/1' },
  ] as const;
  for (const route of routes) assert.deepEqual(parseRoute(routeHash(route)), route);
  assert.deepEqual(parseRoute(''), { screen: 'home' });
  assert.deepEqual(parseRoute('#/s/p1'), { screen: 'home' });
  assert.deepEqual(parseRoute('#/p/%E0%A4%A'), { screen: 'home' });
});

test('the tree lists active projects by name with sessions newest first, names, marks and spinners', () => {
  const tree = projectTree(state(), { now: NOW, collapsed: new Set(['p2']) });
  assert.deepEqual(tree.map((p) => [p.id, p.count, p.expanded]), [
    ['p1', '2 сессии', true],
    ['p2', '0 сессий', false],
  ]);
  const [first, second] = tree[0]!.sessions;
  assert.equal(first!.key, 'codex:t1');
  assert.equal(first!.name, 'Склад — анализ остатков');
  assert.equal(first!.providerLabel, 'ChatGPT');
  assert.equal(first!.isNew, true);
  assert.equal(first!.working, true);
  assert.equal(second!.name, 'Проверка');
  assert.equal(second!.providerLabel, 'Claude');
  assert.equal(second!.isNew, false);
  assert.equal(second!.working, false);
  assert.equal(second!.note, 'ссылки нет');
});

test('the owner session of the active plan without its own name is named by the plan objective', () => {
  const st = state();
  st['titles'] = { projects: {} };
  st['workflow'] = { projects: { p1: { scope: { objective: 'Склад: две команды' }, execution: { ownerSession: 't1' } } } };
  const sessions = projectTree(st, { now: NOW, collapsed: new Set() })[0]!.sessions;
  assert.equal(sessions.find((s) => s.key === 'codex:t1')!.name, 'Склад: две команды');
  assert.equal(sessions.find((s) => s.key === 'claude:c1')!.name, 'Проверка');
  assert.equal(ownerObjective(st, 'p1', 'c1'), null);
  assert.equal(ownerObjective({}, 'p1', 't1'), null);
});

test('project lists split the archive; search matches the name or the path', () => {
  const lists = projectLists(state());
  assert.deepEqual(lists.active.map((p) => p.id), ['p1', 'p2']);
  assert.deepEqual(lists.archived.map((p) => p.id), ['p3']);
  assert.equal(lists.home, '/Users/u');
  assert.deepEqual(filterProjects(lists.active, 'pilot').map((p) => p.id), ['p2']);
  assert.deepEqual(filterProjects(lists.active, ' ').map((p) => p.id), ['p1', 'p2']);
  assert.equal(projectLists({}).active.length, 0);
});

test('indicators, status line and helpers', () => {
  assert.deepEqual(indicators(state(), true).map((i) => [i.id, i.ok]), [
    ['service', true],
    ['codex', true],
    ['claude', false],
    ['ipad', true],
  ]);
  assert.ok(indicators(state(), false).every((i) => !i.ok));
  assert.deepEqual(statusLine(state(), NOW), { text: 'Готовим сессию в ChatGPT', elapsed: '16 с' });
  assert.equal(statusLine({}, NOW), null);
  assert.equal(formatElapsed(65_000), '1:05');
  assert.equal(formatElapsed(3_723_000), '1:02:03');
  assert.deepEqual([1, 2, 5, 11, 21, 22].map(sessionsLabel), ['1 сессия', '2 сессии', '5 сессий', '11 сессий', '21 сессия', '22 сессии']);
  assert.equal(sessionKey({ provider: 'claude', localId: 'a' }), 'claude:a');
  assert.equal(sessionKey({ provider: 'claude', localId: null }), null);
  assert.equal(shortPath('/Users/u/VSCODE/F001', '/Users/u'), '~/VSCODE/F001');
  assert.equal(shortPath('/Users/uu/x', '/Users/u'), '/Users/uu/x');
  assert.equal(themeAttribute('dark'), 'dark');
  assert.equal(themeAttribute('system'), undefined);
});

test('the chat link follows the device and refuses script-like schemes', () => {
  const links = { desktop: 'codex://t1', mobile: 'https://chatgpt.com/t1', web: 'https://chatgpt.com/w' };
  assert.equal(deviceLink(links, 0), 'codex://t1');
  assert.equal(deviceLink(links, 5), 'https://chatgpt.com/t1');
  assert.equal(deviceLink({ desktop: 'javascript:alert(1)', web: 'https://x' }, 0), 'https://x');
  assert.equal(deviceLink({}, 0), null);
});

test('leaving the settings returns to the screen they were opened from, else home', () => {
  assert.deepEqual(settingsExit({ screen: 'project', projectId: 'p1' }), { screen: 'project', projectId: 'p1' });
  assert.deepEqual(settingsExit({ screen: 'settings' }), { screen: 'home' });
  assert.deepEqual(settingsExit(null), { screen: 'home' });
});

test('the tree shows the project of the route, else the one chosen last, while it is active', async () => {
  const { currentProjectId } = await import('../src/selection.js');
  assert.equal(currentProjectId({ screen: 'project', projectId: 'a' }, 'b', ['a', 'b']), 'a');
  assert.equal(currentProjectId({ screen: 'settings' }, 'b', ['a', 'b']), 'b');
  assert.equal(currentProjectId({ screen: 'home' }, 'gone', ['a']), null);
  assert.equal(currentProjectId({ screen: 'session', projectId: 'archived', key: 'k' }, 'a', ['a']), 'a');
});

test('archive rows are chosen like in Workflow Pilot: click, ⌘ toggle, Shift range', async () => {
  const { selectRows } = await import('../src/selection.js');
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(selectRows(ids, [], null, 'b', {}), { selected: ['b'], anchor: 'b' });
  assert.deepEqual(selectRows(ids, ['b'], 'b', 'd', { range: true }).selected, ['b', 'c', 'd']);
  assert.deepEqual(selectRows(ids, ['b'], 'b', 'd', { toggle: true }).selected, ['b', 'd']);
  assert.deepEqual(selectRows(ids, ['b', 'd'], 'd', 'b', { toggle: true }).selected, ['d']);
});
