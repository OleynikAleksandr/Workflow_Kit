import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import type { Operation } from '#data-store';
import { createProviderRegistry, createStubProvider, hookJournalFile } from '#provider-registry';
import type { Project, ProjectProviderState, ProviderSummary, SessionInfo } from '#provider-registry';
import { cardModel, MATCHES, providerRoutes } from '../src/card-model.js';
import type { CardUi } from '../src/card-model.js';
import { operationKey } from '../src/model.js';

let tmp = '';
let project: Project;

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-cards-'));
  project = { id: 'abc123abc123', name: 'demo', path: tmp, source: 'created', createdAt: '2026-11-05T09:00:00.000Z' };
  const journal = hookJournalFile(tmp);
  await mkdir(path.dirname(journal), { recursive: true });
  const line = (fields: Record<string, unknown>): string =>
    `${JSON.stringify({ transcript_path: null, cwd: tmp, source: 'startup', model: 'opus', permission_mode: null, service: null, ...fields })}\n`;
  await writeFile(journal, line({ time: '2026-11-05T10:00:00.000Z', client: 'claude', session_id: 'hook-1' }));
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const emptyUi: CardUi = { sending: [], dismissed: [], preview: null, message: null };
const projects = (): Array<{ id: string; name: string; path: string; missing: boolean }> => [{ id: project.id, name: project.name, path: project.path, missing: false }];

test('stub providers become two cards with every capability unavailable and hook sessions listed', async () => {
  const registry = createProviderRegistry();
  registry.register(createStubProvider({ id: 'claude', title: 'Claude', task: 'T006' }));
  registry.register(createStubProvider({ id: 'codex', title: 'Codex', task: 'T007' }));
  const section = await registry.section([project]);
  assert.deepEqual(section.providers.map((p) => p.title), ['Claude', 'Codex']);

  const summary = section.providers[0] as ProviderSummary;
  const model = cardModel({
    provider: summary,
    projects: projects(),
    projectId: project.id,
    project: section.projects[project.id]?.['claude'] ?? null,
    operations: [],
    ui: emptyUi,
    maxTouchPoints: 0,
    nowMs: Date.now(),
  });
  assert.equal(model.status.label, 'не реализовано');
  assert.equal(model.status.tone, 'muted');
  assert.ok(model.unavailable.length >= 6);
  assert.ok(model.unavailable.every((u) => u.reason.includes('T006')));
  const p = model.project;
  assert.ok(p);
  assert.equal(p.trust.label, 'неизвестно');
  assert.equal(p.trust.preview.disabled, true);
  assert.match(p.trust.preview.reason ?? '', /T006/);
  assert.equal(p.sessions.create.disabled, true);
  assert.equal(p.sessions.list.length, 1, 'the hook session is visible before the provider is implemented');
  const session = p.sessions.list[0];
  assert.equal(session?.id, 'hook-1');
  assert.equal(session?.origin, 'из приложения');
  assert.equal(session?.link, null);
  assert.match(session?.note ?? '', /ссылки нет/);
  assert.equal(session?.resume.shown, false, 'resume is hidden: the stub reports it unavailable but the session is not running');
  assert.equal(session?.resume.disabled, true);
  assert.equal(session?.stop.shown, false);
});

function readyProvider(): ProviderSummary {
  return {
    id: 'acme',
    title: 'Acme',
    status: { implemented: true, state: 'ready', label: 'готов', installed: true, version: '1.2.3', path: '/usr/local/bin/acme', checkedAt: '2026-11-05T10:00:00.000Z', details: { daemon: { running: true } } },
    capabilities: { trust: { available: true }, hooks: { available: true }, createSession: { available: true }, stopSession: { available: true } },
    actions: [{ id: 'login', title: 'Войти', scope: 'provider', enabled: false, reason: 'уже выполнен вход' }],
    errors: {},
  };
}

function session(partial: Partial<SessionInfo>): SessionInfo {
  return { provider: 'acme', localId: 's1', title: 'demo · 2026-11-05 10:00', createdAt: '2026-11-05T10:00:00.000Z', origin: 'panel', state: 'running', links: {}, ...partial };
}

