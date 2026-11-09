// Sessions of Kimi: creation with the first message, the merged list with its notes and paging,
// the name. The fake machine works on every OS; the folder rule is checked with the platform given.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { ProviderError, providerSessionsFile } from '#provider-registry';
import { inFolder } from '../src/paths.ts';
import { ARCHIVED_NOTE, GONE_NOTE, PARTIAL_NOTE, SERVER_DOWN, WAITING_NOTE, shortTitle, unavailableNote } from '../src/session-list.ts';
import { FOREIGN_RENAME_NOTE } from '../src/sessions.ts';
import { withSessions } from './fake-sessions.ts';

const stored = async (file: string): Promise<{ sessions: Array<Record<string, unknown>> }> => JSON.parse(await readFile(file, 'utf8')) as { sessions: Array<Record<string, unknown>> };

test('createSession creates the session in the workspace of the folder, keeps a record and sends the first message', async () => {
  await withSessions(async ({ machine, api, project, provider }) => {
    const info = await provider.createSession!(project, { title: 'First task', firstMessage: 'hello' });
    const workspace = machine.api.workspaces[0];
    assert.equal(workspace?.['root'], project.path);
    assert.deepEqual(machine.seen('POST', '/api/v1/sessions')[0]?.body, { workspace_id: workspace?.['id'], title: 'First task', metadata: { cwd: project.path } });
    assert.deepEqual([info.provider, info.localId, info.title, info.origin, info.state, info.cwd, info.note], ['kimi', 'session_1', 'First task', 'panel', 'running', project.path, undefined]);
    // The session has no model yet: the default one of the config goes with the prompt.
    assert.deepEqual(api.prompts, [{ sessionId: 'session_1', body: { content: [{ type: 'text', text: 'hello' }], prompt_id: 'kit-first-session_1', model: 'fake/fake' } }]);
    const { sessions } = await stored(providerSessionsFile(machine.dirs, 'kimi'));
    assert.deepEqual(sessions.map((item) => [item['sessionId'], item['projectId'], item['projectPath'], item['workspaceId'], item['title']]), [['session_1', project.id, project.path, workspace?.['id'], 'First task']]);
    // The second session reuses the workspace; without a first message it is stopped.
    const second = await provider.createSession!(project, { title: 'Second' });
    assert.deepEqual([second.localId, second.state, machine.api.workspaces.length, api.prompts.length], ['session_2', 'stopped', 1, 1]);
  });
});

test('a refused first message leaves the session with a note; a refused creation leaves nothing', async () => {
  await withSessions(async ({ machine, api, project, provider }) => {
    api.fail(/POST .*\/prompts$/, 40001, 1);
    const info = await provider.createSession!(project, { title: 'Quiet', firstMessage: 'hello' });
    assert.equal(info.state, 'stopped');
    assert.match(info.note ?? '', /^сообщение не доставлено: Kimi: /);
    assert.match((await provider.listSessions(project))[0]?.note ?? '', /^сообщение не доставлено: /);

    api.fail(/POST \/api\/v1\/sessions$/, 40001, 1);
    await assert.rejects(provider.createSession!(project, { title: 'Broken' }), (error: unknown) => error instanceof ProviderError && error.code === 'kimi-session' && /Kimi не создал сессию/.test(error.message));
    assert.equal((await stored(providerSessionsFile(machine.dirs, 'kimi'))).sessions.length, 1);
  });
});

test('listSessions merges the server, the panel records and the hook journal by one folder rule', async () => {
  await withSessions(async ({ machine, api, project, provider, workspace, journal }) => {
    await provider.createSession!(project, { title: 'From the panel' });
    const sub = path.join(project.path, 'packages', 'core');
    const inside = workspace(sub);
    const outside = workspace(path.join(machine.home, 'other'));
    const archived = api.add({ workspace: inside, cwd: sub, title: 'Old work', archived: true });
    const asking = api.add({ workspace: inside, cwd: sub, title: '', status: 'question', model: '' });
    api.add({ workspace: outside, cwd: path.join(machine.home, 'other'), title: 'Foreign' });
    await journal('session_gone');
    await journal('session_far', path.join(machine.home, 'other'));
    await journal(asking.id, sub);

    const list = await provider.listSessions(project);
    const brief = Object.fromEntries(list.map((item) => [item.localId, [item.title, item.origin, item.state, item.cwd, item.note]]));
    assert.deepEqual(brief, {
      session_1: ['From the panel', 'panel', 'stopped', project.path, undefined],
      [archived.id]: ['Old work', 'hook', 'stopped', sub, ARCHIVED_NOTE],
      [asking.id]: [shortTitle(asking.id), 'hook', 'stopped', sub, WAITING_NOTE],
      // In the journal only, and the complete answer of the server does not have it.
      session_gone: [shortTitle('session_gone'), 'hook', 'stopped', project.path, GONE_NOTE],
    });
    assert.deepEqual(list.map((item) => item.createdAt), list.map((item) => item.createdAt).sort().reverse());
    assert.equal(list.find((item) => item.localId === archived.id)?.model, 'fake/fake');
  });
});

