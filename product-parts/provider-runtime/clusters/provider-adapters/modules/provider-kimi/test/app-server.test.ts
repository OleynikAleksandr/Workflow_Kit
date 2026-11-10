// The server of the Kimi Code app as the only server (spec M9 section 2.1): while the app runs,
// Kit creates workspaces and sessions through it, so the app sees them at once, and starts no
// kimi web of its own; it moves to the app when the app comes up and back when it is gone.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProviderError } from '#provider-registry';
import { REMOTE_OFF_ACTION, REMOTE_ON_ACTION } from '../src/remote.ts';
import type { Liveness } from '../src/locks.ts';
import { APP_SERVER_NOTE, APP_SERVER_REASON, RESTART_ACTION } from '../src/provider.ts';
import { withSessions } from './fake-sessions.ts';

const KIT_TURN = 777;
const via = (requests: Array<{ via?: string; method: string; url: string }>, server: 'kit' | 'app', on: RegExp): number =>
  requests.filter((request) => request.via === server && on.test(`${request.method} ${request.url}`)).length;

test('while the app runs, trust, the session, its first message and the list go to the server of the app', async () => {
  await withSessions(async ({ machine, project, provider }) => {
    await machine.startApp(Date.now() - 60_000);
    const status = await provider.refresh!();
    assert.equal(status.state, 'ready');
    assert.equal(status.details?.['server'], 'app');
    assert.match(status.note ?? '', new RegExp(APP_SERVER_NOTE));

    // The steps of the wizard: trust after a preview, then the first session.
    const preview = await provider.previewTrust(project);
    assert.deepEqual(await provider.grantTrust(project, preview.token), { trusted: true });
    const info = await provider.createSession!(project, { title: 'Первая', firstMessage: 'Привет' });
    assert.equal(info.state, 'running');
    const { requests } = machine.api;
    assert.equal(machine.spawned.length, 0, 'no kimi web of Kit');
    assert.equal(via(requests, 'app', /^POST \/api\/v1\/workspaces$/), 1, 'the app knows the workspace it serves');
    assert.equal(via(requests, 'app', /^POST \/api\/v1\/sessions$/), 1);
    assert.equal(via(requests, 'app', /^POST \/api\/v1\/sessions\/[^/]+\/prompts$/), 1, 'the first message is a prompt of the app server');
    assert.equal(requests.filter((request) => request.via === 'kit').length, 0);
    assert.deepEqual((await provider.listSessions(project)).map((session) => session.localId), [info.localId]);
  });
});

test('the app comes up while the server of Kit runs: Kit moves to it once the turns of its server ended', async () => {
  const turns = new Set<number>();
  const liveness: Liveness = { pidAlive: (pid) => pid === process.pid || turns.has(pid), bootTime: () => 0, hostname: () => 'this-host' };
  await withSessions(async ({ machine, api, project, provider, runtime, workspace }) => {
    await provider.refresh!();
    await runtime.requireReady();
    assert.equal(machine.spawned.length, 1);
    const session = api.add({ workspace: workspace(project.path), cwd: project.path, title: 'Ход' });

    await machine.startApp();
    // A turn of the server of Kit holds its lock: the server is kept, new requests go to the app.
    await api.lock(session.id, { pid: KIT_TURN, startedAt: Date.now() });
    turns.add(KIT_TURN);
    assert.equal(await provider.maintain!(), null);
    assert.ok(await runtime.server.own(), 'the turn is not cut');
    assert.equal(runtime.server.owner(), 'app');
    assert.equal((await provider.status()).details?.['server'], 'app');

    // A turn of the app itself does not hold the server of Kit.
    await api.lock(session.id, { pid: process.pid, startedAt: Date.now() });
    assert.equal(await provider.maintain!(), 'server of Kit stopped: the Kimi Code app serves the Kimi sessions');
    assert.equal(await runtime.server.own(), null);
    assert.equal(machine.seen('POST', '/api/v1/shutdown').length, 1);
    assert.equal(await provider.maintain!(), null);
    assert.equal(machine.spawned.length, 1, 'nothing is started while the app serves');
  }, { liveness });
});

test('the app is gone: the next request and the upkeep start the server of Kit again', async () => {
  await withSessions(async ({ machine, project, provider, runtime }) => {
    const stop = await machine.startApp();
    await provider.refresh!();
    await provider.createSession!(project, { title: 'С приложением' });
    assert.equal(machine.spawned.length, 0);
    await stop();
    await runtime.requireReady();
    assert.equal(machine.spawned.length, 1);
    assert.equal(runtime.server.owner(), 'kit');
    assert.equal((await provider.status()).details?.['server'], 'kit');
    assert.doesNotMatch((await provider.status()).note ?? '', new RegExp(APP_SERVER_NOTE));
  });
});

test('with the server of the app the server and Remote Control actions are off; the mobile link is read from it', async () => {
  await withSessions(async ({ machine, api, project, provider, runtime, workspace }) => {
    await machine.startApp();
    api.remote.enabled = true;
    await provider.refresh!();
    const actions = await provider.actions!(null);
    for (const id of [RESTART_ACTION, REMOTE_ON_ACTION, REMOTE_OFF_ACTION]) {
      const action = actions.find((item) => item.id === id);
      assert.equal(action?.enabled, false, id);
      assert.equal(action?.reason, APP_SERVER_REASON, id);
    }
    for (const id of [RESTART_ACTION, REMOTE_ON_ACTION, REMOTE_OFF_ACTION]) {
      await assert.rejects(provider.runAction!(id, null), (error: unknown) => error instanceof ProviderError && error.code === 'kimi-app-server' && error.status === 409);
    }
    assert.equal(machine.seen('POST', '/api/v1/remote-control').length, 0, 'Remote Control of the app is never changed');
    await runtime.requireReady();
    api.add({ workspace: workspace(project.path), cwd: project.path, title: 'Телефон' });
    const [session] = await provider.listSessions(project);
    assert.equal(session?.links.mobile, api.remote.url);
    assert.equal(machine.spawned.length, 0);
  });
});
