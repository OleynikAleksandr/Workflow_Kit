// The turn state by the lock files, the last answer of a session and the delivery of a message.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProviderError } from '#provider-registry';
import type { Liveness } from '../src/locks.ts';
import { ARCHIVED_NOTE, WAITING_NOTE } from '../src/session-list.ts';
import { withSessions } from './fake-sessions.ts';
import type { FakeSession } from './fake-sessions.ts';
import { fixture } from './helpers.ts';

const unavailable = (pattern: RegExp) => (error: unknown): boolean => error instanceof ProviderError && error.code === 'answer-unavailable' && pattern.test(error.message);
const calls = (requests: Array<{ method: string; url: string }>): string[] => requests.map((request) => `${request.method} ${request.url.replace('/api/v1/sessions/', '')}`);

test('sessionIdle follows the lock files: a live holder or another host means a running turn', async () => {
  const liveness: Liveness = { pidAlive: (pid) => pid === 7, bootTime: () => 1_000_000, hostname: () => 'this-host' };
  await withSessions(async ({ api, project, provider }) => {
    await provider.createSession!(project, { title: 'Work' });
    assert.equal(await provider.sessionIdle!(project, 'session_1'), true);
    await api.lock('session_1', { pid: 7, startedAt: 2_000_000 });
    assert.equal(await provider.sessionIdle!(project, 'session_1'), false);
    assert.equal(await provider.sessionIdle!(project, 'session_2'), true);
    assert.equal((await provider.listSessions(project))[0]?.state, 'running');
    // The holder is gone, or its pid belongs to a process started before the boot.
    await api.lock('session_1', { pid: 8, startedAt: 2_000_000 });
    assert.equal(await provider.sessionIdle!(project, 'session_1'), true);
    await api.lock('session_1', { pid: 7, startedAt: new Date(900_000).toISOString() });
    assert.equal(await provider.sessionIdle!(project, 'session_1'), true);
    await api.lock('session_1', { pid: 8, startedAt: 2_000_000, hostname: 'another-host' });
    assert.equal(await provider.sessionIdle!(project, 'session_1'), false);
    assert.equal(provider.lockSwitch, 'KIMI_CODE_SESSION_LOCK');
  }, { liveness });
});

test('lastAnswer pages back to the last message of the user and takes the newest text of the assistant', async () => {
  await withSessions(async ({ api, project, provider, seen }) => {
    await provider.createSession!(project, { title: 'Work' });
    const session = api.sessions.get('session_1') as FakeSession;
    // The captured page of Kimi 2.5.2: the answer comes before the message that started the turn.
    session.messages = (await fixture('messages') as { items: Array<Record<string, unknown>> }).items;
    assert.equal(await provider.lastAnswer!(project, 'session_1'), 'answer 9');

    session.messages = [];
    api.message(session, 'user', 'the question', 'user');
    api.message(session, 'assistant', 'an early part');
    for (let index = 0; index < 70; index += 1) api.message(session, 'user', '<system-reminder>', 'injection');
    api.message(session, 'assistant', 'the answer');
    for (let index = 0; index < 40; index += 1) session.messages.unshift({ id: `tool_${index}`, session_id: session.id, role: 'assistant', content: [{ type: 'tool_use', name: 'bash' }] });
    assert.equal(await provider.lastAnswer!(project, 'session_1'), 'the answer');
    const pages = seen(/GET .*\/messages\?/).slice(1).map((request) => request.url.replace(/^.*\/messages\?/, ''));
    assert.deepEqual(pages, ['page_size=50', `page_size=50&before_id=${session.messages[49]?.['id']}`, `page_size=50&before_id=${session.messages[99]?.['id']}`]);

    // A turn without text of the assistant has no answer.
    session.messages = [];
    api.message(session, 'user', 'the question', 'user');
    session.messages.unshift({ id: 'tool_only', session_id: session.id, role: 'assistant', content: [{ type: 'tool_use', name: 'bash' }] });
    assert.equal(await provider.lastAnswer!(project, 'session_1'), null);
  });
});

test('lastAnswer rejects on an API failure and when the start of the turn is not found', async () => {
  await withSessions(async ({ api, project, provider, seen }) => {
    await provider.createSession!(project, { title: 'Work' });
    const session = api.sessions.get('session_1') as FakeSession;
    api.message(session, 'assistant', 'an answer of nobody');
    await assert.rejects(provider.lastAnswer!(project, 'session_1'), unavailable(/начало хода не найдено/));
    api.fail(/GET .*\/messages\?/, 50001, 1);
    await assert.rejects(provider.lastAnswer!(project, 'session_1'), unavailable(/Ответ Kimi не прочитан: Kimi: /));
    await assert.rejects(provider.lastAnswer!(project, 'session_404'), unavailable(/код 40401/));
    await assert.rejects(provider.lastAnswer!(project, '../meta'), unavailable(/неверный id/));
    // Ten pages without a message of the user: the reading stops.
    for (let index = 0; index < 600; index += 1) api.message(session, 'user', 'reminder', 'injection');
    const before = seen(/GET .*\/messages\?/).length;
    await assert.rejects(provider.lastAnswer!(project, 'session_1'), unavailable(/начало хода не найдено/));
    assert.equal(seen(/GET .*\/messages\?/).length - before, 10);
  });
});

