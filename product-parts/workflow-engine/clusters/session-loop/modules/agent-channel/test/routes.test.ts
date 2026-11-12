import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { test } from 'node:test';
import { HttpError, createRouter, createStateRegistry } from '#http-server';
import { MESSAGE_MAX_CHARS, checkSessionMessage, createAgentChannel, registerChannelRoutes, sessionKey } from '../src/index.ts';
import type { AgentChannel, ChannelRoutesOptions } from '../src/index.ts';

const KEY = sessionKey('claude', 'after-restart');

function setup(direct?: ChannelRoutesOptions['direct']) {
  const channel = createAgentChannel({ resolveProject: async () => undefined });
  const router = createRouter();
  const calls: Array<[string, string, string]> = [];
  const wrapped: ChannelRoutesOptions['direct'] = direct
    ? (projectId, key, text) => {
        calls.push([projectId, key, text]);
        return direct(projectId, key, text);
      }
    : undefined;
  registerChannelRoutes({ router, state: createStateRegistry(), channel, owns: async (projectId) => projectId === 'p1', direct: wrapped });
  const post = async (text: unknown, projectId = 'p1'): Promise<{ status: number; body: Record<string, unknown> }> => {
    const url = `/api/projects/${projectId}/sessions/${KEY}/message`;
    const match = router.match('POST', url);
    if (match.kind !== 'found') throw new Error('no route');
    try {
      const value = await match.handler({ method: 'POST', path: url, query: new URLSearchParams(), params: match.params, body: { text }, req: {} as IncomingMessage, res: {} as ServerResponse });
      return { status: 200, body: value as Record<string, unknown> };
    } catch (error) {
      if (error instanceof HttpError) return { status: error.status, body: { code: error.code } };
      throw error;
    }
  };
  return { channel, post, calls };
}

const queued = (channel: AgentChannel): string[] => channel.queued(KEY).map((m) => m.text);

test('direct true answers sent and queues nothing', async () => {
  const { channel, post, calls } = setup(async () => true);
  const answer = await post('  do the task  ');
  assert.deepEqual(answer, { status: 200, body: { sent: true } });
  assert.deepEqual(calls, [['p1', KEY, 'do the task']], 'direct gets the clean text');
  assert.deepEqual(queued(channel), []);
  channel.close();
});

test('direct false, a rejection or a thrown error queue the message', async () => {
  const variants: Array<NonNullable<ChannelRoutesOptions['direct']>> = [
    async () => false,
    async () => {
      throw new Error('boom');
    },
    () => {
      throw new Error('sync boom');
    },
  ];
  for (const direct of variants) {
    const { channel, post, calls } = setup(direct);
    const answer = await post('hello');
    assert.equal(answer.status, 200);
    assert.equal(typeof answer.body['queued'], 'string');
    assert.equal(answer.body['sent'], undefined);
    assert.equal(calls.length, 1);
    assert.deepEqual(queued(channel), ['hello']);
    channel.close();
  }
});

test('without the direct option the message is queued as before', async () => {
  const { channel, post } = setup();
  const answer = await post('hello');
  assert.equal(typeof answer.body['queued'], 'string');
  assert.deepEqual(queued(channel), ['hello']);
  channel.close();
});

test('the checks come before direct: a bad text or a foreign session never reaches it', async () => {
  const { channel, post, calls } = setup(async () => true);
  assert.deepEqual(await post('   '), { status: 400, body: { code: 'empty-message' } });
  assert.deepEqual(await post('x'.repeat(MESSAGE_MAX_CHARS + 1)), { status: 400, body: { code: 'message-too-long' } });
  assert.deepEqual(await post('hello', 'p2'), { status: 404, body: { code: 'unknown-session' } });
  assert.deepEqual(calls, []);
  channel.close();
});

test('the limit is 20000 characters', async () => {
  assert.equal(MESSAGE_MAX_CHARS, 20_000);
  const { channel, post } = setup(async () => false);
  const long = 'x'.repeat(MESSAGE_MAX_CHARS);
  const answer = await post(long);
  assert.equal(typeof answer.body['queued'], 'string');
  assert.deepEqual(queued(channel), [long]);
  channel.close();
});

test('checkSessionMessage returns the clean text without queueing', () => {
  const channel = createAgentChannel({ resolveProject: async () => undefined });
  assert.equal(checkSessionMessage(channel, 'p1', KEY, '  hi \n', true), 'hi');
  assert.throws(() => checkSessionMessage(channel, 'p1', KEY, 'hi', false), { code: 'unknown-session' });
  assert.equal(channel.get(KEY), undefined, 'a check does not create a channel record');
  channel.close();
});

test('the hook routes read panelProcess (only true counts) and the channel section shows external (M19)', async () => {
  const channel = createAgentChannel({ resolveProject: async () => undefined });
  const router = createRouter();
  const state = createStateRegistry();
  registerChannelRoutes({ router, state, channel });
  const prompt = async (panelProcess: unknown): Promise<void> => {
    const match = router.match('POST', '/api/hooks/prompt');
    if (match.kind !== 'found') throw new Error('no route');
    const res = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, writeHead: () => undefined, end: () => undefined });
    const body = { client: 'claude', input: { session_id: 's-mark', hook_event_name: 'UserPromptSubmit', prompt: 'x' }, panelProcess };
    const req = { socket: { remoteAddress: '127.0.0.1' } } as unknown as IncomingMessage;
    await match.handler({ method: 'POST', path: '/api/hooks/prompt', query: new URLSearchParams(), params: match.params, body, req, res: res as unknown as ServerResponse });
  };
  const external = (): unknown => channel.section().sessions.find((s) => s.key === 'claude:s-mark')?.external;
  await prompt(true);
  assert.equal(external(), false);
  await prompt('true');
  assert.equal(external(), true, 'a string is not the mark');
  await prompt(undefined);
  assert.equal(external(), true);
  await prompt(true);
  assert.equal(external(), false);
  channel.close();
});
