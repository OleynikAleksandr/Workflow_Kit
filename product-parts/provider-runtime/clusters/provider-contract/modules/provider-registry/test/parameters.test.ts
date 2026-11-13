import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { createEventLog, createKeyedMutex, createOperations } from '#data-store';
import { HttpError, createRouter, createStateRegistry } from '#http-server';
import type { Router } from '#http-server';
import { createProjectRegistry } from '#project-registry';
import type { Project } from '#project-registry';
import { ProviderError, createProviderRegistry, registerProviderRoutes, providerCapability } from '../src/index.ts';
import type { Provider, SessionParameters } from '../src/index.ts';
import { createFakeProvider } from './fake-provider.ts';

let tmp: string;
let router: Router;
let fake: Provider;
let alpha: Project;
let beta: Project;
let reads: string[];
let current: SessionParameters;
const params = (value = 'a'): SessionParameters => ({ items: [{ id: 'model', value, label: value, tone: 'primary', inRow: true, title: 'Model' }], context: null, limits: [], style: { font: 'system-ui', ring: 'first' }, editable: true, at: '2026-11-13T12:00:00Z' });
before(async () => { tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'wfk-parameters-'))); });
after(async () => { await rm(tmp, { recursive: true, force: true }); });
beforeEach(async () => {
  router = createRouter();
  const events = createEventLog({ file: path.join(tmp, 'events.jsonl') });
  const mutex = createKeyedMutex();
  const projects = createProjectRegistry({ file: path.join(tmp, 'projects.json'), projectsRoot: '~/P', homedir: tmp, platform: process.platform, events, mutex });
  const listed = await projects.list();
  alpha = listed.find(p => p.name === 'Alpha') ?? await projects.create('Alpha');
  beta = listed.find(p => p.name === 'Beta') ?? await projects.create('Beta');
  fake = createFakeProvider('fake');
  fake.listSessions = async p => p.id === alpha.id
    ? ['s1', 's2'].map(id => ({ provider: 'fake', localId: id, remoteId: `r-${id}`, title: id, createdAt: '', origin: 'panel', state: 'unknown', links: {} }))
    : [{ provider: 'fake', localId: 'other', title: 'Other', createdAt: '', origin: 'panel', state: 'unknown', links: {} }];
  current = params(); reads = [];
  fake.readParameters = async (_p, id) => { reads.push(id); return structuredClone(current); };
  fake.updateParameters = async (_p, _id, change) => (current = params(change.model));
  const registry = createProviderRegistry(); registry.register(fake);
  registerProviderRoutes({ router, state: createStateRegistry(), registry, projects, operations: createOperations(), mutex, events, platform: process.platform });
});
const url = (sid = 's1', project?: string) => `/api/projects/${project ?? alpha.id}/providers/fake/sessions/${sid}/parameters`;
async function call(method = 'GET', sid = 's1', body?: unknown, project?: string) {
  const match = router.match(method, url(sid, project)); assert.equal(match.kind, 'found');
  if (match.kind !== 'found') throw new Error('Route missing');
  try {
    const result = await match.handler({ method, path: url(sid, project), query: new URLSearchParams(), params: match.params, body, req: {} as IncomingMessage, res: {} as ServerResponse });
    return { status: 200, body: result as Record<string, unknown> };
  } catch (error) {
    if (error instanceof HttpError) return { status: error.status, body: { error: { code: error.code, message: error.message, ...error.details } } };
    throw error;
  }
}
test('reads parameters via a remote alias, passing canonical local id', async () => {
  const answer = await call('GET', 'r-s1');
  assert.deepEqual(answer, { status: 200, body: { supported: true, parameters: current } });
  assert.deepEqual(reads, ['s1']);
});
test('ownership checked before methods including unsupported providers', async () => {
  for (const method of ['GET', 'POST']) {
    const answer = await call(method, 'other', { change: { model: 'b' } });
    assert.equal(answer.status, 404); assert.equal((answer.body.error as { code: string }).code, 'unknown-session');
  }
  assert.deepEqual(reads, []);
  delete fake.readParameters; delete fake.updateParameters;
  assert.equal((await call('GET', 'other')).status, 404);
  assert.deepEqual((await call()).body, { supported: false });
  assert.equal((await call('POST', 's1', { change: { model: 'b' } })).status, 404);
  assert.deepEqual((await call('GET', 'other', undefined, beta.id)).body, { supported: false });
});
test('invalid bodies are rejected without provider mutations', async () => {
  let calls = 0; fake.updateParameters = async () => { calls++; return current; };
  for (const body of [null, {}, [], { change: {} }, { change: { confirmed: true } }, { change: { model: 1 } }, { change: { model: '' } }, { change: { model: 'x'.repeat(129) } }, { change: { surprise: 'x' } }, { change: { model: 'b', confirmed: 'yes' } }, { change: { model: 'b' }, extra: true }]) {
    assert.equal((await call('POST', 's1', body)).status, 400);
  }
  assert.equal(calls, 0);
});
test('provider errors preserve confirm and hints with specified HTTP statuses', async () => {
  for (const [code, status] of [['parameter-invalid', 400], ['confirmation-required', 409], ['parameters-unavailable', 503]] as const) {
    fake.updateParameters = async () => { throw new ProviderError(code, 'Reason', { hint: 'Hint', details: { confirm: 'Continue?' } }); };
    const answer = await call('POST', 's1', { change: { model: 'b', confirmed: true } });
    assert.equal(answer.status, status);
    assert.deepEqual(answer.body.error, { code, message: 'Reason', hint: 'Hint', confirm: 'Continue?' });
  }
});
test('same-session changes queue by canonical id; different sessions proceed', async () => {
  const entered: string[] = [];
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const firstStarted = new Promise<void>(resolve => { started = resolve; });
  fake.updateParameters = async (_p, id, change) => {
    entered.push(`${id}:${change.model}`);
    if (change.model === 'first') { started(); await gate; }
    return params(change.model);
  };
  const first = call('POST', 'r-s1', { change: { model: 'first' } }); await firstStarted;
  const second = call('POST', 's1', { change: { model: 'second' } });
  await call('POST', 's2', { change: { model: 'independent' } });
  assert.deepEqual(entered, ['s1:first', 's2:independent']);
  release(); await Promise.all([first, second]);
  assert.deepEqual(entered, ['s1:first', 's2:independent', 's1:second']);
});
test('successful edits journal old/new effective values', async () => {
  await call('POST', 'r-s1', { change: { model: 'journal-value' } });
  const events = (await readFile(path.join(tmp, 'events.jsonl'), 'utf8')).trim().split('\n').map(l => JSON.parse(l));
  const changed = events.findLast(e => e.type === 'provider.parameters.changed' && e.new === 'journal-value');
  assert.ok(changed);
  assert.deepEqual({ provider: changed.provider, project: changed.project, session: changed.session, parameter: changed.parameter, old: changed.old, new: changed.new },
    { provider: 'fake', project: alpha.id, session: 's1', parameter: 'model', old: 'a', new: 'journal-value' });
  assert.deepEqual(reads, ['s1']);
});
test('new capabilities require explicit opt-in, legacy ones keep availability', async () => {
  for (const name of ['sessionParameters', 'updateParameters']) assert.equal((await providerCapability(fake, name)).available, false);
  assert.equal((await providerCapability(fake, 'unmentioned-legacy')).available, true);
});

