// The orchestration capability of a provider (spec M8 section 5): a session of a provider without
// it never gets the orchestrated mode, whatever the panel sent. Since M10 every provider of Kit has
// it; the provider `other` here stands for one that has not.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AgentChannel } from '#agent-channel';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { EXECUTOR_HOWTO, START_MESSAGES, WorkflowActionError, createAutopilot, executorHowto } from '../src/index.ts';

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
      return client === 'other' ? { available: false, reason: 'Other не запускает исполнителей в отдельных worktree' } : { available: true };
    },
  });
  await assert.rejects(
    autopilot.choose('p', { session: 'other:s1', generation: 1, option: 'orchestrated' }),
    (error: unknown) =>
      error instanceof WorkflowActionError &&
      error.code === 'orchestration-unavailable' &&
      error.status === 409 &&
      /Оркестрация недоступна: Other не запускает исполнителей/.test(error.message),
  );
  assert.deepEqual(ran, [], 'no Kit command ran');
  assert.deepEqual(asked, ['other']);
  // The other modes and the other providers are not asked or pass the check and reach Kit.
  await assert.rejects(autopilot.choose('p', { session: 'other:s1', generation: 1, option: 'sequential' }), (error: unknown) => !(error instanceof WorkflowActionError && error.code === 'orchestration-unavailable'));
  assert.equal(ran.length, 1, 'the sequential choice reached Kit');
  assert.deepEqual(asked, ['other'], 'sequential needs no capability');
  await assert.rejects(autopilot.choose('p', { session: 'codex:t1', generation: 1, option: 'orchestrated' }), (error: unknown) => !(error instanceof WorkflowActionError && error.code === 'orchestration-unavailable'));
  assert.deepEqual(asked, ['other', 'codex']);
});

test('a session without orchestration is told so in the sequential texts; the others are not', async () => {
  const sent: Array<{ key: string; text: string }> = [];
  const autopilot = createAutopilot({
    runner: { run: async () => ({ ok: true, result: {} }), installed: () => false } as unknown as KitRunner,
    workflow: { refresh: async () => null, status: () => null } as unknown as WorkflowState,
    channel: { list: () => [], enqueue: (key: string, text: string) => ({ id: String(sent.push({ key, text })) }) } as unknown as AgentChannel,
    projectPath: async () => '/nowhere',
    orchestration: async (client) => (client === 'other' ? { available: false, reason: 'нет исполнителей' } : { available: true }),
  });
  for (const key of ['other:s1', 'codex:t1']) {
    await autopilot.choose('p', { session: key, generation: 1, option: 'sequential' });
    await autopilot.start('p', key);
  }
  const note = /run a scope only sequentially: orchestration is not started from here\. Never run `scripts\/workflow assignment:\*` or `integration:\*`/;
  assert.deepEqual(sent.map((message) => [message.key, note.test(message.text)]), [
    ['other:s1', true],
    ['other:s1', true],
    ['codex:t1', false],
    ['codex:t1', false],
  ]);
  assert.match(sent[0]!.text, /execution mode chosen: sequential.*Sessions of this app \(other\)/s);
  assert.match(sent[1]!.text, /Execution mode: sequential.*Sessions of this app \(other\)/s);
});

test('a Kimi session orchestrates (spec M10): the start and every continue carry the Kimi executor procedure', async () => {
  const kimi = EXECUTOR_HOWTO['kimi'];
  assert.ok(kimi);
  assert.equal(kimi.repeat, true, 'Kimi reads AGENTS.md only at the start of its session');
  assert.equal(executorHowto('kimi:session_k1'), kimi.text);
  assert.match(kimi.text, /git worktree add --detach \.workflow-kit\/local\/worktrees\/<assignment id> <baseCommit>/);
  assert.match(kimi.text, /Agent tool in the foreground \(no run_in_background\)/);
  assert.match(kimi.text, /pass it as cwd to every Bash call/);
  assert.match(kimi.text, /several Agent calls in one message/);
  assert.match(kimi.text, /do not use AgentSwarm/);
  assert.match(kimi.text, /integration:start --id <assignment id> --source <sha>/);
  assert.match(START_MESSAGES.orchestrated, /subagents of your app/);
});