test('the list pages through active and archived sessions, caches the answer for 5 s and stops at 20 pages', async () => {
  await withSessions(async ({ api, project, provider, runtime, workspace, seen, advance }) => {
    await runtime.requireServer();
    const id = workspace(project.path);
    for (let index = 0; index < 5; index += 1) api.add({ workspace: id, cwd: project.path });
    for (let index = 0; index < 3; index += 1) api.add({ workspace: id, cwd: project.path, archived: true });
    api.pageSize = 2;
    const pages = /GET \/api\/v2\/sessions\?/;
    assert.equal((await provider.listSessions(project)).length, 8);
    assert.deepEqual(seen(pages).map((request) => request.url.replace(/^.*meta\.archived=/, '')), [
      'false&page_size=100', 'false&page_size=100&page_token=2', 'false&page_size=100&page_token=4', 'true&page_size=100', 'true&page_size=100&page_token=2',
    ]);
    assert.match(seen(pages)[0]?.url ?? '', new RegExp(`workspace\\.id=${id}&`));
    // The cached answer serves 5 s.
    api.add({ workspace: id, cwd: project.path });
    assert.equal((await provider.listSessions(project)).length, 8);
    assert.equal(seen(pages).length, 5);
    advance(6000);
    assert.equal((await provider.listSessions(project)).length, 9);

    // More than 20 pages: the list says it is not complete and blames no session.
    api.pageSize = 1;
    for (let index = 0; index < 20; index += 1) api.add({ workspace: id, cwd: project.path });
    advance(6000);
    const cut = await provider.listSessions(project);
    assert.equal(cut.length, 20 + 3);
    assert.ok(cut.every((item) => item.note?.split('; ').includes(PARTIAL_NOTE)));
  });
});

test('the list works from the records and the journal when the server is down, and never starts it', async () => {
  await withSessions(async ({ machine, api, project, provider, journal, restart, advance }) => {
    // Kimi was never used: a session of the journal carries no note and nothing starts.
    await journal('session_cli');
    assert.deepEqual((await provider.listSessions(project)).map((item) => [item.localId, item.note]), [['session_cli', undefined]]);
    assert.equal(machine.spawned.length, 0);

    await provider.createSession!(project, { title: 'Kept' });
    api.fail(/GET \/api\/v2\/sessions\?/, 50001, 1);
    const failed = await provider.listSessions(project);
    assert.deepEqual(failed.map((item) => item.localId), ['session_1', 'session_cli']);
    assert.ok(failed.every((item) => /^Kimi недоступен: Kimi: /.test(item.note ?? '')));

    await machine.crash();
    advance(6000);
    for (const reader of [provider, restart()]) {
      const down = await reader.listSessions(project);
      assert.deepEqual(down.map((item) => [item.localId, item.title, item.origin, item.note]), [
        ['session_1', 'Kept', 'panel', unavailableNote(SERVER_DOWN)],
        ['session_cli', shortTitle('session_cli'), 'hook', unavailableNote(SERVER_DOWN)],
      ]);
    }
    assert.equal(machine.spawned.length, 1);
  });
});

test('the folder rule: the project folder or a folder inside it, per OS', () => {
  assert.equal(inFolder('/work/app', '/work/app', 'linux'), true);
  assert.equal(inFolder('/work/app/packages/core/', '/work/app', 'linux'), true);
  assert.equal(inFolder('/work/application', '/work/app', 'linux'), false);
  assert.equal(inFolder('/work/App/core', '/work/app', 'linux'), false);
  assert.equal(inFolder('/work', '/work/app', 'darwin'), false);
  assert.equal(inFolder('/work/app/core', '/', 'darwin'), true);
  assert.equal(inFolder('C:\\Work\\App\\packages', 'c:/work/app', 'win32'), true);
  assert.equal(inFolder('C:\\Work\\App', 'C:\\Work\\App\\', 'win32'), true);
  assert.equal(inFolder('C:\\Work\\Apple', 'C:\\Work\\App', 'win32'), false);
  assert.equal(inFolder('D:\\Work\\App', 'C:\\Work\\App', 'win32'), false);
});

test('renameSession passes the name to Kimi; a session of another server gives synced false', async () => {
  await withSessions(async ({ machine, api, project, provider }) => {
    await provider.createSession!(project, { title: 'Before' });
    assert.deepEqual(await provider.renameSession!(project, 'session_1', 'After'), { synced: true });
    assert.equal(api.sessions.get('session_1')?.title, 'After');
    assert.equal((await stored(providerSessionsFile(machine.dirs, 'kimi'))).sessions[0]?.['title'], 'After');
    assert.equal((await provider.listSessions(project))[0]?.title, 'After');

    api.fail(/POST .*\/profile$/, 40931, 1);
    assert.deepEqual(await provider.renameSession!(project, 'session_1', 'Held'), { synced: false, note: FOREIGN_RENAME_NOTE });
    api.fail(/POST .*\/profile$/, 40001, 1);
    const refused = await provider.renameSession!(project, 'session_1', 'Refused');
    assert.equal(refused.synced, false);
    assert.match(refused.note ?? '', /^имя не передано в Kimi: Kimi: /);
    assert.equal((await provider.renameSession!(project, 'no/such id', 'x')).synced, false);
    assert.equal(api.sessions.get('session_1')?.title, 'After');
  });
});
