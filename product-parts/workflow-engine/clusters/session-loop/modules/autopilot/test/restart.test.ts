// M16 2.2: after a service restart the channel knows no session; plan commands carry the project
// so the service can wake the agent. A working session the project does not list blocks no choice.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgentChannel } from '#agent-channel';
import type { AgentChannel } from '#agent-channel';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { createAutopilot } from '../src/index.ts';

const KEY = 'claude:s1';

function fakeKit(phase: string) {
  const view = () => ({ plan: { phase, ownerSession: 's1' } });
  const runner = {
    installed: () => true,
    run: async (_root: string, args: string[]) =>
      args[0] === 'autopilot:status' ? { ok: true, result: { head: 'h', revision: 1, proposalPending: false } } : { ok: true, result: {} },
  } as unknown as KitRunner;
  const workflow = {
    get: () => view(),
    refresh: async () => view(),
    status: () => ({ execution: { strategy: 'sequential', ownerSession: 's1' } }),
  } as unknown as WorkflowState;
  return { runner, workflow };
}

test('a channel without the session gets the start and the choice with the project', async () => {
  for (const option of ['sequential', 'refine'] as const) {
    const { runner, workflow } = fakeKit('proposed');
    const channel = createAgentChannel({ resolveProject: async () => undefined, holdMs: 20_000 });
    try {
      const autopilot = createAutopilot({ runner, workflow, channel, projectPath: async () => '/p' });
      assert.equal(channel.get(KEY), undefined, 'a restarted service knows no session');
      await autopilot.choose('p', { session: KEY, generation: 1, option });
      assert.equal(channel.get(KEY)?.projectId, 'p', `${option}: the new session belongs to the project`);
    } finally {
      channel.close();
    }
  }
  const { runner, workflow } = fakeKit('ready');
  const channel = createAgentChannel({ resolveProject: async () => undefined, holdMs: 20_000 });
  try {
    const autopilot = createAutopilot({ runner, workflow, channel, projectPath: async () => '/p' });
    await autopilot.start('p', KEY);
    assert.equal(channel.get(KEY)?.projectId, 'p', 'the start message wakes a session of the project');
  } finally {
    channel.close();
  }
});

test('a working session the project does not list does not block the mode choice', async () => {
  const { runner, workflow } = fakeKit('proposed');
  const sent: Array<[string, string | undefined]> = [];
  const channel = {
    list: () => [
      { key: 'codex:stray', projectId: 'p', state: 'working' },
      { key: 'codex:reviewer', projectId: 'p', state: 'working' },
      { key: 'codex:other', projectId: 'q', state: 'working' },
    ],
    enqueue: (key: string, _text: string, _source: string, projectId?: string) => ({ id: `m${sent.push([key, projectId])}` }),
  } as unknown as AgentChannel;
  const asked: string[][] = [];
  const review = {
    decide: async () => null,
    isReviewer: () => false,
    choiceBlocked: async (_projectId: string, working: readonly string[]) => (asked.push([...working]), null),
  };
  const owns = async (_projectId: string, key: string) => {
    if (key === 'codex:reviewer') throw new Error('provider is down');
    return key !== 'codex:stray';
  };
  const autopilot = createAutopilot({ runner, workflow, channel, projectPath: async () => '/p', review, owns });
  await autopilot.choose('p', { session: KEY, generation: 1, option: 'sequential' });
  assert.deepEqual(asked, [['codex:reviewer']], 'the stray session is left out; an unknown answer keeps the session');
  assert.deepEqual(sent, [[KEY, 'p']]);
});
