// The workspace of a folder and its trust: read from the files only, written through the API and
// read back. The fake machine works on every OS.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { ProviderError } from '#provider-registry';
import { createKimiRuntime } from '../src/provider.ts';
import { folderTrusted, workspaceKey } from '../src/workspace.ts';
import { fakeKimi } from './helpers.ts';
import type { FakeKimi } from './helpers.ts';

const FAST = { startWaitMs: 2000, stopWaitMs: 500, pollMs: 10 };

async function withMachine(run: (machine: FakeKimi) => Promise<void>): Promise<void> {
  const machine = await fakeKimi();
  try {
    await machine.installProgram();
    await run(machine);
  } finally {
    await machine.close();
  }
}

const refusal = (code: string) => (error: unknown) => error instanceof ProviderError && error.code === code;

test('ensureWorkspace: reuses the workspace of the folder, creates one with a key, joins calls made at once', async () => {
  await withMachine(async (machine) => {
    const { runtime } = createKimiRuntime(machine.context(), FAST);
    const project = await machine.project('app');
    const client = await runtime.requireReady();
    const [first, second] = await Promise.all([runtime.workspaces.ensure(client, project.path), runtime.workspaces.ensure(client, project.path)]);
    assert.equal(first, second);
    const posts = machine.seen('POST', '/api/v1/workspaces');
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0]?.body, { root: project.path, idempotency_key: workspaceKey(project.path) });
    // Known now: no second creation.
    assert.equal((await runtime.workspaces.ensure(client, project.path)).id, first.id);
    assert.equal(machine.seen('POST', '/api/v1/workspaces').length, 1);

    // Several workspaces of one folder: most sessions first, then the smaller id.
    const other = await machine.project('other');
    machine.api.workspaces.push({ id: 'wm_b', root: other.path, session_count: 1 }, { id: 'wm_c', root: other.path, session_count: 3 }, { id: 'wm_a', root: other.path, session_count: 3 });
    assert.equal((await runtime.workspaces.ensure(client, other.path)).id, 'wm_a');
    assert.equal((await runtime.workspaces.find(client, path.join(machine.home, 'missing'))), undefined);
  });
});

test('trust is read from the workspace-trust files only: no server, no request', async () => {
  await withMachine(async (machine) => {
    const { provider } = createKimiRuntime(machine.context(), FAST);
    await provider.refresh!();
    const project = await machine.project('app');
    assert.deepEqual(await provider.trust(project), { trusted: false });
    await mkdir(machine.paths.trustDir, { recursive: true });
    await writeFile(path.join(machine.paths.trustDir, 'wd_other_000000000000'), JSON.stringify({ root: path.join(machine.home, 'other'), trustedAt: 1 }));
    await writeFile(path.join(machine.paths.trustDir, 'broken'), '{');
    assert.deepEqual(await provider.trust(project), { trusted: false });
    await writeFile(path.join(machine.paths.trustDir, 'wd_app_111111111111'), JSON.stringify({ root: project.path, trustedAt: 2 }));
    assert.deepEqual(await provider.trust(project), { trusted: true });
    assert.equal(machine.spawned.length, 0);
    assert.equal(machine.api.requests.length, 0);
    // Windows compares folders without case (the other OSes exactly: see sameFolder in the paths test).
    assert.equal(await folderTrusted(machine.paths, project.path.toUpperCase(), 'win32'), true);
  });
});

test('preview shows the two records without starting the server; grant writes through the API and reads back', async () => {
  await withMachine(async (machine) => {
    const { provider } = createKimiRuntime(machine.context(), FAST);
    await provider.refresh!();
    const project = await machine.project('app');
    const preview = await provider.previewTrust(project);
    assert.equal(machine.spawned.length, 0);
    assert.deepEqual([preview.provider, preview.trusted, preview.autorun], ['kimi', false, []]);
    assert.deepEqual(preview.writes.map((write) => write.file), [path.join(machine.paths.home, 'projects.json'), machine.paths.trustDir]);
    assert.match(preview.writes[0]?.description ?? '', /если её ещё нет/);

    assert.deepEqual(await provider.grantTrust(project, preview.token), { trusted: true });
    assert.equal(machine.spawned.length, 1);
    const workspace = machine.api.workspaces[0]!;
    assert.equal(workspace['root'], project.path);
    assert.deepEqual(machine.seen('POST', `/api/v1/workspaces/${workspace['id']}/trust`).map((request) => request.body), [{}]);
    assert.deepEqual(await provider.trust(project), { trusted: true });

    // The token works once; a trusted folder needs no writes.
    await assert.rejects(provider.grantTrust(project, preview.token), refusal('invalid-token'));
    const again = await provider.previewTrust(project);
    assert.deepEqual([again.trusted, again.writes], [true, []]);
    assert.deepEqual(await provider.grantTrust(project, again.token), { trusted: true, note: 'уже доверено' });

    // With the server running the preview knows whether the workspace exists.
    const known = await machine.project('known');
    machine.api.workspaces.push({ id: 'wm_known', root: known.path, session_count: 0 });
    assert.deepEqual((await provider.previewTrust(known)).writes.map((write) => write.file), [machine.paths.trustDir]);
    const fresh = await provider.previewTrust(await machine.project('fresh'));
    assert.equal(fresh.writes[0]?.description, 'Kimi создаст рабочую область этой папки');
  });
});

test('grant refuses: a stale preview, no login, a trust the server did not record', async () => {
  await withMachine(async (machine) => {
    const { provider } = createKimiRuntime(machine.context(), FAST);
    await provider.refresh!();
    const project = await machine.project('app');
    const stale = await provider.previewTrust(project);
    await mkdir(machine.paths.trustDir, { recursive: true });
    const file = path.join(machine.paths.trustDir, 'wd_app_222222222222');
    await writeFile(file, JSON.stringify({ root: project.path, trustedAt: 3 }));
    await assert.rejects(provider.grantTrust(project, stale.token), refusal('preview-stale'));

    const other = await machine.project('other');
    machine.api.auth = { models_ready: false };
    const first = await provider.previewTrust(other);
    await assert.rejects(provider.grantTrust(other, first.token), refusal('kimi-not-ready'));
    assert.deepEqual(await provider.trust(other), { trusted: false });
    // The preview now names the reason.
    assert.match((await provider.previewTrust(other)).notes?.join(' ') ?? '', /Сейчас Kimi не готов: нужен вход/);

    machine.api.auth = { models_ready: true };
    await provider.refresh!();
    machine.api.skipTrustFile = true;
    await assert.rejects(provider.grantTrust(other, (await provider.previewTrust(other)).token), refusal('not-recorded'));
    machine.api.skipTrustFile = false;
    machine.api.override = (request) => (request.method === 'POST' && request.url.endsWith('/trust') ? { body: JSON.stringify({ code: 40001, msg: 'bad workspace', data: null, details: { x: 'SECRET' } }) } : undefined);
    await assert.rejects(provider.grantTrust(other, (await provider.previewTrust(other)).token), (error: unknown) => error instanceof ProviderError && error.code === 'kimi-trust' && /bad workspace \(код 40001\)/.test(error.message) && !/SECRET/.test(JSON.stringify(error)));
  });
});
