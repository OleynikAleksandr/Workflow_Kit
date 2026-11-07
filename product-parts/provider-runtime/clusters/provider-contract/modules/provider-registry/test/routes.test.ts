import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createEventLog, createKeyedMutex, createOperations } from '#data-store';
import type { Operation, Operations } from '#data-store';
import { HttpError, createRouter, createStateRegistry } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import { createProjectRegistry } from '#project-registry';
import type { Project, ProjectRegistry } from '#project-registry';
import { createProviderRegistry, defaultSessionTitle, registerProviderRoutes } from '../src/index.ts';
import type { ProviderRegistry, ProvidersSection, TrustPreview } from '../src/index.ts';
import { createFakeProvider } from './fake-provider.ts';
import type { FakeProvider } from './fake-provider.ts';

let tmp = '';
let router: Router;
let state: StateRegistry;
let ops: Operations;
let projects: ProjectRegistry;
let registry: ProviderRegistry;
let fake: FakeProvider;
let bare: FakeProvider;
let alpha: Project;
let eventsPath = '';

before(async () => {
  tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'wfk-prov-')));
  eventsPath = path.join(tmp, 'data', 'events.jsonl');
  const events = createEventLog({ file: eventsPath });
  const mutex = createKeyedMutex();
  router = createRouter();
  state = createStateRegistry();
  ops = createOperations();
  projects = createProjectRegistry({ file: path.join(tmp, 'data', 'projects.json'), projectsRoot: '~/P', homedir: tmp, platform: process.platform, events, mutex });
  registry = createProviderRegistry({ readTimeoutMs: 100 });
  fake = createFakeProvider('fake');
  bare = createFakeProvider('bare', { withOptional: false });
  registry.register(fake);
  registry.register(bare);
  registerProviderRoutes({ router, state, registry, projects, operations: ops, mutex, events, platform: process.platform });
  alpha = await projects.create('Alpha');
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

interface Answer {
  status: number;
  body: Record<string, unknown>;
}

async function call(method: string, url: string, body?: unknown): Promise<Answer> {
  const [pathname, search] = url.split('?');
  const match = router.match(method, pathname!);
  if (match.kind !== 'found') return { status: match.kind === 'not-found' ? 404 : 405, body: {} };
  try {
    const value = await match.handler({
      method,
      path: pathname!,
      query: new URLSearchParams(search ?? ''),
      params: match.params,
      body,
      req: {} as IncomingMessage,
      res: {} as ServerResponse,
    });
    if (typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'json') {
      const result = value as { status: number; body: Record<string, unknown> };
      return { status: result.status, body: result.body };
    }
    return { status: 200, body: value as Record<string, unknown> };
  } catch (error) {
    if (error instanceof HttpError) return { status: error.status, body: { error: { ...error.details, code: error.code, message: error.message } } };
    throw error;
  }
}

function errorCode(answer: Answer): string | undefined {
  return (answer.body['error'] as { code?: string } | undefined)?.code;
}

async function finished(answer: Answer): Promise<Operation> {
  assert.equal(answer.status, 202);
  return ops.wait(answer.body['operationId'] as string);
}

async function eventTypes(): Promise<string[]> {
  const text = await readFile(eventsPath, 'utf8').catch(() => '');
  return text
    .trim()
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => (JSON.parse(l) as { type: string }).type);
}

const base = (): string => `/api/projects/${alpha.id}/providers/fake`;

test('trust: preview gives a token; only that token is accepted; the grant is journaled', async () => {
  const preview = await call('GET', `${base()}/trust/preview`);
  assert.equal(preview.status, 200);
  const token = (preview.body as unknown as TrustPreview).token;
  assert.ok(token.length > 10);
  assert.equal(errorCode(await call('POST', `${base()}/trust`, {})), 'invalid-body');

  const wrong = await finished(await call('POST', `${base()}/trust`, { token: 'forged' }));
  assert.equal(wrong.status, 'failed');
  assert.deepEqual(wrong.error, { code: 'invalid-token', message: 'Предпросмотр устарел', hint: 'Откройте предпросмотр снова' });

  const fresh = (await call('GET', `${base()}/trust/preview`)).body as unknown as TrustPreview;
  for (const choices of [[], 'allow', { imports: 1 }, { 'bad id': 'allow' }, { imports: '' }]) {
    assert.equal(errorCode(await call('POST', `${base()}/trust`, { token: fresh.token, choices })), 'invalid-body');
  }
  const granted = await finished(await call('POST', `${base()}/trust`, { token: fresh.token, choices: { 'external-imports': 'deny' } }));
  assert.equal(granted.status, 'succeeded');
  assert.deepEqual(granted.result, { trusted: true, backup: '/backups/x' });
  assert.deepEqual(fake.choices.at(-1), { 'external-imports': 'deny' }, 'the answers reach grantTrust as they are');
  assert.deepEqual(fake.choices[0], {}, 'no choices in the body: an empty object');
  assert.deepEqual(granted.scope, { provider: 'fake', project: alpha.id });
  const types = await eventTypes();
  assert.ok(types.includes('provider.trust.granted'));
  assert.ok(types.includes('provider.operation.failed'));
});

