// Provider wiring of the app. Stub behaviour (labels, 501, not-implemented operations, hook journal)
// is checked on injected stub providers, so the test does not depend on whether the real Claude
// and Codex providers are implemented; for DEFAULT_PROVIDERS only registration and the state
// section are checked.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { recordSessionStart } from '#kit-structure';
import type { Operation } from '#data-store';
import type { CommandRunner } from '#process-supervisor';
import { createProviderRegistry, createStubProvider } from '#provider-registry';
import type { ProjectRegistry } from '#project-registry';
import type { ProvidersSection } from '#provider-registry';
import { DEFAULT_PROVIDERS, createApp } from '../src/index.ts';
import type { App } from '../src/index.ts';
import { AUTOSTART_ATTEMPTS, wireProviderLifecycle } from '../src/provider-lifecycle.ts';

let tmp = '';
let app: App;
let base = '';

/** Stand-ins for claude and codex that stay stubs whatever T006/T007 implement. */
const STUB_PROVIDERS = [
  () => createStubProvider({ id: 'claude', title: 'Claude', task: 'T006' }),
  () => createStubProvider({ id: 'codex', title: 'Codex', task: 'T007' }),
];

/** No external program is ever started by these tests. */
const noPrograms: CommandRunner = async () => ({
  code: null,
  signal: null,
  stdout: '',
  stderr: '',
  timedOut: false,
  startError: 'ENOENT',
});

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-app-prov-'));
  app = await createApp({
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' },
    homedir: tmp,
    getInterfaces: () => ({}),
    runCommand: noPrograms,
    providers: STUB_PROVIDERS,
  });
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

async function getState(from = base): Promise<{ providers: ProvidersSection; operations: { operations: Operation[] } }> {
  return (await (await fetch(`${from}/api/state`)).json()) as { providers: ProvidersSection; operations: { operations: Operation[] } };
}

test('DEFAULT_PROVIDERS register claude and codex, each with a state section for the system and each project', async () => {
  assert.equal(DEFAULT_PROVIDERS.length, 2);
  const real = await createApp({
    env: { WFK_DATA_DIR: path.join(tmp, 'defaults'), WFK_PORT: '0' },
    homedir: tmp,
    getInterfaces: () => ({}),
    runCommand: noPrograms,
  });
  try {
    assert.deepEqual(real.providers.ids(), ['claude', 'codex']);
    const project = await real.projects.create('Defaults');
    const realBase = `http://127.0.0.1:${(await real.start()).port}`;
    const state = await getState(realBase);
    assert.deepEqual(state.providers.providers.map((p) => p.id), ['claude', 'codex']);
    for (const summary of state.providers.providers) {
      assert.equal(typeof summary.title, 'string');
      assert.equal(typeof summary.capabilities, 'object');
      assert.ok(summary.status !== null || Object.keys(summary.errors).length > 0, `${summary.id}: no status and no error`);
    }
    const entry = state.providers.projects[project.id]!;
    assert.deepEqual(Object.keys(entry), ['claude', 'codex']);
    for (const id of ['claude', 'codex']) assert.ok(Array.isArray(entry[id]!.sessions), `${id}: sessions list`);
  } finally {
    await real.stop();
  }
});

test('stub providers are shown as "не реализовано" for the system and for each project', async () => {
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
  assert.deepEqual(entry['codex']!.sessions, []);
  assert.ok(Array.isArray(state.operations.operations));
});

test('sessions started in the project folder appear in /api/state from the hook journal', async () => {
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

test('an archive stops the sessions before a removal; a restore brings them back; a session archive goes to its provider', async () => {
  const calls: string[] = [];
  let state: 'running' | 'stopped' = 'running';
  const custom = await createApp({
    env: { WFK_DATA_DIR: path.join(tmp, 'archive'), WFK_PORT: '0' },
    homedir: tmp,
    getInterfaces: () => ({}),
    providers: [
      () => ({
        ...createStubProvider({ id: 'claude', title: 'Claude', task: 'T000' }),
        listSessions: async () => [{ provider: 'claude', localId: 'm1', title: 'Живая', createdAt: '', origin: 'panel' as const, state, links: {} }],
        archiveSessions: async (_project, sid) => {
          calls.push(`archive:${sid ?? '*'}`);
          state = 'stopped';
          return ['m1'];
        },
        restoreSessions: async (_project, sid) => {
          calls.push(`restore:${sid ?? '*'}`);
          state = 'running';
          return ['m1'];
        },
      }),
    ],
  });
  const project = await custom.projects.create('Archived');
  await custom.projects.archive(project.id);
  assert.deepEqual(calls, ['archive:*'], 'the archive waits for the stop');
  await custom.projects.restore(project.id);
  for (let i = 0; i < 50 && calls.length < 2; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(calls, ['archive:*', 'restore:*']);
  await custom.titles.setArchived(project.id, 'claude:m1', true);
  assert.deepEqual(calls.slice(2), ['archive:m1']);
  await custom.projects.archive(project.id);
  await custom.projects.remove(project.id);
});

test('the start of the service runs autostart and tries a failure again, at most AUTOSTART_ATTEMPTS times', async () => {
  const projects = {
    addRemoveGuard: () => undefined,
    addRemovedHook: () => undefined,
    addArchivedHook: () => undefined,
    list: async () => [],
    get: async () => undefined,
  } as unknown as ProjectRegistry;
  const run = async (failures: number): Promise<{ tries: number; lines: string[] }> => {
    const providers = createProviderRegistry();
    let tries = 0;
    providers.register({
      ...createStubProvider({ id: 'codex', title: 'Codex', task: 'T000' }),
      autostart: async () => {
        tries += 1;
        if (tries <= failures) throw new Error('network is not ready');
        return 'daemon started';
      },
    });
    const lines: string[] = [];
    wireProviderLifecycle({ projects, providers, log: (line) => void lines.push(line), autostartPauseMs: 5 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { tries, lines };
  };
  const recovered = await run(1);
  assert.equal(recovered.tries, 2);
  assert.ok(recovered.lines.includes('providers: autostart codex: daemon started'));
  assert.ok(recovered.lines.some((l) => /codex could not autostart \(attempt 1 of 3\): network is not ready/.test(l)));
  const failing = await run(10);
  assert.equal(failing.tries, AUTOSTART_ATTEMPTS);
});