test('sendMessage sends the prompt of the delivery, one message of a session after another', async () => {
  await withSessions(async ({ machine, api, project, provider, seen }) => {
    await provider.createSession!(project, { title: 'Work' });
    (api.sessions.get('session_1') as FakeSession).model = 'kimi/k2';
    machine.api.requests.length = 0;
    const sent = await Promise.all([provider.sendMessage!(project, 'session_1', 'one', { id: 'd1' }), provider.sendMessage!(project, 'session_1', 'two', { id: 'd2' })]);
    assert.deepEqual(sent, [true, true]);
    // The session has its model: none is sent. The second message waits for the first.
    assert.deepEqual(api.prompts.map((item) => item.body), [
      { content: [{ type: 'text', text: 'one' }], prompt_id: 'kit-d1' },
      { content: [{ type: 'text', text: 'two' }], prompt_id: 'kit-d2' },
    ]);
    assert.deepEqual(calls(seen(/sessions\/session_1/)), ['GET session_1', 'POST session_1/prompts', 'GET session_1', 'POST session_1/prompts']);
    // The same delivery again: Kimi has its prompt already (40927).
    assert.equal(await provider.sendMessage!(project, 'session_1', 'one', { id: 'd1' }), true);
    assert.equal(api.prompts.length, 2);
    assert.equal(seen(/:takeover/).length, 0);

    // The server is gone: it is started again for the message.
    await machine.crash();
    assert.equal(await provider.sendMessage!(project, 'session_1', 'three', { id: 'd3' }), true);
    assert.equal(machine.spawned.length, 2);
  });
});

test('sendMessage handles a session of another server (40931) and a session to reload (40932)', async () => {
  await withSessions(async ({ api, project, provider, seen, events }) => {
    await provider.createSession!(project, { title: 'Work' });
    const note = async (): Promise<string | undefined> => (await provider.listSessions(project))[0]?.note;
    const prompts = /POST .*\/prompts$/;
    // Two refusals, then the session is free.
    api.fail(prompts, 40931, 2);
    assert.equal(await provider.sendMessage!(project, 'session_1', 'held', { id: 'd1' }), true);
    assert.equal(seen(prompts).length, 3);
    // Held for good: three retries, then the message is not delivered and the session says why.
    api.fail(prompts, 40931, 4);
    assert.equal(await provider.sendMessage!(project, 'session_1', 'held', { id: 'd2' }), false);
    assert.equal(seen(prompts).length, 3 + 4);
    assert.match((await note()) ?? '', /^сообщение не доставлено: Kimi: .*код 40931/);
    assert.ok((await events()).includes('kimi.delivery.refused'));

    api.fail(prompts, 40932, 1);
    assert.equal(await provider.sendMessage!(project, 'session_1', 'reload', { id: 'd3' }), true);
    assert.equal(seen(/POST .*session_1:reload$/).length, 1);
    assert.equal(await note(), undefined);
    api.fail(prompts, 40932, 2);
    assert.equal(await provider.sendMessage!(project, 'session_1', 'reload', { id: 'd4' }), false);
    assert.equal(seen(/POST .*session_1:reload$/).length, 2);
    assert.deepEqual(api.prompts.map((item) => item.body['prompt_id']), ['kit-d1', 'kit-d3']);
  });
});

test('a session archived in Kimi gets no message; a blocked prompt is delivered with a note', async () => {
  await withSessions(async ({ api, project, provider, seen, advance }) => {
    await provider.createSession!(project, { title: 'Work' });
    const session = api.sessions.get('session_1') as FakeSession;
    const note = async (): Promise<string | undefined> => (await provider.listSessions(project))[0]?.note;
    session.archived = true;
    assert.equal(await provider.sendMessage!(project, 'session_1', 'hello', { id: 'd1' }), false);
    assert.equal(seen(/POST .*\/prompts$/).length, 0);
    assert.equal(await note(), ARCHIVED_NOTE);
    session.archived = false;
    advance(6000); // Restored in the Kimi app: the cached list of the server is 5 s old.

    api.promptStatus = 'blocked';
    assert.equal(await provider.sendMessage!(project, 'session_1', 'hello', { id: 'd2' }), true);
    assert.equal(await note(), WAITING_NOTE);
    api.promptStatus = 'queued';
    assert.equal(await provider.sendMessage!(project, 'session_1', 'again', { id: 'd3' }), true);
    assert.equal(await note(), undefined);

    assert.equal(await provider.sendMessage!(project, 'session_404', 'hello', { id: 'd4' }), false);
    assert.equal(await provider.sendMessage!(project, 'bad id', 'hello', { id: 'd5' }), false);
  });
});
