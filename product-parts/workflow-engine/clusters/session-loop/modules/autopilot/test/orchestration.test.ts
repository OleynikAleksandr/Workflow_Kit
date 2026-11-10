// The orchestration capability of a provider (spec M8 section 5): a session of a provider without
// it never gets the orchestrated mode, whatever the panel sent.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AgentChannel } from '#agent-channel';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { WorkflowActionError, createAutopilot } from '../src/index.ts';

test('choose refuses orchestrated for a provider without orchestration, before any Kit command', async () => {
  const ran: string[][] = [];
  const asked: string[] = [];
  const autopilot = createAutopilot({
    // Kit is reached only by a choice that passed the capability check: it fails loudly here.
    runner: { run: async (_root: string, args: string[]) => { ran.push(args); throw new Error('kit must not run'); } } as unknown as KitRunner,
    workflow: {} as WorkflowState,
    channel: { list: () => [] } as unknown as AgentChannel,
    projectPath: async () => '/nowhere',
    orchestration: async (client) => {
      asked.push(client);
      return client === 'kimi' ? { available: false, reason: 'Kimi Code не запускает исполнителей в отдельных worktree' } : { available: true };
    },
  });
  await assert.rejects(
    autopilot.choose('p', { session: 'kimi:session_k1', generation: 1, option: 'orchestrated' }),
    (error: unknown) =>
      error instanceof WorkflowActionError &&
      error.code === 'orchestration-unavailable' &&
      error.status === 409 &&
      /Оркестрация недоступна: Kimi Code не запускает исполнителей/.test(error.message),
  );
  assert.deepEqual(ran, [], 'no Kit command ran');
  assert.deepEqual(asked, ['kimi']);
  // The other modes and the other providers are not asked or pass the check and reach Kit.
  await assert.rejects(autopilot.choose('p', { session: 'kimi:session_k1', generation: 1, option: 'sequential' }), (error: unknown) => !(error instanceof WorkflowActionError && error.code === 'orchestration-unavailable'));
  assert.equal(ran.length, 1, 'the sequential choice reached Kit');
  assert.deepEqual(asked, ['kimi'], 'sequential needs no capability');
  await assert.rejects(autopilot.choose('p', { session: 'codex:t1', generation: 1, option: 'orchestrated' }), (error: unknown) => !(error instanceof WorkflowActionError && error.code === 'orchestration-unavailable'));
  assert.deepEqual(asked, ['kimi', 'codex']);
});

test('a session without orchestration is told so in the sequential texts; the others are not', async () => {
  const sent: Array<{ key: string; text: string }> = [];
  const autopilot = createAutopilot({
    runner: { run: async () => ({ ok: true, result: {} }), installed: () => false } as unknown as KitRunner,
    workflow: { refresh: async () => null, status: () => null } as unknown as WorkflowState,
    channel: { list: () => [], enqueue: (key: string, text: string) => void sent.push({ key, text }) } as unknown as AgentChannel,
    projectPath: async () => '/nowhere',
    orchestration: async (client) => (client === 'kimi' ? { available: false, reason: 'нет исполнителей' } : { available: true }),
  });
  for (const key of ['kimi:session_k1', 'codex:t1']) {
    await autopilot.choose('p', { session: key, generation: 1, option: 'sequential' });
    await autopilot.start('p', key);
  }
  const note = /run a scope only sequentially: orchestration is not started from here\. Never run `scripts\/workflow assignment:\*` or `integration:\*`/;
  assert.deepEqual(sent.map((message) => [message.key, note.test(message.text)]), [
    ['kimi:session_k1', true],
    ['kimi:session_k1', true],
    ['codex:t1', false],
    ['codex:t1', false],
  ]);
  assert.match(sent[0]!.text, /execution mode chosen: sequential.*Sessions of this app \(kimi\)/s);
  assert.match(sent[1]!.text, /Execution mode: sequential.*Sessions of this app \(kimi\)/s);
});
