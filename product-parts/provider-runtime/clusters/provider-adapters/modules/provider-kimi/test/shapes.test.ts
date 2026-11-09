import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KimiError } from '../src/client.ts';
import { parseBatch, parseMessages, parsePrompt, parseSession, parseSessionPage } from '../src/shapes.ts';
import { fixture } from './helpers.ts';

const shape = (error: unknown): boolean => error instanceof KimiError && error.kind === 'shape';

test('session shapes: the captured 2.5.2 list, session, messages and prompt answers are read', async () => {
  const page = parseSessionPage(await fixture('v2-sessions'));
  assert.equal(page.next, null);
  assert.deepEqual(page.items, [
    { id: 'session_c4db56ed-538b-40b0-9c61-32467d766652', workspaceId: 'wm_d7ee5e9e-2bd6-4b04-8544-27db00055591', cwd: '/home/user/kwork', title: 'Kit test 2', createdAt: '2026-11-09T19:38:18.998Z', archived: false, status: 'idle', model: 'fake/fake' },
    { id: 'session_8109bd97-fc58-4bf4-a404-6a6112791e42', workspaceId: 'wm_d7ee5e9e-2bd6-4b04-8544-27db00055591', cwd: '/home/user/kwork', title: 'Kit test', createdAt: '2026-11-09T19:37:45.997Z', archived: false, status: 'failed', model: null },
  ]);
  const idle = parseSession(await fixture('session-idle'));
  assert.deepEqual(idle, { id: 'session_c4db56ed-538b-40b0-9c61-32467d766652', workspaceId: 'wm_d7ee5e9e-2bd6-4b04-8544-27db00055591', title: 'Kit test 2', createdAt: '2026-11-09T19:38:18.998Z', archived: false, waiting: false, model: 'fake/fake', cwd: '/home/user/kwork' });
  assert.deepEqual(parseSession(await fixture('session-busy')), idle);
  assert.deepEqual(parseSession(await fixture('reload')), idle);
  assert.equal(parsePrompt(await fixture('prompt-running')), 'running');
  assert.equal(parsePrompt(await fixture('prompt-queued')), 'queued');
  const messages = parseMessages(await fixture('messages'));
  assert.equal(messages.items.length, 6);
  assert.deepEqual(messages.items[0], { id: 'msg_session_c4db56ed-538b-40b0-9c61-32467d766652_000021', role: 'assistant', text: 'answer 9', origin: null });
  assert.deepEqual(messages.items.at(-1), { id: 'kit-p11', role: 'user', text: 'no model', origin: 'user' });
});

test('session shapes: pages, waiting sessions and batch rows; a missing field is a shape error', () => {
  const item = { id: 's1', workspace: { id: 'w1' }, meta: { created_at: 1000, archived: true } };
  assert.deepEqual(parseSessionPage({ items: [item], has_more: true, next_page_token: 't2' }), {
    items: [{ id: 's1', workspaceId: 'w1', cwd: null, title: '', createdAt: '1970-01-01T00:00:01.000Z', archived: true, status: null, model: null }],
    next: 't2',
  });
  // The last page may still carry a token: has_more decides.
  assert.equal(parseSessionPage({ items: [], has_more: false, next_page_token: 't3' }).next, null);
  assert.equal(parseSession({ id: 's1', workspace_id: 'w1', created_at: '2026-01-01T00:00:00Z', pending_interaction: 'approval' }).waiting, true);
  assert.equal(parseSession({ id: 's1', workspace_id: 'w1', created_at: 5, archived: true }).archived, true);
  assert.deepEqual(parseMessages({ items: [{ id: 'm1', role: 'assistant', content: [{ type: 'tool_use' }, { type: 'text', text: ' a ' }, { type: 'text', text: 'b' }] }], has_more: true }), {
    items: [{ id: 'm1', role: 'assistant', text: 'a \nb', origin: null }],
    hasMore: true,
  });
  assert.deepEqual(parseBatch({ results: [{ id: 's1', ok: true }, { id: 's2', ok: false, error: { code: 40931, message: 'held' } }], succeeded: 1, failed: 1 }), [
    { id: 's1', ok: true, code: null, message: null },
    { id: 's2', ok: false, code: 40931, message: 'held' },
  ]);
  const broken = [
    () => parseSessionPage({ items: {} }),
    () => parseSessionPage({ items: [{ ...item, meta: { created_at: 1000 } }] }),
    () => parseSessionPage({ items: [{ ...item, meta: { created_at: 'soon', archived: false } }] }),
    () => parseSessionPage({ items: [], has_more: true }),
    () => parseSession({ id: 's1', created_at: 5 }),
    () => parseSession({ id: 's1', workspace_id: 'w1' }),
    () => parseMessages({ items: [] }),
    () => parseMessages({ items: [{ id: 'm1', role: 'user' }], has_more: false }),
    () => parsePrompt({ prompt_id: 'p' }),
    () => parseBatch({ results: [{ id: 's1' }] }),
    () => parseBatch({}),
  ];
  for (const call of broken) assert.throws(call, shape);
});
