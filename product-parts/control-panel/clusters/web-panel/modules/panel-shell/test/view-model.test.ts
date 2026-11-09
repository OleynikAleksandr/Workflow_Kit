import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  arrivedSession,
  chatStatus,
  deviceLink,
  opensByItself,
  filterProjects,
  formatElapsed,
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
  runningText,
  settingsExit,
} from '../src/view-model.js';
import { indicators, providerNames, providerViews } from '../src/providers.js';

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
        { id: 'codex', title: 'ChatGPT (Codex)', label: 'ChatGPT', mark: 'G', resume: false, status: { state: 'ready', label: 'готов' } },
        { id: 'claude', title: 'Claude', label: 'Claude', mark: 'C', resume: true, status: { state: 'not-installed', label: 'не установлен' } },
      ],
      projects: {
        p1: {
          codex: { sessions: [{ provider: 'codex', localId: 't1', title: 'Новая сессия', createdAt: '2026-11-06T08:07:00Z', links: { desktop: 'codex://t1' } }] },
          claude: { sessions: [{ provider: 'claude', localId: 'c1', title: 'Проверка', createdAt: '2026-11-05T17:40:00Z', links: {}, note: 'ссылки нет', state: 'stopped' }] },
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
  assert.equal(second!.state, 'stopped');
  assert.equal(first!.state, 'unknown', 'a provider without a process state');
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

test('providers come from the state: names, letters, resume, and the sentence of the texts', () => {
  assert.deepEqual(providerViews(state()), [
    { id: 'codex', label: 'ChatGPT', mark: 'G', resume: false, ready: true, statusLabel: 'готов' },
    { id: 'claude', label: 'Claude', mark: 'C', resume: true, ready: false, statusLabel: 'не установлен' },
  ]);
  const three = { providers: { providers: [{ id: 'codex', label: 'ChatGPT' }, { id: 'claude', label: 'Claude' }, { id: 'kimi', title: 'Kimi Code' }, { title: 'no id' }] } };
  assert.deepEqual(providerViews(three).map((p) => [p.id, p.label, p.mark, p.resume, p.statusLabel]), [
    ['codex', 'ChatGPT', 'C', false, 'нет сведений'],
    ['claude', 'Claude', 'C', false, 'нет сведений'],
    ['kimi', 'Kimi Code', 'K', false, 'нет сведений'],
  ]);
  assert.equal(providerNames(three), 'ChatGPT, Claude и Kimi Code');
  assert.equal(providerNames(state()), 'ChatGPT и Claude');
  assert.equal(providerNames({ providers: { providers: [{ id: 'kimi', label: 'Kimi' }] } }), 'Kimi');
  assert.equal(providerNames({}), 'приложениях провайдеров');
  assert.deepEqual(indicators(three, true).map((i) => i.id), ['service', 'codex', 'claude', 'kimi', 'ipad'], 'an indicator per provider of the service');
  const tree = projectTree(state(), { now: NOW, collapsed: new Set() }).find((p) => p.id === 'p1')!;
  assert.deepEqual(tree.sessions.map((s) => [s.provider, s.providerLabel, s.resumable]), [['codex', 'ChatGPT', false], ['claude', 'Claude', true]]);
  const unknown = { ...state(), providers: { providers: [], projects: (state()['providers'] as any).projects } };
  assert.deepEqual(projectTree(unknown, { now: NOW, collapsed: new Set() }).find((p) => p.id === 'p1')!.sessions.map((s) => [s.providerLabel, s.resumable]), [['codex', false], ['claude', false]], 'an unknown provider keeps its id and is not resumed');
  assert.equal(runningText({ providerLabel: 'Claude' }), 'открыта в Claude');
  assert.equal(runningText({ providerLabel: 'Kimi', note: 'группа Remote' }), 'открыта в Kimi — группа Remote');
  const run = { setup: { runs: [{ status: 'running', provider: 'kimi', providerLabel: 'Kimi', startedAt: '2026-11-06T08:09:44Z' }] } };
  assert.equal(statusLine(run, NOW)?.text, 'Готовим сессию в Kimi', 'the run carries the name of its provider');
});

test('a ChatGPT session header says the chat opens from the card; without a link it shows the note', () => {
  assert.deepEqual(chatStatus({}, 'codex://threads/t1'), { text: 'чат открывается щелчком по карточке сессии', tone: 'muted' });
  assert.deepEqual(chatStatus({ note: 'без ссылки' }, null), { text: 'без ссылки', tone: 'muted' });
  assert.deepEqual(chatStatus({}, null), { text: 'ссылки нет', tone: 'muted' });
  assert.equal(chatStatus({ note: 'ждёт ответа' }, 'codex://threads/t1').text, 'чат открывается щелчком по карточке сессии — ждёт ответа');
});

test('a Kimi session: the card opens the project in the app; the Remote Control page waits for a tap', () => {
  const links = { desktop: 'kimi-code://open?root=%2FUsers%2Fme%2Fapp', mobile: 'https://code-rc.kimi.com/devices/dev_1/' };
  assert.equal(deviceLink(links, 0), links.desktop);
  assert.equal(deviceLink(links, 5), links.mobile);
  assert.equal(deviceLink({ desktop: links.desktop }, 5), null, 'the app link of the computer is not offered on a tablet');
  assert.equal(chatStatus({}, links.desktop).text, 'проект открывается в Kimi Code щелчком по карточке сессии');
  assert.equal(chatStatus({ note: 'в архиве Kimi' }, links.desktop).text, 'проект открывается в Kimi Code щелчком по карточке сессии — в архиве Kimi');
  assert.equal(chatStatus({}, links.mobile).text, 'чат открывается щелчком по карточке сессии');
  assert.equal(chatStatus({ note: 'продолжить: `kimi -S s1` в терминале проекта' }, null).text, 'продолжить: `kimi -S s1` в терминале проекта');
  // Without a click: an app link opens on every device, a web page only on a computer.
  assert.deepEqual([opensByItself(links.desktop, 0), opensByItself(links.mobile, 0), opensByItself(links.mobile, 5), opensByItself('codex://threads/t1', 5)], [true, true, false, true]);
});

test('an awaited session is found by its key, or as the newest of the provider created after the request', () => {
  const row = (key: string, provider: string, createdAt: string) => ({ key, provider, createdAt }) as never;
  const tree = [{ id: 'p1', sessions: [row('codex:new', 'codex', '2026-11-07T19:00:10Z'), row('claude:a', 'claude', '2026-11-07T19:00:20Z'), row('codex:old', 'codex', '2026-11-07T18:00:00Z')] }] as never;
  const since = Date.parse('2026-11-07T19:00:00Z');
  assert.equal(arrivedSession(tree, { projectId: 'p1', key: 'claude:a', provider: null, since })?.session.key, 'claude:a');
  assert.equal(arrivedSession(tree, { projectId: 'p1', key: null, provider: 'codex', since })?.session.key, 'codex:new');
  assert.equal(arrivedSession(tree, { projectId: 'p1', key: null, provider: 'codex', since: since + 60_000 }), null, 'older sessions do not count');
  assert.equal(arrivedSession(tree, { projectId: 'p1', key: 'codex:missing', provider: null, since }), null);
  assert.equal(arrivedSession(tree, { projectId: 'other', key: 'claude:a', provider: null, since }), null);
});


test('a reviewer session of either provider is not listed and not counted (M4 13.4)', () => {
  const st = { ...state(), reviews: { projects: { p1: [{ mainKey: 'claude:c1', reviewerKey: 'codex:t1', status: 'reviewing' }] } } };
  const project = projectTree(st, { now: NOW, collapsed: new Set() }).find((p) => p.id === 'p1')!;
  assert.deepEqual(project.sessions.map((s) => s.key), ['claude:c1']);
  assert.equal(project.count, '1 сессия');
  const reverse = { ...state(), reviews: { projects: { p1: [{ mainKey: 'codex:t1', reviewerKey: 'claude:c1', status: 'agreed' }] } } };
  assert.deepEqual(projectTree(reverse, { now: NOW, collapsed: new Set() }).find((p) => p.id === 'p1')!.sessions.map((s) => s.key), ['codex:t1']);
});

test('the panel reloads once when the service version changes (M4 13.5)', async () => {
  const { shouldReload } = await import('../src/reload.js');
  assert.equal(shouldReload(null, '0.4.4', null), false, 'nothing loaded yet');
  assert.equal(shouldReload('0.4.3', '0.4.3', null), false);
  assert.equal(shouldReload('0.4.3', '0.4.4', null), true);
  assert.equal(shouldReload('0.4.3', '0.4.4', '0.4.4'), false, 'no reload loop');
  assert.equal(shouldReload('0.4.3', undefined, null), false);
});


test('a reviewer session is hidden by its reference before the review knows its key (M4 13.9)', () => {
  const st = state();
  (st['providers'] as any).projects.p1.claude.sessions[0].remoteId = 'session_R';
  st['reviews'] = { projects: { p1: [{ mainKey: 'codex:t1', reviewerKey: null, reviewerProvider: 'claude', reviewerRef: { localId: 'session_R', remoteId: 'session_R' }, status: 'starting' }] } };
  const project = projectTree(st, { now: NOW, collapsed: new Set() }).find((p) => p.id === 'p1')!;
  assert.deepEqual(project.sessions.map((s) => s.key), ['codex:t1']);
  assert.equal(project.count, '1 сессия');
  const codexRef = { ...state(), reviews: { projects: { p1: [{ mainKey: 'claude:c1', reviewerKey: null, reviewerProvider: 'codex', reviewerRef: { localId: 't1', remoteId: null }, status: 'starting' }] } } };
  assert.deepEqual(projectTree(codexRef, { now: NOW, collapsed: new Set() }).find((p) => p.id === 'p1')!.sessions.map((s) => s.key), ['claude:c1']);
});

test('the GitHub line: published, ready with the button, or why it waits; nothing without an upstream', async () => {
  const { commitsLabel, publicationView } = await import('../src/publication.js');
  assert.deepEqual([1, 3, 5, 11, 21, 24].map(commitsLabel), ['1 коммит', '3 коммита', '5 коммитов', '11 коммитов', '21 коммит', '24 коммита']);
  const st = (entry: unknown) => ({ publication: { projects: { p1: entry } } });
  assert.equal(publicationView({}, 'p1'), null);
  assert.equal(publicationView(st({ status: 'none' }), 'p1'), null);
  assert.equal(publicationView(st({ status: 'up-to-date', branch: 'main', upstream: 'origin/main', ahead: 0 }), 'p1')!.button, null);
  assert.equal(publicationView(st({ status: 'ready', ahead: 3 }), 'p1')!.button, 'Опубликовать на GitHub (3 коммита)');
  const waits = publicationView(st({ status: 'blocked', ahead: 2, reason: 'Scope открыт — опубликовать можно после приёмки и закрытия' }), 'p1')!;
  assert.deepEqual([waits.button, waits.text], [null, 'Неопубликованных коммитов: 2 · Scope открыт — опубликовать можно после приёмки и закрытия']);
});
