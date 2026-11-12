// The choice between the direct path and the channel queue for a panel message (M18 section 2.5).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ActivityState, SessionActivity } from '#agent-channel';
import type { Project } from '#project-registry';
import { createStubProvider } from '#provider-registry';
import type { Provider } from '#provider-registry';
import { createDirectMessage } from '../src/direct-message.ts';

const PROJECT = { id: 'p1', path: '/home/u/Projects/demo' } as Project;
const activity = (state: ActivityState): SessionActivity => ({ key: 'alpha:s1', client: 'alpha', sessionId: 's1', projectId: 'p1', state }) as SessionActivity;

interface World {
  calls: Array<[string, string, string]>;
  lines: string[];
  direct: ReturnType<typeof createDirectMessage>;
}

function world(options: { state?: ActivityState; send?: Provider['sendDirect'] | null; sendMessage?: boolean; project?: Project | undefined } = {}): World {
  const calls: World['calls'] = [];
  const lines: string[] = [];
  const provider: Provider = { ...createStubProvider({ id: 'alpha', title: 'Alpha', task: 'T000' }) };
  const send = options.send === undefined ? async () => true : options.send;
  if (send) {
    provider.sendDirect = (project, sessionId, text) => {
      calls.push([project.id, sessionId, text]);
      return send(project, sessionId, text);
    };
  }
  if (options.sendMessage) provider.sendMessage = async () => true;
  const project = 'project' in options ? options.project : PROJECT;
  const direct = createDirectMessage({
    activity: () => (options.state ? activity(options.state) : undefined),
    provider: (id) => (id === 'alpha' ? provider : undefined),
    project: async (id) => (id === 'p1' ? project : undefined),
    log: (line) => lines.push(line),
  });
  return { calls, lines, direct };
}

test('a waiting session gets the text through sendDirect with the session id after the first colon', async () => {
  const w = world({ state: 'waiting' });
  assert.equal(await w.direct('p1', 'alpha:s1:part', 'hello'), true);
  assert.deepEqual(w.calls, [['p1', 's1:part', 'hello']]);
});

test('a session unknown to the channel (after a restart) also goes the direct way', async () => {
  const w = world();
  assert.equal(await w.direct('p1', 'alpha:s1', 'hello'), true);
  assert.equal(w.calls.length, 1);
});

test('working and holding sessions keep the queue path without a call', async () => {
  for (const state of ['working', 'holding'] as const) {
    const w = world({ state });
    assert.equal(await w.direct('p1', 'alpha:s1', 'hello'), false);
    assert.deepEqual(w.calls, []);
  }
});

test('a provider with sendMessage, without sendDirect or an unknown provider is not called', async () => {
  const withMessage = world({ state: 'waiting', sendMessage: true });
  assert.equal(await withMessage.direct('p1', 'alpha:s1', 'hello'), false);
  assert.deepEqual(withMessage.calls, []);
  const without = world({ state: 'waiting', send: null });
  assert.equal(await without.direct('p1', 'alpha:s1', 'hello'), false);
  const unknown = world({ state: 'waiting' });
  assert.equal(await unknown.direct('p1', 'beta:s1', 'hello'), false);
  assert.equal(await unknown.direct('p1', 'no-colon', 'hello'), false);
  assert.deepEqual(unknown.calls, []);
});

test('an unknown project is not called', async () => {
  const w = world({ state: 'waiting' });
  assert.equal(await w.direct('p2', 'alpha:s1', 'hello'), false);
  assert.deepEqual(w.calls, []);
});

test('a refusal of sendDirect gives false; an error is logged and gives false', async () => {
  const refused = world({ state: 'waiting', send: async () => false });
  assert.equal(await refused.direct('p1', 'alpha:s1', 'hello'), false);
  assert.equal(refused.calls.length, 1);
  assert.deepEqual(refused.lines, []);
  const failed = world({
    state: 'waiting',
    send: async () => {
      throw new Error('boom');
    },
  });
  assert.equal(await failed.direct('p1', 'alpha:s1', 'hello'), false);
  assert.equal(failed.lines.length, 1);
  assert.match(failed.lines[0]!, /alpha:s1.*boom/);
});
