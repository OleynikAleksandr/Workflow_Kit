// The archive mirrored to Kimi and the deletion of the sessions of a project with its retries.
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { ARCHIVED_NOTE } from '../src/session-list.ts';
import { ARCHIVE_STALE_NOTE } from '../src/sessions.ts';
import { withSessions } from './fake-sessions.ts';
import type { FakeKimi } from './helpers.ts';

const DAY = 24 * 60 * 60 * 1000;
const intents = async (machine: FakeKimi): Promise<Array<{ root: string; since: string; sessionIds: string[] }>> => {
  const text = await readFile(path.join(machine.dirs.stateDir, 'sessions', 'kimi-deletes.json'), 'utf8').catch(() => '{"intents":[]}');
  return (JSON.parse(text) as { intents: Array<{ root: string; since: string; sessionIds: string[] }> }).intents;
};

test('archive and restore of one session are mirrored to Kimi; a refusal leaves a note until it is mirrored', async () => {
  await withSessions(async ({ api, project, provider, events }) => {
    await provider.createSession!(project, { title: 'Work' });
    const note = async (): Promise<string | undefined> => (await provider.listSessions(project)).find((item) => item.localId === 'session_1')?.note;
    assert.deepEqual(await provider.archiveSessions!(project, 'session_1'), []);
    assert.equal(api.sessions.get('session_1')?.archived, true);
    assert.equal(await note(), ARCHIVED_NOTE);
    assert.deepEqual(await provider.restoreSessions!(project, 'session_1'), []);
    assert.equal(api.sessions.get('session_1')?.archived, false);
    assert.equal(await note(), undefined);

    // Kimi refuses: the panel archive stays, the session carries a note and an event is written.
    api.fail(/POST \/api\/v2\/sessions:archive$/, 40931, 1);
    assert.deepEqual(await provider.archiveSessions!(project, 'session_1'), []);
    assert.equal(api.sessions.get('session_1')?.archived, false);
    assert.equal(await note(), ARCHIVE_STALE_NOTE);
    assert.ok((await events()).includes('kimi.archive.failed'));
    assert.deepEqual(await provider.archiveSessions!(project, 'session_1'), []);
    assert.equal(await note(), ARCHIVED_NOTE);

    // A session Kimi does not have any more is nothing to mirror.
    api.sessions.delete('session_1');
    await provider.restoreSessions!(project, 'session_1');
    assert.ok(!(await note())?.includes(ARCHIVE_STALE_NOTE));
  });
});

test('the archive of a project archives the sessions of its folder in Kimi and restores only those', async () => {
  await withSessions(async ({ machine, api, project, provider, workspace }) => {
    await provider.createSession!(project, { title: 'Panel' });
    const sub = workspace(path.join(project.path, 'docs'));
    const outside = api.add({ workspace: sub, cwd: path.join(project.path, 'docs') });
    const already = api.add({ workspace: sub, cwd: path.join(project.path, 'docs'), archived: true });
    const foreign = api.add({ workspace: workspace(path.join(machine.home, 'other')), cwd: path.join(machine.home, 'other') });
    assert.deepEqual(await provider.archiveSessions!(project, null), []);
    assert.deepEqual([...api.sessions.values()].map((item) => [item.id, item.archived]), [['session_1', true], [outside.id, true], [already.id, true], [foreign.id, false]]);
    assert.deepEqual((machine.seen('POST', '/api/v2/sessions:archive')[0]?.body as { ids: string[] }).ids.sort(), ['session_1', outside.id].sort());

    assert.deepEqual(await provider.restoreSessions!(project, null), []);
    assert.deepEqual([...api.sessions.values()].map((item) => item.archived), [false, false, true, false]);
    // Nothing is remembered any more: a second restore asks nothing.
    await provider.restoreSessions!(project, null);
    assert.equal(machine.seen('POST', '/api/v2/sessions:restore').length, 1);
  });
});

