// A session archived or removed from the list in the panel leaves the Kit process (spec M22 2.8):
// its hooks are answered empty, it gets no message and it is in no list of the channel.
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { test } from 'node:test';
import { HttpError, createRouter, createStateRegistry } from '#http-server';
import { createAgentChannel, parseHookInput, registerChannelRoutes, sessionKey } from '../src/index.ts';
import type { AgentChannelOptions, HookDialects, HookInput, StopDecision } from '../src/index.ts';

const DIALECTS: HookDialects = (client) => (client === 'kimi' ? 'kimi' : client === 'claude' ? 'claude' : undefined);
const CWD = '/home/u/Projects/demo';
const hook = (client: 'claude' | 'kimi', id: string, event: 'Stop' | 'UserPromptSubmit'): HookInput =>
  parseHookInput(client, { session_id: id, cwd: CWD, hook_event_name: event, prompt: 'hi', last_assistant_message: 'done' }, undefined, DIALECTS)!;

function world(over: Partial<AgentChannelOptions> = {}) {
  const out = new Set<string>();
  const decided: string[] = [];
  const heard: string[] = [];
  const channel = createAgentChannel({
    resolveProject: async (folder) => (folder.startsWith(CWD) ? { id: 'p1' } : undefined),
    decide: (context): StopDecision => {
      decided.push(context.key);
      return { kind: 'hold', reason: 'waiting-for-mode-choice' };
    },
    excluded: (ref) => ref.projectId === 'p1' && out.has(ref.key),
    holdMs: 5_000,
    ...over,
  });
  channel.onStop((event) => heard.push(event.key));
  return { channel, out, decided, heard };
}

test('the hooks of an excluded session are answered empty and it is in no list', async () => {
  const { channel, out, decided, heard } = world();
  const key = sessionKey('claude', 'gone');
  out.add(key);
  const stop = await channel.stop(hook('claude', 'gone', 'Stop'));
  assert.equal(stop.answer, null);
  const prompt = await channel.prompt(hook('claude', 'gone', 'UserPromptSubmit'));
  assert.equal(prompt.answer, null);
  assert.deepEqual(decided, [], 'the decider is not asked');
  assert.deepEqual(heard, [], 'nobody hears its turn');
  assert.equal(channel.get(key), undefined);
  assert.deepEqual(channel.list(), []);
  assert.deepEqual(channel.section().sessions, []);
  assert.equal(channel.excluded(key), false, 'the slot is gone: without a project the session is not known');
  assert.equal(channel.excluded(key, 'p1'), true);
  channel.close();
});

test('a working session that is archived drops out of the lists at once (the stale Kimi turn)', async () => {
  const { channel, out } = world();
  const key = sessionKey('kimi', 'session_stale');
  await channel.prompt(hook('kimi', 'session_stale', 'UserPromptSubmit'));
  assert.equal(channel.get(key)?.state, 'working');
  out.add(key);
  assert.equal(channel.get(key), undefined, 'no turn end is needed to leave');
  assert.deepEqual(channel.section().sessions.map((s) => s.key), []);
  channel.close();
});

test('forget releases a held Stop with an empty answer', async () => {
  const { channel, out } = world();
  const key = sessionKey('claude', 'held');
  const pending = channel.stop(hook('claude', 'held', 'Stop'));
  for (let i = 0; i < 50 && channel.get(key)?.state !== 'holding'; i += 1) await new Promise((r) => setTimeout(r, 5));
  assert.equal(channel.get(key)?.holdReason, 'waiting-for-mode-choice');
  out.add(key);
  channel.forget(key);
  const reply = await pending;
  assert.equal(reply.answer, null);
  assert.equal(channel.get(key), undefined);
  channel.close();
});

test('a message for an excluded session is dropped; a returned session takes part again', async () => {
  const { channel, out } = world({ decide: () => ({ kind: 'release' }) });
  const key = sessionKey('claude', 'back');
  await channel.stop(hook('claude', 'back', 'Stop'));
  channel.enqueue(key, 'first', 'panel', 'p1');
  out.add(key);
  const dropped = channel.enqueue(key, 'second', 'review', 'p1');
  assert.deepEqual(channel.queued(key), []);
  assert.equal(channel.waiting(key, dropped.id), false);
  out.delete(key);
  assert.equal(channel.get(key), undefined, 'the queue went with the slot');
  await channel.stop(hook('claude', 'back', 'Stop'));
  assert.equal(channel.get(key)?.state, 'waiting', 'a returned session is back in the channel');
  channel.enqueue(key, 'third', 'panel', 'p1');
  assert.deepEqual(channel.queued(key).map((m) => m.text), ['third']);
  channel.close();
});

test('a turn end of an excluded detached session is taken and nothing is checked or sent', async () => {
  let checks = 0;
  const { channel, out } = world({
    detached: {
      supports: (client) => client === 'kimi',
      idle: async () => {
        checks += 1;
        return true;
      },
      lastAnswer: async () => 'answer',
      send: async () => true,
      maintainMs: 0,
    },
  });
  const key = sessionKey('kimi', 'session_x');
  out.add(key);
  assert.equal(await channel.turnEnd({ client: 'kimi', sessionId: 'session_x', cwd: CWD, event: 'Stop' }), true);
  assert.equal(checks, 0);
  assert.equal(channel.get(key), undefined);
  channel.close();
});

test('the panel message route answers 409 session-archived for an excluded session', async () => {
  const { channel, out } = world();
  const key = sessionKey('claude', 'gone');
  out.add(key);
  const router = createRouter();
  registerChannelRoutes({ router, state: createStateRegistry(), channel, owns: async () => true, direct: async () => true });
  const url = `/api/projects/p1/sessions/${key}/message`;
  const match = router.match('POST', url);
  if (match.kind !== 'found') throw new Error('no route');
  await assert.rejects(
    async () => match.handler({ method: 'POST', path: url, query: new URLSearchParams(), params: match.params, body: { text: 'hi' }, req: {} as IncomingMessage, res: {} as ServerResponse }),
    (error: unknown) => error instanceof HttpError && error.status === 409 && error.code === 'session-archived',
  );
  assert.deepEqual(channel.queued(key), []);
  channel.close();
});