test('a ready provider: links per device, stop locked by its operation, actions with reasons, preview', () => {
  const state: ProjectProviderState = {
    provider: 'acme',
    trust: { trusted: false },
    hooks: { kitHook: { command: 'wfk hook', hash: 'h1', kit: true, status: 'pending' }, hooks: [], complete: false },
    sessions: [
      session({ links: { desktop: 'acme://s/1', mobile: 'https://acme.test/m/1', web: 'https://acme.test/s/1' } }),
      session({ localId: 's2', state: 'stopped', links: {}, note: 'без Remote Control — ссылки нет' }),
    ],
    actions: [{ id: 'env-start', title: 'Запустить окружение', scope: 'project', enabled: true, confirm: 'Запустить?' }],
    errors: { hooks: { code: 'timeout', message: 'нет ответа' } },
  };
  const stopOp: Operation = {
    id: 'op-1',
    key: 'k',
    kind: 'provider.session.stop',
    title: 't',
    scope: { provider: 'acme', project: project.id, session: 's1' },
    status: 'running',
    progress: null,
    startedAt: '2026-11-05T10:00:00.000Z',
    finishedAt: null,
  };
  const ui: CardUi = {
    ...emptyUi,
    sending: [operationKey(MATCHES.create('acme', project.id))],
    preview: {
      provider: 'acme',
      trusted: false,
      writes: [{ file: '~/.acme.json', key: 'projects', description: 'доверие к папке' }],
      autorun: [{ file: '.mcp.json', kind: 'mcp', detail: 'сервер x' }],
      token: 'tok',
      expiresAt: '2026-11-05T10:10:00.000Z',
    },
  };
  const input = { provider: readyProvider(), projects: projects(), projectId: project.id, project: state, operations: [stopOp], ui, nowMs: Date.parse('2026-11-05T10:05:00.000Z') };

  const desktop = cardModel({ ...input, maxTouchPoints: 0 });
  const ipad = cardModel({ ...input, maxTouchPoints: 5 });
  assert.equal(desktop.status.tone, 'ok');
  assert.deepEqual(desktop.status.details, [['daemon.running', 'да']]);
  assert.deepEqual(desktop.actions.map((a) => [a.title, a.button.disabled, a.button.reason]), [['Войти', true, 'уже выполнен вход']]);
  const p = desktop.project;
  assert.ok(p);
  assert.equal(p.sessions.list[0]?.link?.href, 'acme://s/1');
  assert.equal(ipad.project?.sessions.list[0]?.link?.href, 'https://acme.test/m/1');
  assert.equal(p.sessions.list[1]?.link, null);
  assert.equal(p.sessions.list[1]?.note, 'без Remote Control — ссылки нет');
  assert.deepEqual([p.sessions.list[0]?.stop.shown, p.sessions.list[0]?.stop.disabled, p.sessions.list[0]?.stop.progress], [true, true, 'выполняется…']);
  assert.equal(p.sessions.list[1]?.stop.shown, false, 'a stopped session has no stop button');
  assert.equal(p.sessions.list[0]?.resume.shown, false, 'resumeSession is not reported: hidden');
  assert.deepEqual([p.sessions.create.disabled, p.sessions.create.progress], [true, 'отправка…']);
  assert.equal(p.hooks.incomplete, true);
  assert.equal(p.hooks.rows[0]?.approve?.disabled, false);
  assert.deepEqual(p.errors.map((e) => e.label), ['хуки']);
  assert.equal(p.trust.label, 'нет доверия');
  assert.equal(p.trust.previewData?.token, 'tok');
  assert.equal(p.trust.previewData?.expired, false);
  assert.equal(p.trust.grant.disabled, false);
  assert.deepEqual(p.actions.map((a) => [a.id, a.confirm, a.button.disabled]), [['env-start', 'Запустить?', false]]);
  assert.equal(cardModel({ ...input, maxTouchPoints: 0, nowMs: Date.parse('2026-11-05T11:00:00.000Z') }).project?.trust.previewData?.expired, true);
});

