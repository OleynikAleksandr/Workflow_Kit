import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { recordSessionStart } from '#kit-structure';
import type { Operation } from '#data-store';
import { createStubProvider } from '#provider-registry';
import type { ProvidersSection } from '#provider-registry';
import { DEFAULT_PROVIDERS, createApp } from '../src/index.ts';
import type { App } from '../src/index.ts';

let tmp = '';
let app: App;
let base = '';

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-app-prov-'));
  app = await createApp({ env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' }, homedir: tmp, getInterfaces: () => ({}) });
  base = `http://127.0.0.1:${(await app.start()).port}`;
});

after(async () => {
  await app.stop();
  await rm(tmp, { recursive: true, force: true });
});

async function send(method: string, url: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: { Origin: base, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

async function getState(): Promise<{ providers: ProvidersSection; operations: { operations: Operation[] } }> {
  return (await (await fetch(`${base}/api/state`)).json()) as { providers: ProvidersSection; operations: { operations: Operation[] } };
}

test('claude and codex are registered as "не реализовано" for the system and for each project', async () => {
  assert.equal(DEFAULT_PROVIDERS.length, 2);
  const created = await send('POST', '/api/projects', { name: 'Gamma' });
  const project = created.json['project'] as { id: string };
  const state = await getState();
  assert.deepEqual(state.providers.providers.map((p) => [p.id, p.status?.label]), [
    ['claude', 'не реализовано'],
    ['codex', 'не реализовано'],
  ]);
  const entry = state.providers.projects[project.id]!;
  assert.deepEqual(Object.keys(entry), ['claude', 'codex']);
  assert.deepEqual(entry['claude']!.sessions, []);
  assert.ok(Array.isArray(state.operations.operations));
});

test('Claude sessions started in the project folder appear in /api/state from the hook journal', async () => {
  const created = await send('POST', '/api/projects', { name: 'Delta' });
  const project = created.json['project'] as { id: string; path: string };
  assert.equal((await send('POST', `/api/projects/${project.id}/structure`, {})).status, 200);
  const hook = (client: string, id: string, env: Record<string, string> = {}): Promise<unknown> =>
    recordSessionStart({ client, stdin: JSON.stringify({ session_id: id, cwd: project.path }), env: { CLAUDE_PROJECT_DIR: project.path, ...env }, cwd: tmp });
  await hook('claude', 'desktop-session');
  await hook('claude', 'kit-trust', { WFK_SERVICE_SESSION: 'trust' });
  await hook('codex', 'codex-thread');
  const entry = (await getState()).providers.projects[project.id]!;
  assert.deepEqual(entry['claude']!.sessions.map((s) => [s.localId, s.origin]), [['desktop-session', 'hook']]);
  assert.deepEqual(entry['codex']!.sessions.map((s) => s.localId), ['codex-thread']);
});

test('provider actions of a stub fail as operations with "not-implemented" and are journaled', async () => {
  const project = ((await send('POST', '/api/projects', { name: 'Eps' })).json['project'] as { id: string }).id;
  const preview = await send('GET', `/api/projects/${project}/providers/claude/trust/preview`);
  assert.equal(preview.status, 501);
  assert.equal((preview.json['error'] as { code: string; hint: string }).code, 'not-implemented');
  const started = await send('POST', `/api/projects/${project}/providers/codex/sessions`, {});
  assert.equal(started.status, 202);
  const finished = await app.operations.wait(started.json['operationId'] as string);
  assert.equal(finished.status, 'failed');
  assert.equal(finished.error?.code, 'not-implemented');
  const listed = (await getState()).operations.operations.find((op) => op.id === finished.id);
  assert.equal(listed?.status, 'failed');
  const refresh = await send('POST', '/api/refresh', {});
  assert.equal(refresh.status, 202);
  await app.operations.wait(refresh.json['operationId'] as string);
  const events = await readFile(path.join(tmp, 'data', 'events.jsonl'), 'utf8');
  assert.match(events, /"type":"provider\.operation\.failed"/);
  assert.match(events, /"type":"providers\.refreshed"/);
  assert.equal((await send('POST', `/api/projects/${project}/providers/nope/sessions`, {})).status, 404);
});

test('injected providers replace the defaults; running sessions block removing a project', async () => {
  const custom = await createApp({
    env: { WFK_DATA_DIR: path.join(tmp, 'custom'), WFK_PORT: '0' },
    homedir: tmp,
    getInterfaces: () => ({}),
    providers: [
      () => ({
        ...createStubProvider({ id: 'mock', title: 'Mock', task: 'T000' }),
        listSessions: async () => [
          { provider: 'mock', localId: 'm1', title: 'Живая', createdAt: '', origin: 'panel' as const, state: 'running' as const, links: {} },
        ],
      }),
    ],
  });
  assert.deepEqual(custom.providers.ids(), ['mock']);
  const project = await custom.projects.create('Zeta');
  await assert.rejects(custom.projects.remove(project.id), (error: unknown) => {
    const details = (error as { details?: { blockers?: string[] } }).details;
    return Array.isArray(details?.blockers) && details.blockers[0] === 'Mock: работает сессия «Живая»';
  });
});
