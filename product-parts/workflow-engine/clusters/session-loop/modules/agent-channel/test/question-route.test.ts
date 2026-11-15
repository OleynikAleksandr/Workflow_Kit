// POST /api/hooks/question (spec M33 section 2.3): loopback only, the request of the body goes to the
// question option with a signal that ends with the HTTP request; a bad body is 400; without the
// option the route does not exist.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { test } from 'node:test';
import { HttpError, createRouter, createStateRegistry } from '#http-server';
import type { QuestionHookRequest } from '#provider-registry';
import { createAgentChannel, registerChannelRoutes } from '../src/index.ts';
import { questionHookRequest } from '../src/routes.ts';

const WAITER = '0b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b';
const INPUT = { session_id: 's1', transcript_path: '/t/s1.jsonl', cwd: '/p', hook_event_name: 'PermissionRequest', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'Q?' }] } };

function setup(question?: (request: QuestionHookRequest, signal: AbortSignal) => Promise<never | { wait: true } | { release: true }>) {
  const channel = createAgentChannel({ resolveProject: async () => undefined });
  const router = createRouter();
  registerChannelRoutes({ router, state: createStateRegistry(), channel, ...(question ? { question } : {}) });
  const post = async (body: unknown, address = '127.0.0.1', res: EventEmitter = new EventEmitter()): Promise<{ status: number; body: unknown }> => {
    const match = router.match('POST', '/api/hooks/question');
    if (match.kind !== 'found') return { status: 404, body: null };
    try {
      const value = await match.handler({ method: 'POST', path: '/api/hooks/question', query: new URLSearchParams(), params: match.params, body, req: { socket: { remoteAddress: address } } as unknown as IncomingMessage, res: res as unknown as ServerResponse });
      return { status: 200, body: value };
    } catch (error) {
      if (error instanceof HttpError) return { status: error.status, body: { code: error.code } };
      throw error;
    }
  };
  return { channel, post };
}

test('the request reaches the question option with the hook fields; the signal ends with the HTTP request', async () => {
  const seen: QuestionHookRequest[] = [];
  let signal: AbortSignal | undefined;
  const { channel, post } = setup(async (request, s) => {
    seen.push(request);
    signal = s;
    return { wait: true };
  });
  const res = new EventEmitter();
  const reply = await post({ client: 'claude', input: INPUT, projectDir: '/p', panelProcess: true, waiterId: WAITER }, '127.0.0.1', res);
  assert.deepEqual(reply, { status: 200, body: { wait: true } });
  assert.deepEqual(seen, [{ client: 'claude', sessionId: 's1', transcriptPath: '/t/s1.jsonl', cwd: '/p', projectDir: '/p', waiterId: WAITER, toolName: 'AskUserQuestion', toolInput: INPUT.tool_input }]);
  assert.equal(signal?.aborted, false);
  res.emit('close');
  assert.equal(signal?.aborted, true);
  channel.close();
});

test('loopback only, a bad body is 400, no option — no route', async () => {
  const { channel, post } = setup(async () => ({ release: true }));
  assert.equal((await post({ client: 'claude', input: INPUT, waiterId: WAITER }, '192.168.1.5')).status, 403);
  assert.equal((await post({ client: 'claude', input: INPUT, waiterId: 'not-a-uuid' })).status, 400);
  assert.equal((await post({ client: 'claude', input: { tool_name: 'AskUserQuestion' }, waiterId: WAITER })).status, 400, 'no session_id');
  assert.equal((await post({ client: 'Bad Client', input: INPUT, waiterId: WAITER })).status, 400);
  channel.close();
  const bare = setup();
  assert.equal((await bare.post({ client: 'claude', input: INPUT, waiterId: WAITER })).status, 404);
  bare.channel.close();
  assert.equal(questionHookRequest({ client: 'claude', input: { ...INPUT, tool_name: 7 }, waiterId: WAITER })?.toolName, null);
});