test('access writes accept opaque ids, reject legacy mixing, and audit the effective preset fields', async () => {
  const withAccess = (value: string): SessionParameters => ({ ...params(), notes: ['Одобрения: on-request', `Проверяющий: ${value === 'auto' ? 'auto_review' : 'user'}`], presentation: { layout: 'effort-card', access: { value, label: value, tone: 'primary' } } });
  current = withAccess('ask'); let mutations = 0;
  fake.updateParameters = async (_p, _id, change) => { mutations++; assert.equal(change.access, 'auto'); return current = withAccess('auto'); };
  assert.equal((await call('POST', 's1', { change: { access: 'auto', permissions: ':workspace' } })).status, 400);
  assert.equal((await call('POST', 's1', { change: { access: 1 } })).status, 400);
  assert.equal(mutations, 0);
  assert.equal((await call('POST', 'r-s1', { change: { access: 'auto' } })).status, 200);
  const events = (await readFile(path.join(tmp, 'events.jsonl'), 'utf8')).trim().split('\n').map(l => JSON.parse(l));
  const event = events.findLast(e => e.parameter === 'access' && e.new === 'auto');
  assert.equal(event.old, 'ask'); assert.deepEqual(event.fields.approvalsReviewer, { old: 'user', new: 'auto_review' });
});
