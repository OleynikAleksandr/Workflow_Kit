// M45 T002: a panel message pasted into a Claude terminal is delivered only when its prompt hook
// took the reservation; without the hook in the confirmation time the route answers `undelivered`
// and queues nothing (the text may still sit in the terminal).
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { test } from 'node:test';
import { createRouter, createStateRegistry } from '#http-server';
import { UNDELIVERED_REASON, createAgentChannel, parseHookInput, registerChannelRoutes, sessionKey } from '../src/index.ts';

const key = 'codex:s';
const hook = (text: string, native: string | null) => parseHookInput('codex', { session_id: 's', cwd: '/p', prompt: text, turn_id: native })!;
const channel = () => createAgentChannel({ resolveProject: async () => ({ id: 'p' }), decide: () => ({ kind: 'release' }) });

test('a paste confirmed by its prompt hook starts the turn; without the hook it is unconfirmed and leaves no reservation', async () => {
  const ch = channel();
  try {
    await ch.prompt(hook('hello', 'n1'));
    await ch.stop(hook('hello', 'n1'));
    const confirmed = await ch.directTurn(key, 'p', 'do it', async () => {
      setTimeout(() => void ch.prompt(hook('do it', 'n2')), 30);
      return true;
    }, 2000);
    assert.equal(confirmed, true);
    assert.equal(ch.get(key)!.state, 'working');
    await ch.stop(hook('do it', 'n2'));

    const started = Date.now();
    const lost = await ch.directTurn(key, 'p', 'lost text', async () => true, 200);
    assert.equal(lost, 'unconfirmed');
    assert.ok(Date.now() - started >= 200);
    assert.equal(ch.get(key)!.state, 'waiting', 'no turn without the hook');
    // A late hook of the same text is the user's own prompt, a new turn of its own.
    await ch.prompt(hook('lost text', 'n3'));
    assert.equal(ch.get(key)!.state, 'working');
  } finally { ch.close(); }
});

test('without confirmMs the paste counts as before', async () => {
  const ch = channel();
  try {
    assert.equal(await ch.directTurn(key, 'p', 'old way', async () => true), true);
    assert.equal(ch.get(key)!.state, 'working');
  } finally { ch.close(); }
});

test('the message route answers undelivered with the reason and queues nothing', async () => {
  const KEY = sessionKey('claude', 'm45');
  const ch = createAgentChannel({ resolveProject: async () => undefined });
  const router = createRouter();
  registerChannelRoutes({ router, state: createStateRegistry(), channel: ch, owns: async () => true, direct: async () => 'unconfirmed' });
  const url = `/api/projects/p1/sessions/${KEY}/message`;
  const match = router.match('POST', url);
  if (match.kind !== 'found') throw new Error('no route');
  const answer = await match.handler({ method: 'POST', path: url, query: new URLSearchParams(), params: match.params, body: { text: 'составь план' }, req: {} as IncomingMessage, res: {} as ServerResponse });
  assert.deepEqual(answer, { sent: false, undelivered: { reason: UNDELIVERED_REASON } });
  assert.deepEqual(ch.queued(KEY), []);
  ch.close();
});