test('trust choices: no default answer, "Доверять" waits for required answers; a trusted parent is a mark', () => {
  const state: ProjectProviderState = {
    provider: 'acme',
    trust: { trusted: false, inherited: { from: '/Users/me', note: 'клиент не спросит' } },
    hooks: null,
    sessions: [],
    actions: [],
    errors: {},
  };
  const preview = {
    provider: 'acme',
    trusted: false,
    writes: [{ file: '~/.acme.json', key: 'k', description: 'доверие' }],
    autorun: [],
    choices: [
      {
        id: 'imports',
        title: 'Внешние импорты',
        description: 'импортирует ~/AGENTS.md',
        options: [
          { id: 'allow', title: 'Разрешить' },
          { id: 'deny', title: 'Запретить', description: 'не загружать' },
        ],
        required: true,
      },
      { id: 'extra', title: 'Необязательно', description: '', options: [{ id: 'x', title: 'X' }], required: false },
    ],
    inherited: { from: '/Users/me', note: 'клиент не спросит' },
    token: 'tok',
    expiresAt: '2026-11-05T10:10:00.000Z',
  };
  const model = (choices: Record<string, string>) =>
    cardModel({
      provider: readyProvider(),
      projects: projects(),
      projectId: project.id,
      project: state,
      operations: [],
      ui: { ...emptyUi, preview, choices },
      maxTouchPoints: 0,
      nowMs: Date.parse('2026-11-05T10:05:00.000Z'),
    }).project!.trust;

  const empty = model({});
  assert.deepEqual(empty.inherited, { from: '/Users/me', note: 'клиент не спросит' });
  assert.deepEqual(empty.previewData?.inherited, { from: '/Users/me', note: 'клиент не спросит' });
  assert.deepEqual(empty.previewData?.choices.map((c) => [c.id, c.selected, c.options.map((o) => o.selected)]), [
    ['imports', null, [false, false]],
    ['extra', null, [false]],
  ]);
  assert.equal(empty.grant.disabled, true, 'no answer to a required choice: the grant is locked');
  assert.match(empty.grant.reason ?? '', /«Внешние импорты»/);
  assert.doesNotMatch(empty.grant.reason ?? '', /Необязательно/);
  assert.deepEqual(empty.previewData?.answers, {});
  assert.equal(model({ imports: 'maybe' }).grant.disabled, true, 'an answer that is not an option does not count');

  const answered = model({ imports: 'deny' });
  assert.equal(answered.grant.disabled, false);
  assert.equal(answered.previewData?.choices[0]?.options[1]?.selected, true);
  assert.equal(answered.previewData?.choices[0]?.options[1]?.description, 'не загружать');
  assert.deepEqual(answered.previewData?.answers, { imports: 'deny' });
  assert.equal(answered.previewData?.needsGrant, true);
});

test('no projects: the card shows the provider only; routes are built from ids', () => {
  const model = cardModel({ provider: readyProvider(), projects: [], projectId: null, project: null, operations: [], ui: emptyUi, maxTouchPoints: 0, nowMs: 0 });
  assert.equal(model.project, null);
  assert.deepEqual(model.projects, { list: [], selectedId: null });
  const routes = providerRoutes('acme');
  assert.equal(routes.refresh, '/api/refresh');
  assert.equal(routes.action('log in'), '/api/providers/acme/actions/log%20in');
  const p = routes.project('p1');
  assert.equal(p.preview, '/api/projects/p1/providers/acme/trust/preview');
  assert.equal(p.trust, '/api/projects/p1/providers/acme/trust');
  assert.equal(p.approve, '/api/projects/p1/providers/acme/hooks/approve');
  assert.equal(p.sessions, '/api/projects/p1/providers/acme/sessions');
  assert.equal(p.session('s:1', 'stop'), '/api/projects/p1/providers/acme/sessions/s%3A1/stop');
  assert.equal(p.action('env'), '/api/projects/p1/providers/acme/actions/env');
});