test('the archive of a project without Kimi sessions starts no server; without the program it does nothing', async () => {
  await withSessions(async ({ machine, project, provider }) => {
    assert.deepEqual(await provider.archiveSessions!(project, null), []);
    assert.deepEqual(await provider.restoreSessions!(project, null), []);
    assert.equal(machine.spawned.length, 0);
    await rm(machine.paths.program);
    await provider.refresh!();
    assert.deepEqual(await provider.archiveSessions!(project, null), []);
    assert.deepEqual(await provider.deleteSessions!(project), []);
    assert.deepEqual(await intents(machine), []);
    assert.equal(machine.spawned.length, 0);
  });
});

test('deleteSessions deletes every session of the folder workspaces without a page limit, also unknown to Kit', async () => {
  await withSessions(async ({ machine, api, project, provider, workspace, journal }) => {
    await provider.createSession!(project, { title: 'Panel' });
    const sub = workspace(path.join(project.path, 'docs'));
    for (let index = 0; index < 24; index += 1) api.add({ workspace: sub, cwd: path.join(project.path, 'docs') });
    api.add({ workspace: sub, cwd: path.join(project.path, 'docs'), archived: true });
    // Known from the journal only: its workspace is not listed any more.
    const lost = api.add({ workspace: 'wm_removed', cwd: project.path });
    await journal(lost.id);
    await journal('session_already_gone');
    const foreign = api.add({ workspace: workspace(path.join(machine.home, 'other')), cwd: path.join(machine.home, 'other') });
    api.pageSize = 1;
    const deleted = await provider.deleteSessions!(project);
    assert.equal(deleted.length, 1 + 24 + 1 + 1);
    assert.ok(deleted.includes('session_1') && deleted.includes(lost.id) && !deleted.includes('session_already_gone'));
    assert.deepEqual([...api.sessions.keys()], [foreign.id]);
    assert.deepEqual(await intents(machine), []);
  });
});

test('an incomplete deletion keeps an intent retried after a restart; sessions created later are kept', async () => {
  await withSessions(async ({ machine, api, project, provider, workspace, restart }) => {
    await provider.createSession!(project, { title: 'Panel' });
    const id = machine.api.workspaces[0]?.['id'] as string;
    const outside = api.add({ workspace: id, cwd: project.path });
    api.fail(/POST \/api\/v1\/sessions\/session_1:delete$/, 40931, 1);
    api.fail(new RegExp(`POST /api/v1/sessions/${outside.id}:delete$`), 40931, 1);
    assert.deepEqual(await provider.deleteSessions!(project), []);
    const [intent] = await intents(machine);
    assert.deepEqual([intent?.root, intent?.sessionIds], [project.path, ['session_1']]);

    // The project is created again in the same folder before the retry.
    const later = api.add({ workspace: id, cwd: project.path, created: Date.now() + 60_000 });
    workspace(project.path);
    const service = restart();
    assert.deepEqual((await service.retryDeletes!()).sort(), ['session_1', outside.id].sort());
    assert.deepEqual([...api.sessions.keys()], [later.id]);
    assert.deepEqual(await intents(machine), []);
    assert.deepEqual(await service.retryDeletes!(), []);
  });
});

test('a server that does not start or does not list keeps the intent; after 7 days it is dropped', async () => {
  await withSessions(async ({ machine, api, project, provider, runtime, workspace, journal, advance }) => {
    const id = workspace(project.path);
    const first = api.add({ workspace: id, cwd: project.path });
    const second = api.add({ workspace: id, cwd: project.path });
    await journal(first.id);
    machine.failSpawn = 'throw';
    assert.deepEqual(await provider.deleteSessions!(project), []);
    assert.deepEqual((await intents(machine)).map((item) => item.sessionIds), [[first.id]]);

    // The list is refused: the known session goes, the rest waits for a complete listing.
    await runtime.requireServer();
    api.fail(/GET \/api\/v2\/sessions\?/, 50001, 1);
    assert.deepEqual(await provider.retryDeletes!(), [first.id]);
    assert.deepEqual((await intents(machine)).map((item) => item.sessionIds), [[]]);
    assert.ok(api.sessions.has(second.id));

    advance(8 * DAY);
    assert.deepEqual(await provider.retryDeletes!(), []);
    assert.deepEqual(await intents(machine), []);
    assert.ok(api.sessions.has(second.id));
  });
});