test('hooks: approval needs command and hash; a provider without approveHooks answers not-supported', async () => {
  assert.equal(errorCode(await call('POST', `${base()}/hooks/approve`, { command: 'wfk hook' })), 'invalid-body');
  const approved = await finished(await call('POST', `${base()}/hooks/approve`, { command: 'wfk hook', hash: 'sha256:1' }));
  assert.equal(approved.status, 'succeeded');
  assert.ok(fake.calls.includes('approveHooks:sha256:1'));
  const unsupported = await call('POST', `/api/projects/${alpha.id}/providers/bare/hooks/approve`, { command: 'c', hash: 'h' });
  assert.equal(unsupported.status, 409);
  assert.equal(errorCode(unsupported), 'not-supported');
  assert.ok((await eventTypes()).includes('provider.hooks.approved'));
});

test('sessions: a repeated create during the operation returns the same operation; other actions wait for the mutex', async () => {
  fake.block();
  const first = await call('POST', `${base()}/sessions`, {});
  const second = await call('POST', `${base()}/sessions`, {});
  assert.equal(first.status, 202);
  assert.equal(second.body['operationId'], first.body['operationId']);
  assert.equal(second.body['existing'], true);
  await new Promise((resolve) => setImmediate(resolve));
  const preview = (await call('GET', `${base()}/trust/preview`)).body as unknown as TrustPreview;
  const trust = await call('POST', `${base()}/trust`, { token: preview.token });
  assert.equal(trust.body['existing'], false);
  assert.equal(ops.get(trust.body['operationId'] as string)?.progress, 'ожидание очереди');
  assert.equal(fake.calls.filter((c) => c.startsWith('grantTrust')).length, 2, 'grantTrust waits for the session');
  fake.release();
  const created = await finished(first);
  assert.equal(created.status, 'succeeded');
  assert.equal(fake.calls.filter((c) => c.startsWith('createSession')).length, 1);
  assert.match(fake.calls.find((c) => c.startsWith('createSession'))!, /^createSession:Alpha · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal((await finished(trust)).status, 'succeeded');
  const titled = await finished(await call('POST', `${base()}/sessions`, { title: '  Мой план ' }));
  assert.equal((titled.result as { title: string }).title, 'Мой план');
  assert.equal(errorCode(await call('POST', `${base()}/sessions`, { title: 5 })), 'invalid-body');
  assert.ok((await eventTypes()).includes('provider.session.created'));
  assert.equal(defaultSessionTitle({ name: 'X' }, new Date(2026, 0, 2, 3, 4)), 'X · 2026-01-02 03:04');
});

test('sessions: resume and stop go through the contract and validate the id', async () => {
  const sid = fake.sessions[0]!.localId;
  const stopped = await finished(await call('POST', `${base()}/sessions/${sid}/stop`, {}));
  assert.equal(stopped.status, 'succeeded');
  assert.deepEqual(stopped.result, { session: sid });
  assert.equal(fake.sessions[0]!.state, 'stopped');
  const resumed = await finished(await call('POST', `${base()}/sessions/${sid}/resume`, {}));
  assert.equal((resumed.result as { state: string }).state, 'running');
  const missing = await finished(await call('POST', `${base()}/sessions/nope/resume`, {}));
  assert.equal(missing.error?.code, 'not-found');
  assert.equal(errorCode(await call('POST', `${base()}/sessions/${encodeURIComponent('a b')}/stop`, {})), 'invalid-session');
  assert.equal(errorCode(await call('POST', `/api/projects/${alpha.id}/providers/bare/sessions/${sid}/stop`, {})), 'not-supported');
  const types = await eventTypes();
  assert.ok(types.includes('provider.session.stopped') && types.includes('provider.session.resumed'));
});

test('actions: listed and enabled actions run as operations, others are refused', async () => {
  const done = await finished(await call('POST', '/api/providers/fake/actions/daemon-start', {}));
  assert.equal(done.status, 'succeeded');
  assert.ok(fake.calls.includes('runAction:daemon-start:-'));
  const disabled = await call('POST', '/api/providers/fake/actions/daemon-stop', {});
  assert.equal(disabled.status, 409);
  assert.deepEqual(disabled.body['error'], { hint: 'демон не запущен', code: 'action-disabled', message: 'Fake: «Остановить демон» сейчас недоступно' });
  assert.equal(errorCode(await call('POST', '/api/providers/fake/actions/env-start', {})), 'unknown-action');
  const project = await finished(await call('POST', `${base()}/actions/env-start`, {}));
  assert.equal(project.status, 'succeeded');
  assert.ok(fake.calls.includes('runAction:env-start:Alpha'));
  assert.ok((await eventTypes()).includes('provider.action.completed'));
});

test('refresh runs provider refresh as one operation', async () => {
  const answer = await call('POST', '/api/refresh', {});
  const done = await finished(answer);
  assert.equal(done.status, 'succeeded');
  assert.equal((done.result as Record<string, unknown>)['bare'] !== undefined, true);
  assert.ok(fake.calls.includes('refresh'));
  assert.ok((await eventTypes()).includes('providers.refreshed'));
});

test('unknown provider, unknown project and a missing folder are refused before any operation', async () => {
  assert.equal(errorCode(await call('GET', `/api/projects/${alpha.id}/providers/nope/trust/preview`)), 'unknown-provider');
  assert.equal(errorCode(await call('POST', '/api/projects/zzz/providers/fake/sessions', {})), 'not-found');
  const ghost = await projects.open(await mkdtemp(path.join(tmp, 'ghost-')));
  await rm(ghost.project.path, { recursive: true });
  assert.equal(errorCode(await call('POST', `/api/projects/${ghost.project.id}/providers/fake/sessions`, {})), 'project-missing');
  await projects.remove(ghost.project.id);
  assert.equal(errorCode(await call('POST', `${base()}/trust`, [1])), 'invalid-body');
});

test('the "providers" state section collects every provider and project; failures stay local', async () => {
  fake.failHooks = true;
  bare.slow = true;
  const section = (await state.collect())['providers'] as ProvidersSection;
  fake.failHooks = false;
  bare.slow = false;
  assert.deepEqual(section.providers.map((p) => p.id), ['fake', 'bare']);
  assert.equal(section.providers[0]!.status?.label, 'готов');
  assert.equal(section.providers[0]!.capabilities['environment']?.reason, 'нет expect');
  assert.deepEqual(section.providers[0]!.actions.map((a) => a.id), ['daemon-start', 'daemon-stop']);
  const entry = section.projects[alpha.id]!;
  assert.deepEqual(entry['fake']!.errors['hooks'], { code: 'broken', message: 'hooks.json повреждён', hint: 'исправьте файл' });
  assert.equal(entry['fake']!.hooks, null);
  assert.equal(entry['fake']!.sessions.length, 2);
  assert.equal(entry['bare']!.errors['sessions']?.code, 'timeout');
  const one = await call('GET', base());
  assert.equal(one.status, 200);
  assert.equal((one.body['sessions'] as unknown[]).length, 2);
  const list = await call('GET', '/api/providers');
  assert.equal((list.body['providers'] as unknown[]).length, 2);
});

test('removeBlockers lists running sessions and provider blockers', async () => {
  const reasons = await registry.removeBlockers(alpha);
  assert.ok(reasons.some((r) => /^Fake: работает сессия/.test(r)));
  assert.ok(reasons.includes('Fake: работает окружение'));
  assert.throws(() => registry.register(createFakeProvider('fake')), /already registered/);
  assert.throws(() => registry.register(createFakeProvider('Bad Id')), /Invalid provider id/);
});

test('forgetProjects asks every provider that keeps records; a failure stays with its provider', async () => {
  const own = createProviderRegistry();
  const keeper = createFakeProvider('keeper');
  const broken = createFakeProvider('broken');
  const plain = createFakeProvider('plain', { withOptional: false });
  own.register(keeper);
  own.register(broken);
  own.register(plain);
  const result = await own.forgetProjects(new Set(['p1']));
  assert.equal(result.dropped, 2);
  assert.deepEqual(Object.keys(result.errors), ['broken']);
  assert.deepEqual(keeper.kept, [['p1']]);
});

test('resumeInterrupted collects resumed sessions per provider and project; a failure stays local', async () => {
  const own = createProviderRegistry();
  own.register(createFakeProvider('keeper'));
  own.register(createFakeProvider('broken'));
  own.register(createFakeProvider('plain', { withOptional: false }));
  const result = await own.resumeInterrupted([alpha]);
  assert.deepEqual(result.resumed, [`keeper:${alpha.id}-s1`]);
  assert.deepEqual(Object.keys(result.errors), [`broken:${alpha.id}`]);
});

test('setArchived goes to every provider for a project and to the owner only for a session key', async () => {
  const own = createProviderRegistry();
  const keeper = createFakeProvider('keeper');
  const broken = createFakeProvider('broken');
  own.register(keeper);
  own.register(broken);
  own.register(createFakeProvider('plain', { withOptional: false }));
  const project = await own.setArchived(alpha, null, true);
  assert.deepEqual(project.changed, ['keeper:s1']);
  assert.deepEqual(Object.keys(project.errors), ['broken']);
  const session = await own.setArchived(alpha, 'keeper:abc', false);
  assert.deepEqual(session, { changed: ['keeper:abc'], errors: {} });
  assert.deepEqual(keeper.calls, ['archive:*', 'restore:abc']);
  assert.deepEqual(broken.calls, ['archive:*']);
});

test('autostart collects the lines of the providers that started something; a failure stays with its provider', async () => {
  const own = createProviderRegistry();
  own.register(createFakeProvider('keeper'));
  own.register(createFakeProvider('broken'));
  own.register(createFakeProvider('quiet'));
  own.register(createFakeProvider('plain', { withOptional: false }));
  const result = await own.autostart();
  assert.deepEqual(result.started, ['keeper: daemon started']);
  assert.deepEqual(Object.keys(result.errors), ['broken']);
});
