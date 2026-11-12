// The conversation of a Kimi session for the panel: one page of …/messages, oldest first.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProviderError } from '#provider-registry';
import { withSessions } from './fake-sessions.ts';
import type { FakeSession } from './fake-sessions.ts';
import { fixture } from './helpers.ts';

const unavailable = (pattern: RegExp) => (error: unknown): boolean => error instanceof ProviderError && error.code === 'chat-unavailable' && pattern.test(error.message);

test('readMessages turns the captured page oldest first and leaves out the injections of Kimi', async () => {
  await withSessions(async ({ api, project, provider, seen }) => {
    await provider.createSession!(project, { title: 'Work' });
    const session = api.sessions.get('session_1') as FakeSession;
    session.messages = (await fixture('messages') as { items: Array<Record<string, unknown>> }).items;
    const page = await provider.readMessages!(project, 'session_1', { limit: 100 });
    assert.equal(page.truncated, false);
    assert.deepEqual(page.messages.map((message) => [message.id, message.role, message.text, message.at]), [
      ['kit-p11', 'user', 'no model', '2026-11-09T19:42:46.001Z'],
      ['msg_session_c4db56ed-538b-40b0-9c61-32467d766652_000017', 'assistant', page.messages[1]?.text, '2026-11-09T19:42:46.002Z'],
      ['kit-p12', 'user', page.messages[2]?.text, '2026-11-09T19:43:16.810Z'],
      ['kit-p13', 'user', 'queued one', '2026-11-09T19:43:18.196Z'],
      ['msg_session_c4db56ed-538b-40b0-9c61-32467d766652_000021', 'assistant', 'answer 9', '2026-11-09T19:43:18.197Z'],
    ]);
    assert.ok(page.messages.every((message) => !message.text.includes('<system-reminder>')));
    assert.deepEqual(seen(/GET .*\/messages\?/).map((request) => request.url.replace(/^.*\/messages\?/, '')), ['page_size=100']);
    // Reading starts no turn.
    assert.equal(api.prompts.length, 0);
  });
});

test('readMessages: tool calls and empty answers are not messages, time is null without created_at, has_more is truncated', async () => {
  await withSessions(async ({ api, project, provider, seen }) => {
    await provider.createSession!(project, { title: 'Work' });
    const session = api.sessions.get('session_1') as FakeSession;
    assert.deepEqual(await provider.readMessages!(project, 'session_1', { limit: 100 }), { messages: [], truncated: false });

    api.message(session, 'user', 'first', 'user');
    api.message(session, 'assistant', 'old answer');
    api.message(session, 'user', 'the question', 'user');
    session.messages.unshift({ id: 'tool', session_id: session.id, role: 'assistant', content: [{ type: 'tool_use', name: 'bash' }] });
    api.message(session, 'user', '<system-reminder>', 'injection');
    api.message(session, 'user', 'no origin');
    api.message(session, 'assistant', 'the answer');
    const page = await provider.readMessages!(project, 'session_1', { limit: 5 });
    assert.equal(page.truncated, true);
    assert.deepEqual(page.messages, [
      { id: 'msg_session_1_000002', role: 'user', text: 'the question', at: null },
      { id: 'msg_session_1_000006', role: 'assistant', text: 'the answer', at: null },
    ]);
    // The limit is the page size, at most 100.
    await provider.readMessages!(project, 'session_1', { limit: 500 });
    assert.deepEqual(seen(/GET .*\/messages\?/).slice(-2).map((request) => request.url.replace(/^.*\/messages\?/, '')), ['page_size=5', 'page_size=100']);
  });
});

test('readMessages rejects with chat-unavailable when Kimi cannot give the conversation', async () => {
  await withSessions(async ({ api, project, provider }) => {
    await provider.createSession!(project, { title: 'Work' });
    api.message(api.sessions.get('session_1') as FakeSession, 'user', 'hello', 'user');
    api.fail(/GET .*\/messages\?/, 50001, 1);
    await assert.rejects(provider.readMessages!(project, 'session_1', { limit: 100 }), unavailable(/^Kimi не отдал переписку: Kimi: /));
    await assert.rejects(provider.readMessages!(project, 'session_404', { limit: 100 }), unavailable(/код 40401/));
    await assert.rejects(provider.readMessages!(project, '../meta', { limit: 100 }), unavailable(/неверный id/));
    // The message path is untouched.
    assert.equal(await provider.sendMessage!(project, 'session_1', 'after', { id: 'd1' }), true);
    assert.equal((await provider.readMessages!(project, 'session_1', { limit: 100 })).messages.length, 1);
  });
});
