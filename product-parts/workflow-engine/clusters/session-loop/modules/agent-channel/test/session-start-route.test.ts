// M44 T002: POST /api/hooks/session-start — loopback only, the parsed hook input goes to the
// sessionStart option, the answer is in the client's dialect (kimi: { message }); a bad body is
// 400; without the option the route does not exist.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { test } from 'node:test';
import { HttpError, createRouter, createStateRegistry } from '#http-server';
import { createAgentChannel, registerChannelRoutes, sessionStartAnswer } from '../src/index.ts';
import type { HookInput } from '../src/index.ts';

const INPUT = { session_id: 's1', cwd: '/p/src', hook_event_name: 'SessionStart', source: 'startup' };
const LINE = 'Workflow Kit autopilot: mode=full, review=off; run=none.';

function setup(withOption = true) {
  const channel = createAgentChannel({ resolveProject: async () => undefined });
  const router = createRouter();
  const seen: HookInput[] = [];
  registerChannelRoutes({
    router, state: createStateRegistry(), channel,
    dialects: (client) => (client === 'kimi' ? 'kimi' : client === 'claude' || client === 'codex' ? 'claude' : undefined),
    ...(withOption ? { sessionStart: async (input: HookInput) => (seen.push(input), LINE) } : {}),
  });
  const post = async (body: unknown, address = '127.0.0.1'): Promise<{ status: number; body: unknown }> => {
    const match = router.match('POST', '/api/hooks/session-start');
    if (match.kind !== 'found') return { status: 404, body: null };
    try {
      const value = await match.handler({ method: 'POST', path: '/api/hooks/session-start', query: new URLSearchParams(), params: match.params, body, req: { socket: { remoteAddress: address } } as unknown as IncomingMessage, res: new EventEmitter() as unknown as ServerResponse });
      return { status: 200, body: value };
    } catch (error) {
      if (error instanceof HttpError) return { status: error.status, body: { code: error.code } };
      throw error;
    }
  };
  return { channel, post, seen };
}

test('the line comes back in the dialect of each client', async () => {
  const { channel, post, seen } = setup();
  const context = { continue: true, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: LINE } };
  assert.deepEqual(await post({ client: 'claude', input: INPUT, projectDir: '/p', panelProcess: false }), { status: 200, body: { answer: context } });
  assert.deepEqual(await post({ client: 'codex', input: INPUT, projectDir: null }), { status: 200, body: { answer: context } });
  assert.deepEqual(await post({ client: 'kimi', input: INPUT }), { status: 200, body: { answer: { message: LINE } } });
  assert.deepEqual(seen.map((input) => [input.client, input.sessionId, input.cwd, input.projectDir]), [['claude', 's1', '/p/src', '/p'], ['codex', 's1', '/p/src', null], ['kimi', 's1', '/p/src', null]]);
  assert.deepEqual(sessionStartAnswer('kimi', 'x'), { message: 'x' });
  channel.close();
});

test('loopback only, a bad body is 400, no option — no route', async () => {
  const { channel, post } = setup();
  assert.equal((await post({ client: 'claude', input: INPUT }, '192.168.1.5')).status, 403);
  assert.equal((await post({ client: 'claude', input: { cwd: '/p' } })).status, 400, 'no session_id');
  assert.equal((await post({ client: 'ghost', input: INPUT })).status, 400);
  channel.close();
  const bare = setup(false);
  assert.equal((await bare.post({ client: 'claude', input: INPUT })).status, 404);
  bare.channel.close();
});
