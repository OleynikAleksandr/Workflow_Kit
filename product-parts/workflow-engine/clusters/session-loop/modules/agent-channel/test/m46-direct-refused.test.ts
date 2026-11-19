// M46 T002: a direct path that refuses (the terminal of the session is not free) answers undelivered
// with its reason and queues nothing — a waiting session sends no hook that would take a queue.
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { test } from 'node:test';
import { HttpError, createRouter, createStateRegistry } from '#http-server';
import { UNDELIVERED_REASON, createAgentChannel, registerChannelRoutes, sessionKey } from '../src/index.ts';
import type { ChannelRoutesOptions } from '../src/index.ts';

const KEY = sessionKey('claude', 's-46');

function post(direct: ChannelRoutesOptions['direct']) {
  const channel = createAgentChannel({ resolveProject: async () => undefined });
  const router = createRouter();
  registerChannelRoutes({ router, state: createStateRegistry(), channel, owns: async (projectId) => projectId === 'p1', direct });
  const url = `/api/projects/p1/sessions/${KEY}/message`;
  const match = router.match('POST', url);
  if (match.kind !== 'found') throw new Error('no route');
  const send = (text: string) => Promise.resolve(match.handler({ method: 'POST', path: url, query: new URLSearchParams(), params: match.params, body: { text }, req: {} as IncomingMessage, res: {} as ServerResponse }))
    .catch((error: HttpError) => ({ code: error.code }));
  return { channel, send };
}

test('a refused paste answers undelivered with the reason of the terminal and queues nothing', async () => {
  const { channel, send } = post(async () => ({ refused: 'Терминал Claude занят или не распознан' }));
  assert.deepEqual(await send('Сделай утилиту'), { sent: false, undelivered: { reason: 'Терминал Claude занят или не распознан' } });
  assert.deepEqual(channel.queued(KEY), []);
  channel.close();
});

test('an empty reason falls back to the general one; false still queues as before', async () => {
  const empty = post(async () => ({ refused: '  ' }));
  assert.deepEqual(await empty.send('x'), { sent: false, undelivered: { reason: UNDELIVERED_REASON } });
  empty.channel.close();
  const queue = post(async () => false);
  const answer = (await queue.send('x')) as { queued?: string };
  assert.equal(typeof answer.queued, 'string');
  assert.deepEqual(queue.channel.queued(KEY).map((m) => m.text), ['x']);
  queue.channel.close();
});

test('a malformed object answer of the direct path is not a refusal: the message is queued', async () => {
  const { channel, send } = post(async () => ({ refused: 1 }) as unknown as { refused: string });
  assert.equal(typeof ((await send('x')) as { queued?: string }).queued, 'string');
  channel.close();
});
